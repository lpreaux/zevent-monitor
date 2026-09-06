/**
 * Découpe des deux courbes d'éditions pour la fenêtre affichée.
 *
 * Le graphe ne sait tracer qu'un axe partant de zéro : pour montrer les dernières
 * heures plutôt que tout le week-end, on ne lui demande pas une fenêtre, on lui donne
 * des séries déjà rebasées sur le début de celle-ci. C'est aussi ce qui permet de
 * relever le plancher de l'axe des montants — deux cagnottes à onze millions observées
 * sur six heures, tracées depuis zéro, sont deux lignes plates superposées en haut du
 * cadre, et l'écart entre elles, qui est tout le sujet, ne se voit plus.
 */

import type { EditionComparison } from './stats-edition';
import { interpolateEur, type ElapsedPoint } from './timeseries';

/** Marge laissée au-dessus et en dessous de la tranche, en part de son amplitude. */
const Y_PADDING = 0.12;

/** Amplitude minimale d'une fenêtre, en minutes : en deçà il n'y a rien à lire. */
const MIN_SPAN_MINUTES = 60;

/**
 * Jusqu'où la projection a le droit d'étirer l'axe, en part du maximum réellement
 * collecté.
 *
 * Une projection n'est pas une donnée : c'est une règle de trois sur l'avance du moment,
 * et en début d'édition elle annonce couramment le double du total final de l'année
 * précédente. Lui laisser fixer le haut du cadre tassait les deux courbes — les seuls
 * chiffres vrais du graphe — dans sa moitié basse, pour qu'un trait hypothétique tienne
 * dans la moitié haute. Au-delà de ce plafond, la projection sort donc du cadre ; la
 * légende continue de l'annoncer en toutes lettres, à sa place.
 */
const PROJECTION_HEADROOM = 1.2;

export interface ComparisonSlice {
  /** Séries rebasées : `minutes` compte depuis le début de la fenêtre. */
  points2025: ElapsedPoint[];
  points2026: ElapsedPoint[];
  /** Début de la fenêtre dans l'axe d'origine, pour libeller les graduations. */
  fromMinutes: number;
  spanMinutes: number;
  yMin: number;
  yMax: number;
}

/**
 * Tranche d'une série entre deux bornes, valeurs interpolées aux bords.
 *
 * Sans ces deux points de bord, la courbe démarrerait au premier relevé postérieur à la
 * borne — jusqu'à dix minutes de blanc au bord gauche du cadre, et une ligne qui semble
 * commencer en retrait pour une raison que rien à l'écran n'explique.
 */
function clip(points: ElapsedPoint[], from: number, to: number): ElapsedPoint[] {
  if (points.length === 0) return [];

  const inside = points.filter((point) => point.minutes >= from && point.minutes <= to);
  const out: ElapsedPoint[] = [];

  const atFrom = interpolateEur(points, from);
  if (atFrom !== null && (inside.length === 0 || inside[0].minutes > from)) {
    out.push({ minutes: from, eur: atFrom });
  }
  out.push(...inside);
  const atTo = interpolateEur(points, to);
  if (atTo !== null && (inside.length === 0 || inside[inside.length - 1].minutes < to)) {
    out.push({ minutes: to, eur: atTo });
  }

  return out;
}

/**
 * `windowMinutes` à `null` cadre tout l'événement ; sinon la fenêtre se termine à
 * l'instant courant de l'édition. `toUnit` convertit les montants dans l'unité affichée
 * (euros, ou part du total 2025) — l'échelle se calcule après conversion, pas avant,
 * sans quoi les repères tomberaient à côté du tracé.
 */
