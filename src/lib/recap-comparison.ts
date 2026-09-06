import type { Recap } from '@/api/recaps';
import type { EditionComparison } from '@/lib/stats-edition';
import { interpolateEur } from '@/lib/timeseries';

/**
 * De quoi situer le cumul d'une période, qui ne dit rien tout seul.
 *
 * « 4,2 M€ » est beaucoup ou peu selon ce à quoi on le rapporte. Deux références
 * s'imposent d'elles-mêmes : la journée d'avant, qui dit si le week-end accélère ou
 * s'essouffle, et la même tranche de 2025, qui dit où en était l'édition précédente au
 * même moment de son déroulé.
 */
export interface RecapComparison {
  /** La veille, telle que le serveur l'a jugée comparable. */
  previous: { title: string; raisedCents: number; ratio: number } | null;
  /** La même tranche de temps écoulé en 2025. */
  edition2025: { raisedCents: number; ratio: number } | null;
}

/** Un écart en deçà duquel il n'y a rien à annoncer : les deux périodes se valent. */
export const FLAT_RATIO = 0.02;

const ratioOf = (value: number, reference: number): number | null =>
  reference > 0 ? (value - reference) / reference : null;

/**
 * Compare une période à la veille et à 2025.
 *
 * L'alignement sur 2025 passe par le temps écoulé depuis l'ouverture, jamais par la date :
 * les deux éditions n'ouvrent ni le même jour ni à la même heure, et `EditionComparison`
 * a déjà fait ce recalage. On y lit la cagnotte 2025 aux deux bornes de la période, et
 * leur différence est ce que 2025 avait collecté sur la même tranche de son week-end.
 */
export function buildRecapComparison(
  recap: Pick<Recap, 'periodStart' | 'periodEnd' | 'content' | 'previous'>,
  comparison: EditionComparison | null,
): RecapComparison {
  const raisedCents = recap.content.summary.raisedCents;

  const previousRaised = recap.previous?.raisedCents;
  const previousRatio =
    previousRaised === undefined ? null : ratioOf(raisedCents, previousRaised);
  const previous =
    recap.previous && previousRatio !== null
      ? { title: recap.previous.title, raisedCents: previousRaised!, ratio: previousRatio }
      : null;

  return { previous, edition2025: raised2025(recap, comparison, raisedCents) };
}

function raised2025(
  recap: Pick<Recap, 'periodStart' | 'periodEnd'>,
  comparison: EditionComparison | null,
  raisedCents: number,
): RecapComparison['edition2025'] {
  const origin = comparison?.originAt2026 ?? null;
  if (!comparison || origin === null) return null;

  const startMinutes = (Date.parse(recap.periodStart) - origin) / 60_000;
  const endMinutes = (Date.parse(recap.periodEnd) - origin) / 60_000;
  const startEur = interpolateEur(comparison.points2025, startMinutes);
  const endEur = interpolateEur(comparison.points2025, endMinutes);
  // Hors de la plage 2025, l'interpolation ne rend rien : mieux vaut ne rien dire que
  // de comparer une nuit de 2026 à un week-end 2025 déjà terminé.
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
