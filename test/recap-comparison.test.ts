import { describe, expect, it } from 'vitest';

import type { Recap, RecapContent } from '@/api/recaps';
import { buildRecapComparison, formatComparisonRatio } from '@/lib/recap-comparison';
import type { EditionComparison } from '@/lib/stats-edition';

const content = (raisedCents: number): RecapContent => ({
  version: 3,
  summary: { startCents: 0, endCents: raisedCents, raisedCents, peakViewers: 0, shareOfTotal: null },
  counts: { milestones: 0, bigDonations: 0, liveStarts: 0, goalsReached: 0 },
  milestones: [], bigDonations: [], liveStarts: [], goalsReached: [],
  topProgressions: [], progressions: [], highlights: [],
});

const origin = Date.parse('2026-09-04T18:00:00.000Z');

/** Journée fictive : deux heures après l'ouverture, jusqu'à quatre heures après. */
const recap = (over: Partial<Recap> = {}): Recap => ({
  id: 'day-2026-09-05',
  kind: 'day',
  periodStart: new Date(origin + 120 * 60_000).toISOString(),
  periodEnd: new Date(origin + 240 * 60_000).toISOString(),
  generatedAt: new Date(origin + 240 * 60_000).toISOString(),
  content: content(1_000_000),
  ...over,
});

/** 2025 recalée : 1 000 € à T+2 h, 6 000 € à T+4 h, donc 5 000 € sur la tranche. */
const editions = (): EditionComparison =>
  ({
    originAt2026: origin,
    points2025: [
      { minutes: 0, eur: 0 },
      { minutes: 120, eur: 1_000 },
      { minutes: 240, eur: 6_000 },
      { minutes: 360, eur: 9_000 },
    ],
  }) as EditionComparison;

describe('comparaison à la veille', () => {
  it('mesure l’écart avec la journée précédente', () => {
    const comparison = buildRecapComparison(
      recap({ previous: { title: 'Samedi', raisedCents: 800_000 } }),
      null,
    );

    expect(comparison.previous?.title).toBe('Samedi');
    expect(comparison.previous?.ratio).toBeCloseTo(0.25, 5);
  });

  it('ne compare rien quand le serveur n’a pas jugé la veille comparable', () => {
    expect(buildRecapComparison(recap(), null).previous).toBeNull();
  });

  it('reste muet face à une veille à zéro plutôt que d’annoncer l’infini', () => {
    const comparison = buildRecapComparison(
      recap({ previous: { title: 'Ouverture', raisedCents: 0 } }),
      null,
    );

    expect(comparison.previous).toBeNull();
  });
});

describe('comparaison à 2025', () => {
  it('lit la même tranche de temps écoulé, pas la même date', () => {
    // 5 000 € en 2025 contre 10 000 € en 2026 : le double.
    const comparison = buildRecapComparison(recap(), editions());

    expect(comparison.edition2025?.raisedCents).toBe(500_000);
    expect(comparison.edition2025?.ratio).toBeCloseTo(1, 5);
  });

  it('ne dit rien hors de la plage couverte par 2025', () => {
    const late = recap({
      periodStart: new Date(origin + 600 * 60_000).toISOString(),
      periodEnd: new Date(origin + 720 * 60_000).toISOString(),
    });

    expect(buildRecapComparison(late, editions()).edition2025).toBeNull();
  });

  it('ne dit rien tant que la collecte 2026 n’a pas d’origine', () => {
    const noOrigin = { ...editions(), originAt2026: null } as EditionComparison;

    expect(buildRecapComparison(recap(), noOrigin).edition2025).toBeNull();
  });
});

describe('énoncé de l’écart', () => {
  it('nomme le sens de l’écart', () => {
    expect(formatComparisonRatio(0.18)).toBe('+18 %');
    expect(formatComparisonRatio(-0.04)).toBe('−4 %');
  });

  it('renonce au pourcentage quand les deux périodes se valent', () => {
    expect(formatComparisonRatio(0.005)).toBe('au même niveau');
  });
});