export function comparisonSlice(
  comparison: EditionComparison,
  windowMinutes: number | null,
  toUnit: (eur: number) => number = (value) => value,
): ComparisonSlice {
  const convert = (points: ElapsedPoint[], offset: number) =>
    points.map((point) => ({ minutes: point.minutes - offset, eur: toUnit(point.eur) }));

  if (windowMinutes === null) {
    // Sur le week-end entier, l'axe part de zéro : c'est une cagnotte qui se remplit, et
    // sa hauteur est précisément ce qu'on vient regarder.
    const collected = Math.max(toUnit(comparison.final2025Eur), toUnit(comparison.current2026Eur));
    const projected =
      comparison.projected2026Eur === null ? 0 : toUnit(comparison.projected2026Eur);
    const yMax = Math.max(collected, Math.min(projected, collected * PROJECTION_HEADROOM));
    return {
      points2025: convert(comparison.points2025, 0),
      points2026: convert(comparison.points2026, 0),
      fromMinutes: 0,
      spanMinutes: Math.max(comparison.maxMinutes, MIN_SPAN_MINUTES),
      yMin: 0,
      yMax: yMax * 1.05,
    };
  }

  const to = Math.max(comparison.current2026Minutes, MIN_SPAN_MINUTES);
  const from = Math.max(0, to - windowMinutes);
  const span = Math.max(to - from, MIN_SPAN_MINUTES);

  const clipped2025 = clip(comparison.points2025, from, to);
  const clipped2026 = clip(comparison.points2026, from, to);
  const values = [...clipped2025, ...clipped2026].map((point) => toUnit(point.eur));

  // Fenêtre sans le moindre point : un cadre vide plutôt qu'une échelle inventée.
  if (values.length === 0) {
    return {
      points2025: [],
      points2026: [],
      fromMinutes: from,
      spanMinutes: span,
      yMin: 0,
      yMax: 1,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const amplitude = Math.max(max - min, 1);

  return {
    points2025: convert(clipped2025, from),
    points2026: convert(clipped2026, from),
    fromMinutes: from,
    spanMinutes: span,
    yMin: Math.max(0, min - amplitude * Y_PADDING),
    yMax: max + amplitude * Y_PADDING,
  };
}

/**
 * Valeurs rondes où poser les repères horizontaux du cadre.
 *
 * Elles ne peuvent pas être fixées d'avance : la fenêtre courte cadre une tranche de
 * quelques centaines de milliers d'euros là où le week-end entier en couvre seize
 * millions, et une liste figée n'aurait tantôt aucun repère dans le cadre, tantôt
 * quatre traits collés au même endroit. On dérive donc le pas de l'amplitude, arrondi
 * au 1, 2 ou 5 de l'ordre de grandeur — les seuls multiples qu'un œil lit sans
 * calculer.
 */
export function referenceValues(yMin: number, yMax: number, count = 3): number[] {
  const span = yMax - yMin;
  if (!Number.isFinite(span) || span <= 0) return [];

  const rawStep = span / (count + 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rawStep);
  if (!step) return [];

  const out: number[] = [];
  for (let value = Math.ceil(yMin / step) * step; value < yMax; value += step) {
    // Le zéro est déjà le bord du cadre : un trait par-dessus ne fait que le doubler.
    if (value > yMin) out.push(value);
  }
  return out;
}

/**
 * Graduations de l'axe du temps, en minutes rebasées sur la fenêtre, libellées avec la
 * position réelle dans l'édition : c'est « T+26 h » qui situe, pas « 2 h après le bord
 * gauche du graphe ».
 */
export function elapsedTicks(
  fromMinutes: number,
  spanMinutes: number,
  formatLabel: (minutes: number) => string,
): { minutes: number; label: string }[] {
  const stepHours =
    spanMinutes > 48 * 60 ? 12 : spanMinutes > 12 * 60 ? 6 : spanMinutes > 4 * 60 ? 2 : 1;
  const step = stepHours * 60;

  const ticks: { minutes: number; label: string }[] = [];
  const first = Math.ceil(fromMinutes / step) * step;
  // L'axe va jusqu'à son bord : le libellé du bout s'y aligne au lieu de déborder, et une
  // dernière graduation à 92 % du cadre laissait croire que le tracé s'arrêtait avant lui.
  for (let absolute = first; absolute <= fromMinutes + spanMinutes; absolute += step) {
    ticks.push({ minutes: absolute - fromMinutes, label: formatLabel(absolute) });
  }
  return ticks;
}
