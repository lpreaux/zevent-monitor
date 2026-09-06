import { describe, expect, it } from 'vitest';

import type { RatePoint } from '../src/api/donations';
import {
  audienceContrast,
  audienceGenerosity,
  audienceTicks,
  buildAudienceCurve,
  completeHours,
  mostWatchedHours,
} from '../src/lib/audience';

/** Jeudi 20 h à Paris : l'ouverture de la cagnotte 2026, donc le T+0 de la courbe. */
const ORIGIN = Date.parse('2026-09-03T18:00:00Z');

function sample(minutes: number, viewers: number) {
  return { t: ORIGIN + minutes * 60_000, viewers };
}

function hour(hoursAfterOrigin: number, raisedCents: number, peakViewers: number): RatePoint {
  const start = ORIGIN + hoursAfterOrigin * 3_600_000;
  return {
    bucket: new Date(start).toISOString(),
    endCents: raisedCents,
    raisedCents,
    peakViewers,
    samples: 6,
  };
}

describe('buildAudienceCurve', () => {
  it('convertit les relevés en minutes écoulées depuis T+0', () => {
    const curve = buildAudienceCurve([sample(0, 10_000), sample(30, 40_000), sample(90, 25_000)], ORIGIN);
    expect(curve.points.map((p) => p.minutes)).toEqual([0, 30, 90]);
    expect(curve.points.map((p) => p.eur)).toEqual([10_000, 40_000, 25_000]);
    expect(curve.spanMinutes).toBe(90);
  });

  it('retient le pic et l’instant où il a eu lieu', () => {
    const curve = buildAudienceCurve([sample(0, 10_000), sample(30, 40_000), sample(90, 25_000)], ORIGIN);
    expect(curve.peak).toEqual({ viewers: 40_000, at: ORIGIN + 30 * 60_000 });
  });

  it('garde le premier relevé d’un plateau', () => {
    const curve = buildAudienceCurve([sample(10, 40_000), sample(20, 40_000)], ORIGIN);
    expect(curve.peak?.at).toBe(ORIGIN + 10 * 60_000);
  });

  it('remet les relevés en ordre et écarte ceux d’avant T+0', () => {
    const curve = buildAudienceCurve([sample(60, 30_000), sample(-120, 90_000), sample(20, 12_000)], ORIGIN);
    expect(curve.points.map((p) => p.minutes)).toEqual([20, 60]);
    // Le pic d'avant-collecte ne compte pas : il n'est pas sur la courbe tracée.
    expect(curve.peak?.viewers).toBe(30_000);
  });

  it('ne rend ni courbe ni pic sans série exploitable', () => {
    expect(buildAudienceCurve([], ORIGIN)).toEqual({ points: [], spanMinutes: 0, peak: null });
    expect(buildAudienceCurve([sample(0, 1_000)], null)).toEqual({
      points: [],
      spanMinutes: 0,
      peak: null,
    });
    // Relevés à zéro : des points à tracer, mais aucun pic à annoncer.
    expect(buildAudienceCurve([sample(0, 0), sample(10, 0)], ORIGIN).peak).toBeNull();
  });
});

describe('audienceTicks', () => {
  it('gradue l’axe en heure de Paris, par pas de douze heures', () => {
    // La dernière graduation tombe sur le bord du cadre : son libellé s'y aligne au lieu
    // de déborder, et l'axe cesse de sembler s'arrêter avant la fin du tracé.
    expect(audienceTicks(ORIGIN, 48 * 60)).toEqual([
      { minutes: 0, label: '20h00' },
      { minutes: 720, label: '08h00' },
      { minutes: 1_440, label: '20h00' },
      { minutes: 2_160, label: '08h00' },
      { minutes: 2_880, label: '20h00' },
    ]);
  });

  it('ne gradue rien sans origine ni étendue', () => {
    expect(audienceTicks(null, 48 * 60)).toEqual([]);
    expect(audienceTicks(ORIGIN, 0)).toEqual([]);
  });
});

