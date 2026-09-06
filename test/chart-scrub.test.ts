import { describe, expect, it } from 'vitest';

import {
  minutesAtX,
  readSeriesAt,
  scrubCaption,
  valueRatio,
  xAtMinutes,
  type ScrubReading,
} from '../src/lib/chart-scrub';

/** Série au pas de 10 min, de `0` à `points - 1`, croissant de `stepEur` par point. */
function series(id: string, points: number, stepEur: number) {
  return {
    id,
    label: id,
    color: '#8b5cf6',
    points: Array.from({ length: points }, (_, i) => ({ minutes: i * 10, eur: i * stepEur })),
  };
}

describe('minutesAtX', () => {
  it('convertit l’abscisse en minutes écoulées', () => {
    expect(minutesAtX(150, 300, 3_000)).toBeCloseTo(1_500);
    expect(minutesAtX(0, 300, 3_000)).toBe(0);
  });

  it('borne le doigt sorti du cadre', () => {
    expect(minutesAtX(-80, 300, 3_000)).toBe(0);
    expect(minutesAtX(999, 300, 3_000)).toBe(3_000);
  });

  it('renvoie zéro tant que le cadre n’est pas mesuré', () => {
    expect(minutesAtX(120, 0, 3_000)).toBe(0);
    expect(minutesAtX(120, 300, 0)).toBe(0);
    expect(minutesAtX(Number.NaN, 300, 3_000)).toBe(0);
  });
});

describe('xAtMinutes', () => {
  it('replace un instant sur l’axe, et borne au cadre', () => {
    expect(xAtMinutes(1_500, 300, 3_000)).toBeCloseTo(150);
    expect(xAtMinutes(9_000, 300, 3_000)).toBe(300);
    expect(xAtMinutes(-10, 300, 3_000)).toBe(0);
  });

  it('fait l’aller-retour avec minutesAtX', () => {
    expect(xAtMinutes(minutesAtX(87, 300, 3_000), 300, 3_000)).toBeCloseTo(87);
  });
});

describe('valueRatio', () => {
  it('mesure la hauteur relative dans le cadre', () => {
    expect(valueRatio(500, 0, 1_000)).toBeCloseTo(0.5);
    // Plancher relevé : c’est la tranche qui compte, pas la distance à zéro.
    expect(valueRatio(1_500, 1_000, 2_000)).toBeCloseTo(0.5);
  });

  it('borne hors du cadre et sur une échelle plate', () => {
    expect(valueRatio(-40, 0, 1_000)).toBe(0);
    expect(valueRatio(4_000, 0, 1_000)).toBe(1);
    expect(valueRatio(500, 1_000, 1_000)).toBe(0);
  });
});

describe('readSeriesAt', () => {
  it('interpole chaque série au même instant, dans l’ordre reçu', () => {
    const readings = readSeriesAt([series('2026', 7, 1_000), series('2025', 7, 500)], 25);
    expect(readings.map((r) => r.id)).toEqual(['2026', '2025']);
    expect(readings[0].eur).toBeCloseTo(2_500);
    expect(readings[1].eur).toBeCloseTo(1_250);
  });

  it('n’extrapole pas la série qui ne va pas jusque-là', () => {
    const readings = readSeriesAt([series('2026', 7, 1_000), series('2025', 3, 500)], 50);
    expect(readings[0].eur).toBeCloseTo(5_000);
    expect(readings[1].eur).toBeNull();
  });

  it('supporte une série vide', () => {
    const empty = [{ id: 'x', label: 'x', color: '#fff', points: [] }];
    expect(readSeriesAt(empty, 10)[0].eur).toBeNull();
  });
});

describe('scrubCaption', () => {
  const euros = (value: number) => `${Math.round(value)} €`;
  const reading = (label: string, eur: number | null): ScrubReading => ({
    id: label,
    label,
    color: '#8b5cf6',
    eur,
  });

  it('aligne les séries derrière l’instant lu', () => {
    expect(
      scrubCaption('T+18 h', [reading('2026', 6_200_000), reading('2025', 5_100_000)], euros),
    ).toBe('T+18 h — 2026 : 6200000 € · 2025 : 5100000 €');
  });

  it('tait la série muette à cet instant, sans perdre le nom de l’autre', () => {
    expect(scrubCaption('T+18 h', [reading('2026', 6_200), reading('2025', null)], euros)).toBe(
      'T+18 h — 2026 : 6200 €',
    );
  });

  it('n’étiquette pas une série seule', () => {
    expect(scrubCaption('T+2 h', [reading('Ponce', 1_200)], euros)).toBe('T+2 h — 1200 €');
  });

  it('le dit quand rien n’est relevé ici', () => {
    expect(scrubCaption('T+50 h', [reading('2026', null)], euros)).toBe(
      'T+50 h — pas de relevé ici',
    );
    expect(scrubCaption('T+50 h', [], euros)).toBe('T+50 h — pas de relevé ici');
  });
});
