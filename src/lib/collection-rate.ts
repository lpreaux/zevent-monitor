/**
 * Rythme de collecte : ce que 2026 lève par tranche horaire, et ce que l'édition
 * précédente levait sur la même tranche du week-end.
 *
 * Un montant par tranche ne dit rien tout seul — 320 k€ en une heure, c'est beaucoup ou
 * peu selon l'heure du week-end et selon ce qu'en faisait l'édition précédente. La seule
 * référence dont on dispose est la courbe 2025 embarquée : elle est cumulative, mais un
 * rythme s'en déduit par différences successives, une fois la courbe recalée sur le même
 * temps écoulé (le recalage est fait en amont, cf. `stats-edition`).
 *
 * Sans React ni React Native, pour rester testable sans monter de composant.
 */

import type { RatePoint } from '@/api/donations';
import { RATE_WINDOW_MINUTES } from './stats-edition';
import { interpolateEur, type ElapsedPoint } from './timeseries';

/**
 * Base minimale (€) sous laquelle on renonce à exprimer un écart en pourcentage.
 *
 * Aux premières heures, 2025 n'avait pas encore ouvert sa cagnotte, et juste après elle
 * ne collectait que quelques centaines d'euros : rapporter le rythme 2026 à une base
 * pareille donne des « +4 300 % » qui n'apprennent rien et qu'on n'a aucune raison de
 * croire. Mieux vaut une phrase sans pourcentage qu'un pourcentage sans signification.
 */
export const MIN_COMPARISON_BASE_EUR = 1_000;

/**
 * Cagnotte 2025 à un instant de l'édition, `null` au-delà de ce que couvre sa courbe.
 *
 * Avant son premier point, la réponse est 0 et non « inconnu » : la courbe recalée
 * démarre à l'ouverture de la cagnotte 2025, et avant cette ouverture il ne s'était rien
 * collecté. C'est ce qui permet de situer les toutes premières heures de 2026 — où 2025
 * dormait encore — au lieu d'afficher un tiret. Le premier point vaut lui-même quelques
 * centaines d'euros (le seuil qui définit son T+0) : le compter à partir de zéro rend à
 * la tranche d'ouverture ce que 2025 y a réellement levé.
 */
export function cumulative2025At(points2025: ElapsedPoint[], minutes: number): number | null {
  const first = points2025[0];
  if (!first) return null;
  if (minutes <= first.minutes) return 0;
  return interpolateEur(points2025, minutes);
}

/**
 * Ce que 2025 a levé entre deux instants de l'édition, `null` si la fenêtre déborde de
 * sa courbe — on n'extrapole pas au-delà du dernier point connu.
 */
export function rate2025Between(
  points2025: ElapsedPoint[],
  fromMinutes: number,
  toMinutes: number,
): number | null {
  const from = cumulative2025At(points2025, fromMinutes);
  const to = cumulative2025At(points2025, toMinutes);
  if (from === null || to === null) return null;
  // Une cagnotte ne redescend pas : un repli vient d'un remboursement ou du bruit
  // d'échantillonnage de la source, et ne mérite pas d'être annoncé comme un rythme
  // négatif.
  return Math.max(0, to - from);
}

/** Écart relatif à 2025, `null` quand la base est trop faible pour porter un pourcentage. */
export function relativeGap(eur: number, eur2025: number | null): number | null {
  if (eur2025 === null || eur2025 < MIN_COMPARISON_BASE_EUR) return null;
  return (eur - eur2025) / eur2025;
}

export interface RateBucket {
  /** Début de la tranche, ISO : sert de clé et se formate en heure de Paris. */
  key: string;
  /** Euros levés pendant la tranche, en 2026. */
  eur: number;
  /** Ce que 2025 levait sur la même tranche de l'édition, `null` hors de sa courbe. */
  eur2025: number | null;
  /** Écart relatif à 2025, `null` sur une base trop faible. */
  gap: number | null;
  peakViewers: number;
}

export interface CollectionRate {
  buckets: RateBucket[];
  /** Tranche la plus généreuse, `null` sans données. */
  peak: RateBucket | null;
  /** Euros levés par tranche en moyenne, 0 sans tranche. */
  averageEur: number;
  /**
   * Ce que 2025 levait en moyenne sur les mêmes tranches, `null` si aucune n'est
   * comparable. Les tranches d'avant son ouverture y comptent pour zéro : une cagnotte
   * ouverte plus tard fait partie de ce qui sépare les deux éditions, l'effacer de la
   * moyenne reviendrait à comparer 2026 aux seules bonnes heures de 2025.
   */
  average2025Eur: number | null;
}

