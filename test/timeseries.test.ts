import { describe, expect, it } from 'vitest';

import { interpolateEur, recentDeltaEur, shiftElapsed, toElapsedSeries } from '../src/lib/timeseries';

const START = Date.parse('2026-09-04T18:00:00Z');

/** Série régulière au pas de 10 min, croissant de `stepEur` par point. */
function series(points: number, stepEur: number) {
  return Array.from({ length: points }, (_, i) => ({
    t: START + i * 10 * 60_000,
    eur: 2_000 + i * stepEur,
  }));
}

describe('recentDeltaEur', () => {
  it('mesure la progression sur la fenêtre demandée', () => {
    const { points } = toElapsedSeries(series(13, 1_000));
    // 60 min = 6 pas de 1 000 €.
    expect(recentDeltaEur(points, 60)).toBeCloseTo(6_000);
  });

  it('utilise la cagnotte live quand elle est fournie', () => {
    const { points } = toElapsedSeries(series(13, 1_000));
    const last = points[points.length - 1].eur;
    expect(recentDeltaEur(points, 60, last + 500)).toBeCloseTo(6_500);
  });

  it('renvoie null tant que la fenêtre n’est pas couverte', () => {
    const { points } = toElapsedSeries(series(4, 1_000));
    expect(recentDeltaEur(points, 60)).toBeNull();
  });

  it('renvoie null sans série exploitable', () => {
    expect(recentDeltaEur([], 60)).toBeNull();
    expect(recentDeltaEur([{ minutes: 0, eur: 10 }], 60)).toBeNull();
  });
});

describe('shiftElapsed', () => {
  it('décale la série sur l’axe du temps écoulé', () => {
    const { points } = toElapsedSeries(series(3, 1_000));
    const shifted = shiftElapsed(points, 24 * 60);
    expect(shifted.map((p) => p.minutes)).toEqual([1_440, 1_450, 1_460]);
    expect(shifted.map((p) => p.eur)).toEqual(points.map((p) => p.eur));
  });

  it('laisse la série intacte sans décalage', () => {
    const { points } = toElapsedSeries(series(3, 1_000));
    expect(shiftElapsed(points, 0)).toBe(points);
  });

  it('n’extrapole pas avant le nouveau départ', () => {
    const { points } = toElapsedSeries(series(3, 1_000));
    const shifted = shiftElapsed(points, 24 * 60);
    expect(interpolateEur(shifted, 1_000)).toBeNull();
    expect(interpolateEur(shifted, 1_445)).toBeCloseTo(2_500);
  });
});
