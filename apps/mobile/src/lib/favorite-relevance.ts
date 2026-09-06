/**
 * Classement de pertinence des favoris.
 *
 * L'accueil ne montre qu'une poignée de favoris : encore faut-il montrer les bons.
 * Le score combine ce que fait le streamer (en live, progression de sa cagnotte,
 * audience, show au planning) et ce que fait l'utilisateur (fiches ouvertes, streams
 * lancés, pages de don visitées). Aucun import React ni React Native : tout est testable.
 */

import type { Streamer } from '@/api/types';

export type AffinityEvent = 'detail' | 'twitch' | 'donation';

/** Poids d'un signal d'intérêt : lancer le stream ou ouvrir la page de don en dit plus que consulter la fiche. */
export const AFFINITY_WEIGHTS: Record<AffinityEvent, number> = {
  detail: 1,
  twitch: 3,
  donation: 5,
};

/** Demi-vie de l'affinité : un signal ne pèse plus que la moitié huit heures plus tard. */
export const AFFINITY_HALF_LIFE_MS = 8 * 3_600_000;

/** Demi-vie du bonus « je viens de l'ouvrir », bien plus court : il s'efface en une heure. */
export const RECENCY_HALF_LIFE_MS = 45 * 60_000;

/** En dessous de ce score amorti, l'entrée n'influence plus rien et peut être oubliée. */
export const AFFINITY_FORGET_THRESHOLD = 0.05;

export interface AffinityEntry {
  /** Somme des poids, amortie à la date `updatedAt`. */
  score: number;
  /** Horodatage de la dernière interaction (ms epoch). */
  updatedAt: number;
}

function halfLifeFactor(elapsedMs: number, halfLifeMs: number): number {
  return 0.5 ** (Math.max(elapsedMs, 0) / halfLifeMs);
}

/** Score d'affinité ramené à `now` : il décroît tout seul entre deux interactions. */
export function decayedAffinity(entry: AffinityEntry | undefined, now: number): number {
  if (!entry) return 0;
  return entry.score * halfLifeFactor(now - entry.updatedAt, AFFINITY_HALF_LIFE_MS);
}

/** Nouvelle entrée d'affinité après une interaction, l'ancienne étant d'abord amortie. */
export function noteAffinity(
  entry: AffinityEntry | undefined,
  event: AffinityEvent,
  now: number,
): AffinityEntry {
  return { score: decayedAffinity(entry, now) + AFFINITY_WEIGHTS[event], updatedAt: now };
}

/** Écarte les entrées devenues négligeables : le journal d'affinité ne grossit pas indéfiniment. */
export function pruneAffinity(
  entries: Record<string, AffinityEntry>,
  now: number,
): Record<string, AffinityEntry> {
  const kept: Record<string, AffinityEntry> = {};
  for (const [login, entry] of Object.entries(entries)) {
    if (decayedAffinity(entry, now) >= AFFINITY_FORGET_THRESHOLD) kept[login] = entry;
  }
  return kept;
}

/** Signal dominant derrière le classement, affiché tel quel à l'utilisateur. */
export type RelevanceReason = 'recent' | 'affinity' | 'momentum' | 'planning' | 'audience';

export interface FavoriteSignals {
  streamer: Streamer;
  /** Progression de la cagnotte sur la fenêtre courte (centimes), 0 si le backend ne la connaît pas. */
  deltaCents?: number;
  affinity?: AffinityEntry;
  /** Le streamer participe à un show du planning actuellement en cours. */
  planningLive?: boolean;
}

export interface ScoredFavorite {
  streamer: Streamer;
  score: number;
  deltaCents: number;
  /** `null` quand aucun signal ne ressort : mieux vaut ne rien dire qu'une explication tiède. */
  reason: RelevanceReason | null;
}

/**
 * Poids des composantes. « live » domine tout : un favori qui diffuse passe devant un
 * favori éteint, quel que soit le reste. Les autres composantes sont normalisées entre
 * 0 et 1 sur l'ensemble des favoris, ce qui évite d'inventer des seuils en euros.
 */
const WEIGHTS = {
  live: 2,
  affinity: 1.2,
  recent: 0.8,
  momentum: 0.9,
  planning: 0.6,
  audience: 0.5,
  raised: 0.35,
} as const;

/** En dessous de cette contribution, le signal est trop faible pour être annoncé. */
const REASON_THRESHOLD = 0.12;

/**
 * Repères absolus des composantes, pour qu'un signal minuscule ne prenne pas toute la
 * place faute de concurrent : ils servent de plancher aux normalisations relatives.
 * Sans eux, un unique favori avec un centime de progression obtiendrait le score maximal.
 */
const AFFINITY_SATURATION = 4;
const MOMENTUM_FLOOR_CENTS = 5_000;
const AUDIENCE_FLOOR_VIEWERS = 1_000;

/** Courbe saturante sur une échelle absolue : croissante, jamais au-delà de 1. */
function saturate(value: number, scale: number): number {
  const positive = Math.max(value, 0);
  return positive / (positive + scale);
}

function ratio(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value / max, 0), 1);
}

/** Normalisation logarithmique : 30 000 viewers ne doivent pas écraser 8 000. */
function logRatio(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.log1p(Math.max(value, 0)) / Math.log1p(max);
}

/**
 * Trie les favoris du plus pertinent au moins pertinent. Les live sortent en tête par
 * construction ; l'appelant reste libre de scinder les deux groupes à l'affichage.
 */
export function rankFavorites(signals: FavoriteSignals[], now: number): ScoredFavorite[] {
  const affinities = signals.map((signal) => decayedAffinity(signal.affinity, now));
  const maxDelta = Math.max(
    MOMENTUM_FLOOR_CENTS,
    ...signals.map((s) => Math.max(s.deltaCents ?? 0, 0)),
  );
  const maxViewers = Math.max(
    AUDIENCE_FLOOR_VIEWERS,
    ...signals.map((s) => s.streamer.viewersAmount.number),
  );
  const maxRaised = Math.max(0, ...signals.map((s) => s.streamer.donationAmount.number));

  return signals
    .map((signal, index) => {
      const { streamer } = signal;
      const deltaCents = Math.max(signal.deltaCents ?? 0, 0);
      const recency = signal.affinity
        ? halfLifeFactor(now - signal.affinity.updatedAt, RECENCY_HALF_LIFE_MS)
        : 0;

      const parts = {
        affinity: WEIGHTS.affinity * saturate(affinities[index], AFFINITY_SATURATION),
        recent: WEIGHTS.recent * recency,
        momentum: WEIGHTS.momentum * ratio(deltaCents, maxDelta),
        planning: signal.planningLive ? WEIGHTS.planning : 0,
        audience: streamer.online
          ? WEIGHTS.audience * logRatio(streamer.viewersAmount.number, maxViewers)
          : 0,
      } satisfies Record<RelevanceReason, number>;

      const score =
        (streamer.online ? WEIGHTS.live : 0) +
        WEIGHTS.raised * ratio(streamer.donationAmount.number, maxRaised) +
        Object.values(parts).reduce((sum, part) => sum + part, 0);

      const best = (Object.entries(parts) as [RelevanceReason, number][])
        .sort(([, a], [, b]) => b - a)
        .find(([, value]) => value >= REASON_THRESHOLD);

      return { streamer, score, deltaCents, reason: best ? best[0] : null };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.streamer.donationAmount.number - a.streamer.donationAmount.number ||
        a.streamer.display.localeCompare(b.streamer.display, 'fr'),
    );
}
