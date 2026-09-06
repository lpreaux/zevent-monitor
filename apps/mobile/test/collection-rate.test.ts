import { describe, expect, it } from 'vitest';

import type { RatePoint } from '@/api/donations';
import {
  buildCollectionRate,
  compareLastWindow,
  cumulative2025At,
  rate2025Between,
} from '@/lib/collection-rate';
import { OFFSET_2025_MINUTES } from '@/lib/stats-edition';
import type { ElapsedPoint } from '@/lib/timeseries';

/** T+0 de 2026, l'origine de l'axe du temps écoulé. */
const ORIGIN = Date.parse('2026-09-03T18:00:00.000Z');

/**
 * Courbe 2025 recalée : rien avant `OFFSET_2025_MINUTES`, puis 60 000 € par heure
 * pendant dix heures. Son premier point vaut 1 000 €, comme la vraie — son T+0 est le
 * premier point au-dessus du seuil de collecte, pas un zéro.
 */
function curve2025(hours = 10): ElapsedPoint[] {
  return Array.from({ length: hours + 1 }, (_, hour) => ({
    minutes: OFFSET_2025_MINUTES + hour * 60,
    eur: 1_000 + hour * 60_000,
  }));
}

/** Tranche du backend, posée à `elapsed` minutes du T+0 de 2026. */
function bucket(elapsedMinutes: number, raisedEur: number, samples = 6): RatePoint {
  return {
    bucket: new Date(ORIGIN + elapsedMinutes * 60_000).toISOString(),
    endCents: 0,
    raisedCents: Math.round(raisedEur * 100),
    peakViewers: 12_000,
    samples,
  };
}

function build(points: RatePoint[], bucketMinutes = 60, points2025 = curve2025()) {
  return buildCollectionRate({ points, bucketMinutes, points2025, originAt2026: ORIGIN });
}

describe('rate2025Between', () => {
  it('dérive un rythme des différences de la courbe cumulative', () => {
    const curve = curve2025();
    expect(rate2025Between(curve, OFFSET_2025_MINUTES + 60, OFFSET_2025_MINUTES + 120)).toBeCloseTo(
      60_000,
      5,
    );
    // Une demi-heure prise au milieu d'un palier vaut la moitié de sa pente.
    expect(rate2025Between(curve, OFFSET_2025_MINUTES + 90, OFFSET_2025_MINUTES + 120)).toBeCloseTo(
      30_000,
      5,
    );
  });

  it('compte pour zéro ce que 2025 levait avant d’ouvrir sa cagnotte', () => {
    const curve = curve2025();
    expect(cumulative2025At(curve, 10)).toBe(0);
    expect(rate2025Between(curve, 0, 60)).toBe(0);
  });

  it('rend à la tranche d’ouverture les premiers euros de 2025', () => {
    // Le premier point de la courbe vaut déjà 1 000 € : la tranche qui l'englobe lève
    // donc 61 000 € et non 60 000 €.
    expect(rate2025Between(curve2025(), OFFSET_2025_MINUTES, OFFSET_2025_MINUTES + 60)).toBeCloseTo(
      61_000,
      5,
    );
  });

  it('n’extrapole rien au-delà du dernier point connu de 2025', () => {
    const curve = curve2025(2);
    expect(rate2025Between(curve, OFFSET_2025_MINUTES + 120, OFFSET_2025_MINUTES + 180)).toBeNull();
  });

  it('ne renvoie pas de rythme négatif sur un repli de la courbe', () => {
    const curve: ElapsedPoint[] = [
      { minutes: 0, eur: 1_000 },
      { minutes: 60, eur: 2_000 },
      { minutes: 120, eur: 1_900 },
    ];
    expect(rate2025Between(curve, 60, 120)).toBe(0);
  });

  it('n’a rien à dire sans courbe 2025', () => {
    expect(cumulative2025At([], 100)).toBeNull();
    expect(rate2025Between([], 0, 60)).toBeNull();
  });
});

