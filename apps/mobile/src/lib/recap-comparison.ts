import type { Recap } from '@/api/recaps';

/**
 * De quoi situer le cumul d'une période, qui ne dit rien tout seul.
 *
 * « 4,2 M€ » est beaucoup ou peu selon ce à quoi on le rapporte. Deux références
 * s'imposent d'elles-mêmes : la journée d'avant, qui dit si le week-end accélère ou
 * s'essouffle, et le même jour de l'édition précédente.
 */
export interface RecapComparison {
  /** La veille, telle que le serveur l'a jugée comparable. */
  previous: { title: string; raisedCents: number; ratio: number } | null;
  /** Le même jour de la semaine, un an plus tôt. */
  edition2025: { raisedCents: number; ratio: number } | null;
}

/** Un écart en deçà duquel il n'y a rien à annoncer : les deux périodes se valent. */
export const FLAT_RATIO = 0.02;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Point de la courbe 2025 telle qu'elle est archivée : horodatage absolu et euros. */
export interface AbsolutePoint {
  t: number;
  eur: number;
}

export interface EditionHistory {
  points: readonly AbsolutePoint[];
  /** Instant du premier don 2026, qui sert de repère pour caler les deux éditions. */
  originAt2026: number | null;
}

const ratioOf = (value: number, reference: number): number | null =>
  reference > 0 ? (value - reference) / reference : null;

/**
 * Décalage à appliquer à 2026 pour retomber sur l'édition précédente, arrondi à la semaine.
 *
 * Un ZEvent se lit par jour de la semaine : le samedi est la grosse journée, le dimanche
 * celle de la clôture, et leurs rythmes n'ont rien de commun. Aligner les deux éditions
 * sur le temps écoulé depuis l'ouverture — ce que fait l'écran des statistiques pour
 * superposer deux courbes — mettrait ici le samedi 2026 en face du dimanche 2025, parce
 * que la collecte 2026 démarre au concert du jeudi soir quand celle de 2025 n'ouvrait que
 * le vendredi. L'arrondi au multiple de sept jours efface ce décalage d'ouverture et fait
 * tomber vendredi sur vendredi : entre 2025 et 2026, exactement 52 semaines.
 */
export function weekAlignedOffsetMs(originAt2026: number, first2025: number): number {
  return Math.round((originAt2026 - first2025) / WEEK_MS) * WEEK_MS;
}

/** Cagnotte 2025 à un instant donné, interpolée entre les deux relevés qui l'encadrent. */
export function eurAt(points: readonly AbsolutePoint[], at: number): number | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || at < first.t || at > last.t) return null;

  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1]!;
    const after = points[index]!;
    if (at > after.t) continue;
    const span = after.t - before.t;
    if (span <= 0) return after.eur;
    return before.eur + ((after.eur - before.eur) * (at - before.t)) / span;
  }
  return last.eur;
}

/**
 * Compare une période à la veille et au même jour de l'édition précédente.
 */
export function buildRecapComparison(
  recap: Pick<Recap, 'periodStart' | 'periodEnd' | 'content' | 'previous'>,
  history: EditionHistory | null,
): RecapComparison {
  const raisedCents = recap.content.summary.raisedCents;

  const previousRaised = recap.previous?.raisedCents;
  const previousRatio =
    previousRaised === undefined ? null : ratioOf(raisedCents, previousRaised);
  const previous =
    recap.previous && previousRatio !== null
      ? { title: recap.previous.title, raisedCents: previousRaised!, ratio: previousRatio }
      : null;

  return { previous, edition2025: raised2025(recap, history, raisedCents) };
}

function raised2025(
  recap: Pick<Recap, 'periodStart' | 'periodEnd'>,
  history: EditionHistory | null,
  raisedCents: number,
): RecapComparison['edition2025'] {
  const origin = history?.originAt2026 ?? null;
  const first = history?.points[0];
  if (!history || origin === null || !first) return null;

  const offset = weekAlignedOffsetMs(origin, first.t);
  const startEur = eurAt(history.points, Date.parse(recap.periodStart) - offset);
  const endEur = eurAt(history.points, Date.parse(recap.periodEnd) - offset);
  // Hors de la plage couverte par 2025, l'interpolation ne rend rien : mieux vaut se taire
  // que comparer une nuit de 2026 à un week-end 2025 déjà terminé.
  if (startEur === null || endEur === null) return null;

  const cents = Math.max(0, Math.round((endEur - startEur) * 100));
  const ratio = ratioOf(raisedCents, cents);
  return ratio === null ? null : { raisedCents: cents, ratio };
}

/** « +18 % », « −4 % », ou l'égalité quand l'écart ne mérite pas d'être nommé. */
export function formatComparisonRatio(ratio: number): string {
  if (Math.abs(ratio) < FLAT_RATIO) return 'au même niveau';
  const percent = Math.round(Math.abs(ratio) * 100);
  return `${ratio > 0 ? '+' : '−'}${percent} %`;
}
