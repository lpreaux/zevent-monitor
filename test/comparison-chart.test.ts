import { describe, expect, it } from 'vitest';

import { comparisonSlice, elapsedTicks, referenceValues } from '@/lib/comparison-chart';
import type { EditionComparison } from '@/lib/stats-edition';
import type { ElapsedPoint } from '@/lib/timeseries';

/** Série linéaire : `eurPerHour` euros par heure, un point toutes les dix minutes. */
function ramp(fromMinutes: number, toMinutes: number, eurPerHour: number): ElapsedPoint[] {
  const points: ElapsedPoint[] = [];
  for (let minutes = fromMinutes; minutes <= toMinutes; minutes += 10) {
    points.push({ minutes, eur: ((minutes - fromMinutes) / 60) * eurPerHour });
  }
  return points;
}

function comparison(overrides: Partial<EditionComparison> = {}): EditionComparison {
  return {
    originAt2026: 0,
    points2025: ramp(0, 600, 800),
    points2026: ramp(0, 600, 1_000),
    has2026Curve: true,
    current2026Eur: 10_000,
    current2026Minutes: 600,
    final2025Eur: 8_000,
    eur2025SameElapsed: 8_000,
    deltaEur: 2_000,
    projected2026Eur: null,
    eurPerHour: 1_000,
    maxMinutes: 600,
    ...overrides,
  };
}

describe('comparisonSlice', () => {
  it('cadre tout l’événement depuis zéro', () => {
    const slice = comparisonSlice(comparison(), null);
    expect(slice.fromMinutes).toBe(0);
    expect(slice.yMin).toBe(0);
    expect(slice.spanMinutes).toBe(600);
    expect(slice.yMax).toBeGreaterThanOrEqual(10_000);
  });

  it('laisse une projection proche étirer un peu l’axe', () => {
    const slice = comparisonSlice(comparison({ projected2026Eur: 11_000 }), null);
    expect(slice.yMax).toBeCloseTo(11_000 * 1.05, 5);
  });

  it('ne laisse pas une projection démesurée écraser les courbes', () => {
    // Trois fois le maximum réel : au-delà du plafond, l'axe reste sur ce qui est collecté.
    const slice = comparisonSlice(comparison({ projected2026Eur: 30_000 }), null);
    expect(slice.yMax).toBeCloseTo(10_000 * 1.2 * 1.05, 5);
  });

  it('rebase la fenêtre sur son début', () => {
    const slice = comparisonSlice(comparison(), 120);
    expect(slice.fromMinutes).toBe(480);
    expect(slice.spanMinutes).toBe(120);
    expect(slice.points2026[0]?.minutes).toBe(0);
    expect(slice.points2026.at(-1)?.minutes).toBe(120);
  });

  it('relève le plancher de l’axe sur une fenêtre courte', () => {
    const slice = comparisonSlice(comparison(), 120);
    // La tranche va de 6 400 € à 10 000 € : un axe partant de zéro écraserait l’écart.
    expect(slice.yMin).toBeGreaterThan(5_000);
    expect(slice.yMax).toBeGreaterThan(10_000);
  });

  it('interpole les valeurs aux bords de la fenêtre', () => {
    const slice = comparisonSlice(comparison(), 125);
    // 475 min ne tombe pas sur un relevé : la courbe part quand même du bord gauche.
    expect(slice.fromMinutes).toBe(475);
    expect(slice.points2026[0]?.minutes).toBe(0);
    expect(slice.points2026[0]?.eur).toBeCloseTo((475 / 60) * 1_000, 5);
  });

  it('convertit dans l’unité affichée avant de calculer l’échelle', () => {
    const slice = comparisonSlice(comparison(), null, (eur) => (eur / 8_000) * 100);
    expect(slice.yMax).toBeCloseTo(125 * 1.05, 5);
  });

  it('rend un cadre vide plutôt qu’une échelle inventée', () => {
    const slice = comparisonSlice(
      comparison({ points2025: [], points2026: [], current2026Minutes: 0 }),
      120,
    );
    expect(slice.points2026).toEqual([]);
    expect(slice.yMax).toBe(1);
  });

  it('garde une fenêtre lisible en tout début d’édition', () => {
    const slice = comparisonSlice(comparison({ current2026Minutes: 20 }), 720);
    expect(slice.fromMinutes).toBe(0);
    expect(slice.spanMinutes).toBeGreaterThanOrEqual(60);
  });
});

describe('referenceValues', () => {
  it('pose des repères ronds dans le cadre', () => {
    expect(referenceValues(0, 16_000_000)).toEqual([5_000_000, 10_000_000, 15_000_000]);
  });

  it('s’adapte à une tranche resserrée', () => {
    const values = referenceValues(9_800_000, 10_200_000);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).toBeGreaterThan(9_800_000);
      expect(value).toBeLessThan(10_200_000);
    }
  });

  it('ne rend rien sur un cadre plat', () => {
    expect(referenceValues(100, 100)).toEqual([]);
  });
});

describe('elapsedTicks', () => {
  const label = (minutes: number) => `T+${Math.round(minutes / 60)} h`;

  it('libelle les graduations avec la position réelle dans l’édition', () => {
    const ticks = elapsedTicks(480, 120, label);
    expect(ticks[0]).toEqual({ minutes: 0, label: 'T+8 h' });
    // Jusqu'au bord du cadre : la dernière graduation marque la fin du tracé, pas 92 % de lui.
    expect(ticks.at(-1)).toEqual({ minutes: 120, label: 'T+10 h' });
  });

  it('espace les graduations selon l’amplitude', () => {
    const weekend = elapsedTicks(0, 72 * 60, label);
    expect(weekend[1].minutes - weekend[0].minutes).toBe(12 * 60);
  });
});
