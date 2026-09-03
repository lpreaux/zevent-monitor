/**
 * Outils d'alignement des courbes de collecte pour comparer deux éditions sur le
 * même axe de « temps écoulé » (cf. PLAN.md §1.5). T+0 = premier point où la
 * cagnotte dépasse un petit seuil, ce qui retire le préfixe à zéro d'avant collecte
 * sans dépendre d'un horaire d'ouverture officiel parfois approximatif.
 */

/** Seuil (€) au-delà duquel on considère que la collecte a réellement démarré. */
export const COLLECTION_START_THRESHOLD_EUR = 1_000;

export interface RawPoint {
  /** Horodatage en millisecondes epoch. */
  t: number;
  eur: number;
}

export interface ElapsedPoint {
  /** Minutes écoulées depuis T+0. */
  minutes: number;
  eur: number;
}

export interface ElapsedSeries {
  /** Horodatage (ms epoch) retenu comme T+0, ou `null` si la série est vide. */
  originAt: number | null;
  points: ElapsedPoint[];
}

/** Convertit une série horodatée en série « minutes écoulées depuis T+0 ». */
export function toElapsedSeries(
  raw: RawPoint[],
  thresholdEur = COLLECTION_START_THRESHOLD_EUR,
): ElapsedSeries {
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return { originAt: null, points: [] };

  const startIndex = sorted.findIndex((p) => p.eur >= thresholdEur);
  const from = startIndex >= 0 ? startIndex : 0;
  const originAt = sorted[from].t;

  return {
    originAt,
    points: sorted.slice(from).map((p) => ({
      minutes: (p.t - originAt) / 60_000,
      eur: p.eur,
    })),
  };
}

/**
 * Valeur interpolée linéairement de la série à `minutes`. Renvoie `null` hors de
 * la plage couverte (on n'extrapole pas).
 */
export function interpolateEur(points: ElapsedPoint[], minutes: number): number | null {
  if (points.length === 0) return null;
  if (minutes < points[0].minutes || minutes > points[points.length - 1].minutes) {
    return null;
  }
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i];
    if (b.minutes >= minutes) {
      const a = points[i - 1];
      const span = b.minutes - a.minutes;
      if (span <= 0) return b.eur;
      const ratio = (minutes - a.minutes) / span;
      return a.eur + (b.eur - a.eur) * ratio;
    }
  }
  return points[points.length - 1].eur;
}

export function lastElapsedMinutes(points: ElapsedPoint[]): number {
  return points.length ? points[points.length - 1].minutes : 0;
}

/**
 * Ré-échantillonne une série sur une grille régulière de `columns` colonnes entre
 * 0 et `maxMinutes`. Les colonnes hors plage valent `null` (série absente ici).
 */
export function resampleToGrid(
  points: ElapsedPoint[],
  maxMinutes: number,
  columns: number,
): (number | null)[] {
  if (columns <= 1 || maxMinutes <= 0) return [];
  const out: (number | null)[] = new Array(columns);
  for (let i = 0; i < columns; i += 1) {
    const minutes = (i / (columns - 1)) * maxMinutes;
    out[i] = interpolateEur(points, minutes);
  }
  return out;
}