describe('completeHours', () => {
  it('écarte la tranche en cours', () => {
    const points = [hour(0, 100_000, 50_000), hour(1, 200_000, 60_000)];
    const now = ORIGIN + 90 * 60_000;
    expect(completeHours(points, 60, now).map((p) => p.bucket)).toEqual([points[0].bucket]);
  });

  it('rend les tranches dans l’ordre chronologique', () => {
    const points = [hour(2, 300_000, 70_000), hour(0, 100_000, 50_000), hour(1, 200_000, 60_000)];
    const now = ORIGIN + 10 * 3_600_000;
    expect(completeHours(points, 60, now).map((p) => p.peakViewers)).toEqual([50_000, 60_000, 70_000]);
  });
});

describe('mostWatchedHours', () => {
  it('classe les tranches par audience décroissante', () => {
    const points = [hour(0, 100_000, 50_000), hour(1, 200_000, 90_000), hour(2, 300_000, 70_000)];
    expect(mostWatchedHours(points, 2)).toEqual([
      { bucket: points[1].bucket, raisedEur: 2_000, peakViewers: 90_000 },
      { bucket: points[2].bucket, raisedEur: 3_000, peakViewers: 70_000 },
    ]);
  });

  it('ignore les tranches sans audience relevée', () => {
    expect(mostWatchedHours([hour(0, 100_000, 0)])).toEqual([]);
  });
});

describe('audienceContrast', () => {
  it('distingue l’heure la plus regardée de la plus généreuse', () => {
    const points = [hour(0, 100_000, 90_000), hour(1, 900_000, 40_000)];
    const contrast = audienceContrast(points);
    expect(contrast?.mostWatched.peakViewers).toBe(90_000);
    expect(contrast?.mostGenerous.raisedEur).toBe(9_000);
    expect(contrast?.sameHour).toBe(false);
  });

  it('signale les week-ends où les deux pics tombent ensemble', () => {
    const points = [hour(0, 900_000, 90_000), hour(1, 100_000, 40_000)];
    expect(audienceContrast(points)?.sameHour).toBe(true);
  });

  it('renvoie null tant qu’il manque un des deux pics', () => {
    expect(audienceContrast([])).toBeNull();
    expect(audienceContrast([hour(0, 100_000, 0)])).toBeNull();
    expect(audienceContrast([hour(0, 0, 50_000)])).toBeNull();
  });
});

describe('audienceGenerosity', () => {
  it('rapporte les euros d’une heure à l’audience de cette heure', () => {
    // 1 000 € levés pendant une heure vue par 50 000 spectateurs = 50 viewers-heure
    // (en milliers), soit 20 € pour mille spectateurs connectés une heure durant.
    expect(audienceGenerosity([hour(0, 100_000, 50_000)], 60)?.eurPerThousandViewerHours).toBeCloseTo(20);
  });

  it('cumule les tranches avant de diviser', () => {
    const result = audienceGenerosity([hour(0, 100_000, 50_000), hour(1, 300_000, 50_000)], 60);
    expect(result?.raisedEur).toBe(4_000);
    expect(result?.thousandViewerHours).toBeCloseTo(100);
    expect(result?.eurPerThousandViewerHours).toBeCloseTo(40);
    expect(result?.hours).toBe(2);
  });

  it('tient compte de la largeur des tranches', () => {
    // Même audience, mais une demi-heure d'exposition : le ratio double.
    expect(audienceGenerosity([hour(0, 100_000, 50_000)], 30)?.eurPerThousandViewerHours).toBeCloseTo(40);
  });

  it('renvoie null plutôt que de diviser par une audience nulle', () => {
    expect(audienceGenerosity([], 60)).toBeNull();
    expect(audienceGenerosity([hour(0, 500_000, 0)], 60)).toBeNull();
    expect(audienceGenerosity([hour(0, 500_000, 50_000)], 0)).toBeNull();
  });

  it('écarte les tranches sans audience, leurs euros compris', () => {
    const withBlind = audienceGenerosity([hour(0, 100_000, 50_000), hour(1, 900_000, 0)], 60);
    expect(withBlind?.raisedEur).toBe(1_000);
    expect(withBlind?.eurPerThousandViewerHours).toBeCloseTo(20);
  });
});
