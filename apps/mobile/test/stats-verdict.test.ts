import { describe, expect, it } from 'vitest';

import type { EditionComparison } from '@/lib/stats-edition';
import { buildVerdict } from '@/lib/stats-verdict';

/** Comparaison minimale : seuls les champs que le verdict consulte importent ici. */
function comparison(overrides: Partial<EditionComparison>): EditionComparison {
  return {
    originAt2026: 0,
    points2025: [],
    points2026: [],
    has2026Curve: true,
    current2026Eur: 0,
    current2026Minutes: 0,
    final2025Eur: 16_000_000,
    eur2025SameElapsed: null,
    deltaEur: null,
    projected2026Eur: null,
    eurPerHour: null,
    maxMinutes: 60,
    ...overrides,
  };
}

const amount = (value: number) => `${Math.round(value)} €`;

describe('buildVerdict', () => {
  it('attend d’avoir une courbe avant de comparer', () => {
    const verdict = buildVerdict(comparison({ has2026Curve: false }), amount);
    expect(verdict.tone).toBe('idle');
  });

  it('ne conclut rien hors de la plage couverte par 2025', () => {
    expect(buildVerdict(comparison({ deltaEur: null }), amount).tone).toBe('idle');
  });

  it('annonce l’avance sans la présenter comme un rythme quand 2025 n’avait pas ouvert', () => {
    const verdict = buildVerdict(
      comparison({ deltaEur: 40_000, eur2025SameElapsed: 0 }),
      amount,
    );
    expect(verdict.tone).toBe('ahead');
    expect(verdict.headline).toBe('40000 € d’avance');
    expect(verdict.detail).toContain('n’avait pas encore ouvert');
  });

  it('cite le montant de référence quand la comparaison tient', () => {
    const verdict = buildVerdict(
      comparison({ deltaEur: 1_240_000, eur2025SameElapsed: 9_800_000 }),
      amount,
    );
    expect(verdict.tone).toBe('ahead');
    expect(verdict.headline).toBe('+1240000 € d’avance');
    expect(verdict.detail).toContain('9800000 €');
  });

  it('dit le retard avec un signe moins typographique', () => {
    const verdict = buildVerdict(
      comparison({ deltaEur: -320_000, eur2025SameElapsed: 9_800_000 }),
      amount,
    );
    expect(verdict.tone).toBe('behind');
    expect(verdict.headline).toBe('−320000 € de retard');
  });
});