export interface CollectionRateInput {
  /** Tranches renvoyées par le backend, dans l'ordre. */
  points: RatePoint[];
  bucketMinutes: number;
  /** Courbe 2025 cumulative, déjà recalée sur l'axe 2026 (`EditionComparison.points2025`). */
  points2025: ElapsedPoint[];
  /** T+0 de 2026 en ms epoch, `null` tant que la collecte n'a rien relevé. */
  originAt2026: number | null;
}

/**
 * Appariement des deux éditions tranche par tranche.
 *
 * Le backend date ses tranches à l'horloge de Paris, la courbe 2025 vit sur l'axe du
 * temps écoulé : le T+0 de 2026 est la charnière entre les deux, et sans lui il n'y a
 * pas de comparaison possible — seulement l'histogramme 2026.
 */
export function buildCollectionRate({
  points,
  bucketMinutes,
  points2025,
  originAt2026,
}: CollectionRateInput): CollectionRate {
  const buckets: RateBucket[] = [];

  for (const point of points) {
    // Une tranche sans échantillon n'est pas une tranche à zéro : c'est un trou de
    // collecte, et la tracer creuserait dans l'histogramme un puits qui n'a jamais eu
    // lieu.
    if (point.samples <= 0) continue;

    const startedAt = Date.parse(point.bucket);
    const eur = point.raisedCents / 100;
    const placeable = originAt2026 !== null && !Number.isNaN(startedAt);
    const fromMinutes = placeable ? (startedAt - originAt2026) / 60_000 : null;
    const eur2025 =
      fromMinutes === null
        ? null
        : rate2025Between(points2025, fromMinutes, fromMinutes + bucketMinutes);

    buckets.push({
      key: point.bucket,
      eur,
      eur2025,
      gap: relativeGap(eur, eur2025),
      peakViewers: point.peakViewers,
    });
  }

  let peak: RateBucket | null = null;
  let total = 0;
  let total2025 = 0;
  let compared = 0;
  for (const bucket of buckets) {
    if (peak === null || bucket.eur > peak.eur) peak = bucket;
    total += bucket.eur;
    if (bucket.eur2025 !== null) {
      total2025 += bucket.eur2025;
      compared += 1;
    }
  }

  return {
    buckets,
    peak,
    averageEur: buckets.length ? total / buckets.length : 0,
    average2025Eur: compared > 0 ? total2025 / compared : null,
  };
}

export interface RateComparison {
  /** Euros levés par 2026 sur la fenêtre, `null` si elle n'est pas entièrement couverte. */
  eur: number | null;
  /** Ce que 2025 levait sur la même fenêtre de l'édition, `null` hors de sa courbe. */
  eur2025: number | null;
  /** Écart relatif, `null` dès que la base 2025 ne peut pas porter un pourcentage. */
  gap: number | null;
  /** 2025 n'avait pas encore ouvert sa cagnotte à ce stade : il n'y a rien à comparer. */
  before2025Opening: boolean;
  windowMinutes: number;
}

/**
 * La phrase de tête de la section : le rythme de la dernière heure, face à la même heure
 * de l'édition 2025.
 *
 * La fenêtre est celle sur laquelle `eur` a été mesuré (`RATE_WINDOW_MINUTES`) — deux
 * fenêtres différentes de part et d'autre de la comparaison, et le pourcentage annoncé
 * comparerait une heure 2026 à deux heures 2025 sans que rien ne le signale.
 */
export function compareLastWindow(
  points2025: ElapsedPoint[],
  currentMinutes: number,
  eur: number | null,
  windowMinutes: number = RATE_WINDOW_MINUTES,
): RateComparison {
  const eur2025 = rate2025Between(points2025, currentMinutes - windowMinutes, currentMinutes);
  // L'ouverture de 2025 se lit sur la courbe recalée elle-même plutôt que sur la
  // constante de recalage : c'est la même chose, mais une seule des deux peut se
  // désynchroniser des données affichées.
  const opening2025 = points2025[0]?.minutes ?? null;

  return {
    eur,
    eur2025,
    gap: eur === null ? null : relativeGap(eur, eur2025),
    before2025Opening: opening2025 !== null && currentMinutes <= opening2025,
    windowMinutes,
  };
}