describe('buildCollectionRate', () => {
  it('apparie chaque tranche 2026 à la même tranche de l’édition 2025', () => {
    const model = build([bucket(OFFSET_2025_MINUTES + 60, 90_000)]);
    expect(model.buckets[0]?.eur).toBeCloseTo(90_000, 5);
    expect(model.buckets[0]?.eur2025).toBeCloseTo(60_000, 5);
    expect(model.buckets[0]?.gap).toBeCloseTo(0.5, 5);
  });

  it('suit la taille de tranche demandée', () => {
    const model = build([bucket(OFFSET_2025_MINUTES + 60, 90_000)], 180);
    expect(model.buckets[0]?.eur2025).toBeCloseTo(180_000, 5);
  });

  it('n’exprime aucun pourcentage quand 2025 n’avait pas encore ouvert', () => {
    const model = build([bucket(0, 90_000)]);
    expect(model.buckets[0]?.eur2025).toBe(0);
    expect(model.buckets[0]?.gap).toBeNull();
  });

  it('n’exprime aucun pourcentage sur une base 2025 dérisoire', () => {
    // 6 minutes de 2025 ne pèsent que 6 000 € ici : on ramène la pente pour passer sous
    // le seuil de comparaison sans sortir de la courbe.
    const model = build([bucket(OFFSET_2025_MINUTES + 60, 90_000)], 60, [
      { minutes: OFFSET_2025_MINUTES, eur: 100 },
      { minutes: OFFSET_2025_MINUTES + 600, eur: 900 },
    ]);
    expect(model.buckets[0]?.eur2025).toBeCloseTo(80, 5);
    expect(model.buckets[0]?.gap).toBeNull();
  });

  it('laisse l’histogramme 2026 seul tant que le T+0 est inconnu', () => {
    const model = buildCollectionRate({
      points: [bucket(0, 90_000)],
      bucketMinutes: 60,
      points2025: curve2025(),
      originAt2026: null,
    });
    expect(model.buckets[0]?.eur).toBeCloseTo(90_000, 5);
    expect(model.buckets[0]?.eur2025).toBeNull();
    expect(model.average2025Eur).toBeNull();
  });

  it('écarte les tranches qu’aucun échantillon ne couvre', () => {
    const model = build([
      bucket(OFFSET_2025_MINUTES + 60, 90_000),
      bucket(OFFSET_2025_MINUTES + 120, 0, 0),
    ]);
    expect(model.buckets).toHaveLength(1);
  });

  it('résume le pic et les moyennes des deux éditions', () => {
    const model = build([
      bucket(OFFSET_2025_MINUTES + 60, 40_000),
      bucket(OFFSET_2025_MINUTES + 120, 100_000),
      bucket(OFFSET_2025_MINUTES + 180, 60_000),
    ]);
    expect(model.peak?.eur).toBeCloseTo(100_000, 5);
    expect(model.peak?.key).toBe(model.buckets[1]?.key);
    expect(model.averageEur).toBeCloseTo(66_666.666, 2);
    expect(model.average2025Eur).toBeCloseTo(60_000, 5);
  });

  it('ne fabrique ni pic ni moyenne sur une série vide', () => {
    const model = build([]);
    expect(model.buckets).toEqual([]);
    expect(model.peak).toBeNull();
    expect(model.averageEur).toBe(0);
    expect(model.average2025Eur).toBeNull();
  });
});

describe('compareLastWindow', () => {
  it('mesure l’avance de 2026 sur la dernière heure', () => {
    const result = compareLastWindow(curve2025(), OFFSET_2025_MINUTES + 120, 91_200);
    expect(result.eur2025).toBeCloseTo(60_000, 5);
    expect(result.gap).toBeCloseTo(0.52, 5);
    expect(result.before2025Opening).toBe(false);
  });

  it('dit le retard aussi bien que l’avance', () => {
    const result = compareLastWindow(curve2025(), OFFSET_2025_MINUTES + 120, 30_000);
    expect(result.gap).toBeCloseTo(-0.5, 5);
  });

  it('ne compare pas à une édition qui n’avait pas encore ouvert', () => {
    const result = compareLastWindow(curve2025(), 120, 90_000);
    expect(result.eur2025).toBe(0);
    expect(result.gap).toBeNull();
    expect(result.before2025Opening).toBe(true);
  });

  it('ne compare rien tant que le rythme 2026 n’est pas mesurable', () => {
    const result = compareLastWindow(curve2025(), OFFSET_2025_MINUTES + 120, null);
    expect(result.eur).toBeNull();
    expect(result.gap).toBeNull();
  });

  it('respecte la fenêtre sur laquelle le rythme a été mesuré', () => {
    const result = compareLastWindow(curve2025(), OFFSET_2025_MINUTES + 180, 120_000, 120);
    expect(result.eur2025).toBeCloseTo(120_000, 5);
    expect(result.gap).toBeCloseTo(0, 5);
    expect(result.windowMinutes).toBe(120);
  });
});
