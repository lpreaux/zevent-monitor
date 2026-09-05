/**
 * Sélection et mise en contexte du streamer mis en avant sur l'écran secondaire.
 *
 * Sans React ni React Native pour rester testable : l'écran AlwaysOn se contente
 * d'appeler ces fonctions avec l'état courant.
 */

import type { StreamerSeriesPoint } from '@/api/donations';
import type { Goal, PlanningEntry, Streamer } from '@/api/types';
import { entryStatus } from './planning';
import { recentDeltaEur, toElapsedSeries, type RawPoint } from './timeseries';

/**
 * Favoris présents dans l'état officiel, en live d'abord puis par cagnotte
 * décroissante. C'est aussi l'ordre de rotation du mode Focus : un écran secondaire
 * doit montrer en premier ceux qui diffusent réellement.
 */
export function orderFavorites(live: Streamer[], favorites: string[]): Streamer[] {
  const wanted = new Set(favorites.map((f) => f.toLowerCase()));
  return live
    .filter((s) => wanted.has(s.twitch.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) || b.donationAmount.number - a.donationAmount.number,
    );
}

/**
 * Streamer à afficher en Focus : celui épinglé s'il est toujours dans la liste,
 * sinon le premier de l'ordre de rotation (donc un live si tant est qu'il y en ait un).
 */
export function resolveFocus(order: Streamer[], focusTwitch: string | null): Streamer | undefined {
  if (order.length === 0) return undefined;
  if (focusTwitch) {
    const login = focusTwitch.toLowerCase();
    const pinned = order.find((s) => s.twitch.toLowerCase() === login);
    if (pinned) return pinned;
  }
  return order[0];
}

/** Login du favori suivant (`direction = 1`) ou précédent, avec bouclage. */
export function stepFocus(
  order: Streamer[],
  currentTwitch: string | null,
  direction: 1 | -1,
): string | null {
  if (order.length === 0) return null;
  const login = (currentTwitch ?? '').toLowerCase();
  const index = order.findIndex((s) => s.twitch.toLowerCase() === login);
  const from = index >= 0 ? index : 0;
  const next = (from + direction + order.length) % order.length;
  return order[next].twitch.toLowerCase();
}

export interface StreamerStanding {
  /** Rang par cagnotte personnelle, à partir de 1. */
  donationRank: number;
  /** Rang par viewers parmi les streamers en live, `null` si hors ligne. */
  viewersRank: number | null;
  /** Nombre de streamers inscrits, pour afficher « 12ᵉ / 250 ». */
  total: number;
  /** Part de la cagnotte globale, dans `[0, 1]`, `null` si le global est inconnu. */
  share: number | null;
}

/** Position du streamer parmi l'ensemble des participants. */
export function streamerStanding(
  live: Streamer[],
  streamer: Streamer,
  globalDonationEuros: number | undefined,
): StreamerStanding {
  const raised = streamer.donationAmount.number;
  const donationRank = live.filter((s) => s.donationAmount.number > raised).length + 1;

  let viewersRank: number | null = null;
  if (streamer.online) {
    const viewers = streamer.viewersAmount.number;
    viewersRank =
      live.filter((s) => s.online && s.viewersAmount.number > viewers).length + 1;
  }

  const share =
    globalDonationEuros && globalDonationEuros > 0 ? raised / globalDonationEuros : null;

  return { donationRank, viewersRank, total: live.length, share };
}

export interface GoalProgressSummary {
  goal: Goal;
  /** Objectif du palier, en euros. */
  target: number;
  /** Montant restant avant de l'atteindre, en euros. */
  remaining: number;
  /** Progression vers ce palier, dans `[0, 1]`. */
  ratio: number;
  /** Nombre de paliers déjà franchis. */
  reachedCount: number;
  total: number;
}

/**
 * Prochain palier du streamer. L'état « atteint » est recalculé sur la cagnotte
 * officielle plutôt que sur le champ `reached` du snapshot, comme dans `GoalProgress`.
 */
export function nextGoalProgress(
  goals: Goal[],
  raisedEuros: number,
): GoalProgressSummary | null {
  if (goals.length === 0) return null;
  const sorted = [...goals].sort((a, b) => a.amountCents - b.amountCents);
  const reachedCount = sorted.filter((g) => raisedEuros >= g.amountCents / 100).length;
  const goal = sorted[reachedCount];
  if (!goal) return null;

  const target = goal.amountCents / 100;
  const previous = reachedCount > 0 ? sorted[reachedCount - 1].amountCents / 100 : 0;
  const span = target - previous;
  return {
    goal,
    target,
    remaining: Math.max(target - raisedEuros, 0),
    ratio: span > 0 ? Math.min(Math.max((raisedEuros - previous) / span, 0), 1) : 0,
    reachedCount,
    total: sorted.length,
  };
}

/** Entrées de planning auxquelles le streamer participe, chronologiquement. */
export function entriesForStreamer(entries: PlanningEntry[], twitch: string): PlanningEntry[] {
  const login = twitch.toLowerCase();
  return entries
    .filter((entry) =>
      entry.participants.some((p) => (p.twitch ?? '').toLowerCase() === login),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export interface PlanningFocus {
  current: PlanningEntry | null;
  next: PlanningEntry | null;
}

/** Show en cours et show suivant, dans une liste déjà filtrée ou non. */
export function planningFocus(entries: PlanningEntry[], now: number): PlanningFocus {
  const sorted = [...entries].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current = sorted.find((entry) => entryStatus(entry, now) === 'live') ?? null;
  const next = sorted.find((entry) => entryStatus(entry, now) === 'upcoming') ?? null;
  return { current, next };
}

/**
 * Progression d'un streamer sur les `windowMinutes` dernières minutes, à partir de sa
 * courbe (`GET /v1/timeseries/streamers`). On aligne sur le premier point disponible et
 * non sur le seuil d'ouverture de la collecte globale : une cagnotte personnelle peut
 * rester bien en dessous toute l'édition.
 *
 * `currentEur` (la valeur de l'état officiel, plus fraîche que le dernier point agrégé)
 * sert de borne haute, comme pour la cagnotte globale.
 */
export function recentStreamerDeltaEur(
  points: Pick<StreamerSeriesPoint, 'bucket' | 'eur'>[],
  windowMinutes: number,
  currentEur?: number,
): number | null {
  const raw: RawPoint[] = points
    .map((point) => ({ t: Date.parse(point.bucket), eur: point.eur }))
    .filter((point) => Number.isFinite(point.t));
  if (raw.length < 2) return null;
  return recentDeltaEur(toElapsedSeries(raw, 0).points, windowMinutes, currentEur);
}
