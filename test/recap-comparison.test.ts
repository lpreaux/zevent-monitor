import { describe, expect, it } from 'vitest';

import type { Recap, RecapContent } from '@/api/recaps';
import {
  buildRecapComparison,
  eurAt,
  formatComparisonRatio,
  weekAlignedOffsetMs,
  type EditionHistory,
} from '@/lib/recap-comparison';

const content = (raisedCents: number): RecapContent => ({
  version: 3,
  summary: { startCents: 0, endCents: raisedCents, raisedCents, peakViewers: 0, shareOfTotal: null },
  counts: { milestones: 0, bigDonations: 0, liveStarts: 0, goalsReached: 0 },
  milestones: [], bigDonations: [], liveStarts: [], goalsReached: [],
  topProgressions: [], progressions: [], highlights: [],
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Collecte 2026 démarrée au concert du jeudi soir, 3 septembre 20 h à Paris. */
const ORIGIN_2026 = Date.parse('2026-09-03T18:00:00.000Z');
/** Premier relevé 2025 : vendredi 5 septembre 18 h à Paris. */
const FIRST_2025 = Date.parse('2025-09-05T16:00:00.000Z');

/** Journée « Samedi » 2026 : samedi 9 h → dimanche 9 h, heure de Paris. */
const recap = (over: Partial<Recap> = {}): Recap => ({
  id: 'day-2026-09-05',
  kind: 'day',
  title: 'Samedi',
  periodStart: '2026-09-05T07:00:00.000Z',
  periodEnd: '2026-09-06T07:00:00.000Z',
  generatedAt: '2026-09-06T07:00:00.000Z',
  content: content(900_000_000),
  ...over,
});

/**
 * Courbe 2025 : rien à l'ouverture, 3 M€ au samedi matin, 9 M€ au dimanche matin.
 * Le samedi 2025 vaut donc 6 M€.
 */
const history = (): EditionHistory => ({
  originAt2026: ORIGIN_2026,
  points: [
    { t: FIRST_2025, eur: 0 },
    { t: Date.parse('2025-09-06T07:00:00.000Z'), eur: 3_000_000 },
    { t: Date.parse('2025-09-07T07:00:00.000Z'), eur: 9_000_000 },
    { t: Date.parse('2025-09-07T23:00:00.000Z'), eur: 16_000_000 },
  ],
});

describe('alignement des deux éditions', () => {
  it('décale d’un nombre entier de semaines, pour retomber sur le même jour', () => {
    const offset = weekAlignedOffsetMs(ORIGIN_2026, FIRST_2025);

    expect(offset / DAY_MS).toBe(364);
    expect(offset % (7 * DAY_MS)).toBe(0);
  });

  it('met le samedi 2026 en face du samedi 2025', () => {
    const offset = weekAlignedOffsetMs(ORIGIN_2026, FIRST_2025);
    const sameDay = new Date(Date.parse('2026-09-05T07:00:00.000Z') - offset);

    expect(sameDay.toISOString()).toBe('2025-09-06T07:00:00.000Z');
    // Les deux tombent un samedi : c'est tout l'objet de l'arrondi.
    expect(sameDay.getUTCDay()).toBe(new Date('2026-09-05T07:00:00.000Z').getUTCDay());
  });

  it('ignore le décalage d’ouverture entre les deux éditions', () => {
    // 2026 ouvre au concert du jeudi, 2025 seulement le vendredi : 22 h d'écart brut,
    // que l'arrondi à la semaine efface au lieu de décaler les journées d'un cran.
    const raw = (ORIGIN_2026 - FIRST_2025) / DAY_MS;

    expect(raw).toBeGreaterThan(363);
    expect(raw).toBeLessThan(364);
    expect(weekAlignedOffsetMs(ORIGIN_2026, FIRST_2025) / DAY_MS).toBe(364);
  });
});

describe('comparaison à 2025', () => {
  it('compare le samedi au samedi, pas au dimanche', () => {
    const comparison = buildRecapComparison(recap(), history());

    // 6 M€ le samedi 2025, contre 9 M€ le samedi 2026.
    expect(comparison.edition2025?.raisedCents).toBe(600_000_000);
    expect(comparison.edition2025?.ratio).toBeCloseTo(0.5, 5);
  });

  it('ne dit rien hors de la plage couverte par 2025', () => {
    const late = recap({
      periodStart: '2026-09-08T07:00:00.000Z',
      periodEnd: '2026-09-09T07:00:00.000Z',
    });

    expect(buildRecapComparison(late, history()).edition2025).toBeNull();
  });

  it('ne dit rien tant que la collecte 2026 n’a pas d’origine', () => {
    expect(
      buildRecapComparison(recap(), { ...history(), originAt2026: null }).edition2025,
    ).toBeNull();
  });

  it('ne compare pas une période sans équivalent, faute d’historique', () => {
    expect(buildRecapComparison(recap(), null).edition2025).toBeNull();
  });
});

describe('lecture de la courbe 2025', () => {
  it('interpole entre les deux relevés qui encadrent l’instant', () => {
    // Milieu du samedi 2025 : à mi-chemin entre 3 M€ et 9 M€.
    expect(eurAt(history().points, Date.parse('2025-09-06T19:00:00.000Z'))).toBeCloseTo(6_000_000, 0);
  });

  it('refuse de prolonger la courbe au-delà de ce qui a été relevé', () => {
    expect(eurAt(history().points, Date.parse('2025-09-01T00:00:00.000Z'))).toBeNull();
    expect(eurAt(history().points, Date.parse('2025-09-10T00:00:00.000Z'))).toBeNull();
    expect(eurAt([], Date.now())).toBeNull();
  });
});

describe('comparaison à la veille', () => {
  it('mesure l’écart avec la journée précédente', () => {
    const comparison = buildRecapComparison(
      recap({ previous: { title: 'Vendredi', raisedCents: 720_000_000 } }),
      null,
    );

    expect(comparison.previous?.title).toBe('Vendredi');
    expect(comparison.previous?.ratio).toBeCloseTo(0.25, 5);
  });

  it('ne compare rien quand le serveur n’a pas jugé la veille comparable', () => {
    expect(buildRecapComparison(recap(), null).previous).toBeNull();
  });

  it('reste muet face à une veille à zéro plutôt que d’annoncer l’infini', () => {
    expect(
      buildRecapComparison(recap({ previous: { title: 'Ouverture', raisedCents: 0 } }), null)
        .previous,
    ).toBeNull();
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
