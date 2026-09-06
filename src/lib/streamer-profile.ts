/**
 * Portrait d'un streamer : sa place dans le classement, ses paliers, ses passages au
 * planning, la tranche de courbe qu'on regarde. Rien de spécifique à un écran — la fiche
 * de détail, l'écran secondaire et les cartes de l'accueil décrivent le même objet.
 *
 * Sans React ni React Native, pour rester testable sans monter de composant.
 */

import type { StreamerSeriesPoint } from '@/api/donations';
import type { Goal, PlanningEntry, Streamer } from '@/api/types';
import { formatEuros, formatPercent, formatRank, twitchLinks } from './format';
import { entryEnd, entryStart, entryStatus } from './planning';
import { recentDeltaEur, toElapsedSeries, type RawPoint } from './timeseries';

export interface StreamerStanding {
  /** Rang par cagnotte personnelle, à partir de 1. */
  donationRank: number;
  /** Rang par viewers parmi les streamers en live, `null` si hors ligne. */
  viewersRank: number | null;
  /** Nombre de streamers inscrits, pour afficher « 12ᵉ / 250 ». */
  total: number;
  /** Part de la cagnotte globale, dans `[0, 1]`, `null` si le global est inconnu. */
  share: number | null;
  /** Euros qui séparent du streamer juste devant, `null` en tête de classement. */
  behindEuros: number | null;
  /** Euros d'avance sur le streamer juste derrière, `null` en fin de classement. */
  aheadEuros: number | null;
}

/**
 * Position du streamer parmi l'ensemble des participants.
 *
 * Les écarts avec les voisins immédiats comptent autant que le rang lui-même : « 12ᵉ » ne
 * dit pas si la place se joue à 200 € ou à 40 000 €, et c'est pourtant ce qui rend un
 * classement vivant pendant le week-end.
 */
export function streamerStanding(
  live: Streamer[],
  streamer: Streamer,
  globalDonationEuros: number | undefined,
): StreamerStanding {
  const raised = streamer.donationAmount.number;
  let donationRank = 1;
  let behindEuros: number | null = null;
  let aheadEuros: number | null = null;

  for (const other of live) {
    const amount = other.donationAmount.number;
    if (amount > raised) {
      donationRank += 1;
      // Le voisin de devant est le plus petit des montants supérieurs.
      if (behindEuros === null || amount - raised < behindEuros) behindEuros = amount - raised;
    } else if (amount < raised) {
      if (aheadEuros === null || raised - amount < aheadEuros) aheadEuros = raised - amount;
    }
  }

  let viewersRank: number | null = null;
  if (streamer.online) {
    const viewers = streamer.viewersAmount.number;
    viewersRank = live.filter((s) => s.online && s.viewersAmount.number > viewers).length + 1;
  }

  const share =
    globalDonationEuros && globalDonationEuros > 0 ? raised / globalDonationEuros : null;

  return { donationRank, viewersRank, total: live.length, share, behindEuros, aheadEuros };
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

export interface GoalSplit {
  /** Paliers franchis, du plus petit au plus grand. */
  reached: Goal[];
  /** Prochain palier à franchir, `null` quand ils sont tous atteints. */
  next: GoalProgressSummary | null;
  /** Paliers situés au-delà du prochain, dans l'ordre. */
  later: Goal[];
}

/**
 * Répartit les paliers d'un streamer autour de sa cagnotte : ce qui est fait, ce qui se
 * joue maintenant, ce qui reste. L'état « atteint » est recalculé sur la cagnotte
 * officielle plutôt que lu dans le champ `reached` du snapshot, qui vieillit entre deux
 * synchronisations de la source communautaire.
 */
export function splitGoals(goals: Goal[], raisedEuros: number): GoalSplit {
  const sorted = [...goals].sort((a, b) => a.amountCents - b.amountCents);
  const reached = sorted.filter((goal) => raisedEuros >= goal.amountCents / 100);
  const goal = sorted[reached.length];

  if (!goal) return { reached, next: null, later: [] };

  const target = goal.amountCents / 100;
  // La progression se mesure depuis le palier précédent, pas depuis zéro : entre deux
  // paliers serrés, repartir de zéro afficherait 98 % pendant toute la montée.
  const previous = reached.length > 0 ? reached[reached.length - 1].amountCents / 100 : 0;
  const span = target - previous;

  return {
    reached,
    next: {
      goal,
      target,
      remaining: Math.max(target - raisedEuros, 0),
      ratio: span > 0 ? Math.min(Math.max((raisedEuros - previous) / span, 0), 1) : 0,
      reachedCount: reached.length,
      total: sorted.length,
    },
    later: sorted.slice(reached.length + 1),
  };
}

/** Prochain palier du streamer, sans le reste du découpage. */
export function nextGoalProgress(goals: Goal[], raisedEuros: number): GoalProgressSummary | null {
  return splitGoals(goals, raisedEuros).next;
}

/** Entrées de planning auxquelles le streamer participe, chronologiquement. */
export function entriesForStreamer(entries: PlanningEntry[], twitch: string): PlanningEntry[] {
  const login = twitch.toLowerCase();
  return entries
    .filter((entry) => entry.participants.some((p) => (p.twitch ?? '').toLowerCase() === login))
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

export interface StreamerSchedule {
  /** Émissions en cours, celle qui se termine le plus tôt en tête. */
  live: PlanningEntry[];
  /** Émissions à venir, dans l'ordre de passage. */
  upcoming: PlanningEntry[];
  /** Émissions terminées, la plus récente en tête : on remonte le temps en dépliant. */
  past: PlanningEntry[];
}

/** Le week-end d'un streamer au planning, rangé autour de l'instant présent. */
export function streamerSchedule(
  entries: PlanningEntry[],
  twitch: string,
  now: number,
): StreamerSchedule {
  const mine = entriesForStreamer(entries, twitch);
  return {
    live: mine
      .filter((entry) => entryStatus(entry, now) === 'live')
      .sort((a, b) => entryEnd(a) - entryEnd(b)),
    upcoming: mine.filter((entry) => entryStatus(entry, now) === 'upcoming'),
    past: mine
      .filter((entry) => entryStatus(entry, now) === 'past')
      .sort((a, b) => entryStart(b) - entryStart(a)),
  };
}

/**
 * Dernier relevé où la collecte a vu le streamer en direct, `null` si elle ne l'a jamais
 * vu. Sur une fiche hors ligne, c'est ce qui distingue « vient de couper » de « n'a pas
 * allumé du week-end ».
 */
export function lastOnlineAt(points: StreamerSeriesPoint[]): string | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].online) return points[index].bucket;
  }
  return null;
}

