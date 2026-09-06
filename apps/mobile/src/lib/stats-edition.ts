/**
 * Comparaison des éditions 2025 et 2026 sur un même axe de temps écoulé.
 *
 * Sorti de l'écran des statistiques parce que plusieurs sections en dépendent — la
 * courbe superposée, la chronologie des millions, le rythme comparé, la carte de
 * partage — et que deux d'entre elles ne peuvent pas se permettre de diverger d'un
 * décalage de calage : « en avance de 1,2 M€ » en tête d'écran et une courbe qui dit
 * l'inverse plus bas, c'est toute la page qu'on cesse de croire.
 */

import type { History2025 } from './history-2025';
import {
  COLLECTION_START_THRESHOLD_EUR,
  interpolateEur,
  lastElapsedMinutes,
  recentDeltaEur,
  shiftElapsed,
  toElapsedSeries,
  type ElapsedPoint,
  type RawPoint,
} from './timeseries';

/**
 * Recalage des deux éditions. Sans lui, aligner chaque série sur son propre T+0
 * comparerait le jeudi soir 2026 au vendredi soir 2025 : la cagnotte 2026 a ouvert
 * le jeudi à 20 h, celle de 2025 le vendredi à 18 h seulement.
 */
export const OPENING_GAP_MINUTES = 22 * 60;

/**
 * T+0 d'une série est son premier point au-dessus de `COLLECTION_START_THRESHOLD_EUR`,
 * pas l'horaire d'ouverture : les premiers dons 2026 arrivent ~30 min avant 20 h,
 * alors que la série 2025 démarre pile à 18 h. On compense pour que les deux
 * ouvertures tombent bien au même endroit sur l'axe.
 */
export const PRE_OPENING_2026_MINUTES = 30;

export const OFFSET_2025_MINUTES = OPENING_GAP_MINUTES + PRE_OPENING_2026_MINUTES;

/** `T+22 h 30` — l'unité d'heure reste devant les minutes, comme « 20 h 30 ». */
export const OFFSET_2025_LABEL = (() => {
  const hours = Math.floor(OFFSET_2025_MINUTES / 60);
  const minutes = OFFSET_2025_MINUTES % 60;
  return minutes === 0 ? `T+${hours} h` : `T+${hours} h ${String(minutes).padStart(2, '0')}`;
})();

/** Espace fine insécable, même choix que `format.ts`. */
const NBSP = ' ';

/** Fenêtre sur laquelle se mesure le rythme courant, en minutes. */
export const RATE_WINDOW_MINUTES = 60;

export interface EditionComparison {
  /** Horodatage (ms epoch) du T+0 de 2026, `null` tant que la collecte n'a rien. */
  originAt2026: number | null;
  /** Courbe 2025, décalée de `OFFSET_2025_MINUTES` pour se caler sur 2026. */
  points2025: ElapsedPoint[];
  points2026: ElapsedPoint[];
  /** Deux points au moins : en deçà il n'y a pas de courbe à tracer. */
  has2026Curve: boolean;
  /** Cagnotte 2026 courante — l'état officiel quand on l'a, le dernier point sinon. */
  current2026Eur: number;
  current2026Minutes: number;
  /** Total final de 2025, la cible que la page compare. */
  final2025Eur: number;
  /** Où en était 2025 au même instant de l'édition, `null` hors de sa plage. */
  eur2025SameElapsed: number | null;
  /** Avance (positive) ou retard (négatif) de 2026 sur 2025, à cet instant. */
  deltaEur: number | null;
  /** Total 2026 extrapolé depuis le rapport aux courbes 2025. Estimation, à annoncer comme telle. */
  projected2026Eur: number | null;
  /** Rythme observé sur la dernière heure, en euros par heure. */
  eurPerHour: number | null;
  /** Étendue de l'axe des deux courbes réunies, en minutes. */
  maxMinutes: number;
}

/**
 * Modèle commun aux sections de l'écran des statistiques.
 *
 * `liveEur` est la cagnotte de l'état officiel : plus fraîche que le dernier point
 * agrégé, qui peut avoir jusqu'à dix minutes de retard.
 */
export function buildEditionComparison(
  raw2026: RawPoint[],
  history: History2025,
  liveEur?: number | null,
): EditionComparison {
  const elapsed2025 = toElapsedSeries(history.points);
  const elapsed2026 = toElapsedSeries(raw2026);
  const points2025 = shiftElapsed(elapsed2025.points, OFFSET_2025_MINUTES);
  const points2026 = elapsed2026.points;

  const current2026Eur = liveEur ?? points2026.at(-1)?.eur ?? 0;
  const current2026Minutes = lastElapsedMinutes(points2026);
  const has2026Curve = points2026.length >= 2;

  // Avant ce décalage, 2025 n'avait pas encore ouvert sa cagnotte : la comparaison
  // vaut 0 € plutôt que « indisponible ».
  const eur2025SameElapsed =
    has2026Curve && current2026Minutes > 0
      ? current2026Minutes < OFFSET_2025_MINUTES
        ? 0
        : interpolateEur(points2025, current2026Minutes)
      : null;

  // Une base 2025 quasi nulle (tout début de collecte) ferait exploser le ratio.
  const projected2026Eur =
    eur2025SameElapsed !== null && eur2025SameElapsed >= COLLECTION_START_THRESHOLD_EUR
      ? current2026Eur * (history.finalEur / eur2025SameElapsed)
      : null;

  return {
    originAt2026: elapsed2026.originAt,
    points2025,
    points2026,
    has2026Curve,
    current2026Eur,
    current2026Minutes,
    final2025Eur: history.finalEur,
    eur2025SameElapsed,
    deltaEur: eur2025SameElapsed === null ? null : current2026Eur - eur2025SameElapsed,
    projected2026Eur,
    eurPerHour: recentDeltaEur(points2026, RATE_WINDOW_MINUTES, current2026Eur),
    maxMinutes: Math.max(lastElapsedMinutes(points2025), current2026Minutes, 60),
  };
}

/**
 * `T+31 h` : la position dans l'édition, telle qu'on la cite dans une phrase.
 *
 * Sous l'heure, on ne compte qu'en minutes : « T+0 h 45 » se lit deux fois avant d'être
 * compris. Les espaces sont fines et insécables, comme dans `format.ts` — un « T+18 »
 * seul en fin de ligne et son « h » à la ligne suivante ne se lisent plus.
 */
export function formatElapsedLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return `T+0${NBSP}min`;
  const total = Math.round(minutes);
  if (total < 60) return `T+${total}${NBSP}min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (rest === 0) return `T+${hours}${NBSP}h`;
  return `T+${hours}${NBSP}h${NBSP}${String(rest).padStart(2, '0')}`;
}
