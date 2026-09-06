/**
 * Lecture d'une courbe au doigt : les repères du cadre et les valeurs relevées à un
 * instant, sans React (cf. `OverlayChart`, qui ne garde que le geste et le dessin).
 *
 * Un scrubber se trompe toujours au même endroit — d'un pixel sur le bord du cadre, ou
 * d'une série qui ne couvre pas l'instant pointé et qu'on affiche quand même à sa dernière
 * valeur connue, ce qui donne une comparaison fausse mais parfaitement crédible. C'est
 * précisément ce qui se teste, d'où ce module à part.
 */

import { interpolateEur, type ElapsedPoint } from './timeseries';

function clamp01(ratio: number): number {
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Abscisse (px, depuis le bord gauche du cadre) → instant, en minutes écoulées.
 *
 * Le bornage n'est pas une précaution de style : le doigt sort du graphe à chaque geste un
 * peu vif — et `PanResponder`, une fois le geste pris, continue de rapporter sa position
 * bien au-delà des bords. Sans borne, on lirait la courbe à T+53 h sur un week-end qui en
 * compte cinquante, et `interpolateEur` répondrait `null` : le bandeau se viderait dès
 * qu'on effleure la marge.
 */
export function minutesAtX(x: number, width: number, maxMinutes: number): number {
  if (!Number.isFinite(x) || width <= 0 || maxMinutes <= 0) return 0;
  return clamp01(x / width) * maxMinutes;
}

/** Instant (minutes écoulées) → abscisse (px) dans le cadre, borné de la même façon. */
export function xAtMinutes(minutes: number, width: number, maxMinutes: number): number {
  if (!Number.isFinite(minutes) || width <= 0 || maxMinutes <= 0) return 0;
  return clamp01(minutes / maxMinutes) * width;
}

/**
 * Hauteur relative d'un montant dans le cadre : 0 au plancher, 1 au plafond.
 *
 * Le tracé des séries et la pastille du scrubber la partagent. Deux formules équivalentes
 * écrites à deux endroits finissent par diverger d'un arrondi, et une pastille qui flotte
 * à côté de la ligne qu'elle prétend désigner décrédibilise toute la lecture — d'autant
 * plus visiblement que le plancher est relevé (`yMin`), où l'écart se multiplie.
 */
export function valueRatio(eur: number, yMin: number, yMax: number): number {
  const span = yMax - yMin;
  if (!Number.isFinite(eur) || span <= 0) return 0;
  return clamp01((eur - yMin) / span);
}

/** Ce qu'une série doit porter pour être lue au doigt — `ChartSeries` en est un cas. */
export interface ScrubSeries {
  id: string;
  label: string;
  color: string;
  /** Points triés par `minutes` croissantes, comme `interpolateEur` l'exige. */
  points: ElapsedPoint[];
}

export interface ScrubReading {
  id: string;
  label: string;
  color: string;
  /**
   * Montant interpolé à l'instant pointé, `null` là où la série ne va pas. Le `null` est
   * rendu tel quel plutôt que filtré ici : l'appelant a besoin de la liste complète pour
   * savoir sur quelles séries poser une pastille, et lui seul sait comment le dire.
   */
  eur: number | null;
}

/**
 * Valeur de chaque série à `minutes`. L'ordre d'entrée est conservé : c'est celui de la
 * légende et de l'empilement des tracés, le bandeau doit s'y tenir.
 */
export function readSeriesAt(series: readonly ScrubSeries[], minutes: number): ScrubReading[] {
  return series.map((entry) => ({
    id: entry.id,
    label: entry.label,
    color: entry.color,
    eur: interpolateEur(entry.points, minutes),
  }));
}


/**
 * Le bandeau de lecture : « T+18 h — 2026 : 6,2 M€ · 2025 : 5,1 M€ ».
 *
 * Les séries muettes à cet instant sont passées sous silence plutôt qu'affichées « — » :
 * la ligne se lit d'un coup d'œil pendant que le doigt bouge, et un tiret au milieu des
 * montants ressemble trop à l'un d'eux. Un graphe qui ne porte qu'une série n'étiquette
 * pas son montant — la section qui l'entoure le dit déjà, et le répéter à chaque relevé
 * pousse le montant hors du cadre sur les petits écrans. La distinction se fait sur le
 * nombre de séries reçues, pas sur celles qui ont répondu : là où l'une des deux éditions
 * s'arrête, un montant nu ne dirait plus laquelle on lit.
 */
export function scrubCaption(
  xLabel: string,
  readings: readonly ScrubReading[],
  formatValue: (value: number) => string,
): string {
  const known: { label: string; eur: number }[] = [];
  for (const reading of readings) {
    if (reading.eur != null) known.push({ label: reading.label, eur: reading.eur });
  }

  // Rien à cet instant : on le dit, plutôt que de laisser un bandeau tronqué qu'on
  // prendrait pour un chargement.
  if (known.length === 0) return `${xLabel} — pas de relevé ici`;

  const body =
    readings.length === 1
      ? formatValue(known[0].eur)
      : known.map((entry) => `${entry.label} : ${formatValue(entry.eur)}`).join(' · ');
  return `${xLabel} — ${body}`;
}