export interface CurvePoint {
  /** Minutes écoulées depuis le premier point de la tranche. */
  minutes: number;
  eur: number;
}

export interface CurveSlice {
  points: CurvePoint[];
  /** Instant (ms epoch) du premier point retenu : origine de l'axe des abscisses. */
  fromAt: number;
  /** Étendue de l'axe des abscisses, en minutes. */
  spanMinutes: number;
  /** Euros collectés sur la tranche. */
  deltaEur: number;
  minEur: number;
  maxEur: number;
}

/**
 * Tranche de courbe à tracer : les points des `windowMinutes` dernières minutes
 * (`null` pour toute la série), ramenés à une origine locale.
 *
 * L'origine est le premier point retenu, pas l'instant demandé : une collecte qui ne
 * couvre pas encore toute la fenêtre doit dessiner ce qu'elle a, calé à gauche, plutôt
 * que d'ouvrir un vide dont on ne saurait pas dire s'il vaut zéro euro ou zéro donnée.
 */
export function curveSlice(
  points: StreamerSeriesPoint[],
  windowMinutes: number | null,
  now: number,
): CurveSlice | null {
  const since = windowMinutes === null ? -Infinity : now - windowMinutes * 60_000;
  const kept = points
    .map((point) => ({ t: Date.parse(point.bucket), eur: point.eur }))
    .filter((point) => Number.isFinite(point.t) && point.t >= since)
    .sort((a, b) => a.t - b.t);

  if (kept.length < 2) return null;

  const fromAt = kept[0].t;
  const last = kept[kept.length - 1];
  const values = kept.map((point) => point.eur);

  return {
    points: kept.map((point) => ({ minutes: (point.t - fromAt) / 60_000, eur: point.eur })),
    fromAt,
    spanMinutes: Math.max((last.t - fromAt) / 60_000, 1),
    deltaEur: last.eur - kept[0].eur,
    minEur: Math.min(...values),
    maxEur: Math.max(...values),
  };
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

export interface StreamerShareDetails {
  /** Progression récente, avec la fenêtre qui la mesure. */
  delta?: { eur: number; windowMinutes: number } | null;
  /** Prochain palier et ce qu'il reste à collecter, en euros. */
  nextGoal?: { label: string; remaining: number } | null;
}

/**
 * Texte de partage d'une fiche : la légende de la carte en image, et son repli là où
 * l'image ne passe pas.
 *
 * Chaque ligne est facultative et n'apparaît que si elle est connue — une phrase à trous
 * se remarque davantage qu'une phrase courte.
 */
export function buildStreamerShareText(
  streamer: Pick<Streamer, 'display' | 'twitch' | 'donationAmount'>,
  standing?: StreamerStanding | null,
  details?: StreamerShareDetails,
): string {
  const lines = [
    `${streamer.display} a récolté ${formatEuros(streamer.donationAmount.number)} au ZEvent.`,
  ];

  if (standing) {
    const place = `${formatRank(standing.donationRank)} sur ${standing.total} streamers`;
    lines.push(
      standing.share === null
        ? `${place}.`
        : `${place}, soit ${formatPercent(standing.share)} de la cagnotte.`,
    );
  }

  if (details?.delta && details.delta.eur > 0) {
    lines.push(
      `+${formatEuros(details.delta.eur)} sur les ${details.delta.windowMinutes} dernières minutes.`,
    );
  }

  if (details?.nextGoal) {
    lines.push(
      `Prochain palier : ${details.nextGoal.label} — il manque ${formatEuros(details.nextGoal.remaining)}.`,
    );
  }

  lines.push(twitchLinks(streamer.twitch).web);
  return lines.join('\n');
}
