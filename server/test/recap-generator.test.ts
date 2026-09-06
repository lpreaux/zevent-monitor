import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { recapBody } from '../src/jobs/recaps.js';
import { floorToMinute } from '../src/recaps/content-cache.js';
import { generateRecapContent, pickBestHour, seriesStepMinutes } from '../src/recaps/generator.js';

type Sample = {
  sampled_at: Date;
  donation_cents: string;
  viewers: number;
  state: { live: { twitch: string; display: string; donationAmount: { number: number } }[] };
};

type Event = { kind: string; occurred_at: Date; payload: Record<string, unknown> };
type Donation = { donor: string; amount_cents: number; created_at: Date };

const streamer = (twitch: string, euros: number) => ({
  twitch,
  display: twitch.toUpperCase(),
  donationAmount: { number: euros },
});

const sample = (isoDate: string, euros: number, viewers: number, live = [streamer('zerator', euros)]): Sample => ({
  sampled_at: new Date(isoDate),
  donation_cents: String(euros * 100),
  viewers,
  state: { live },
});

const donation = (isoDate: string, donor: string, euros: number): Donation => ({
  donor,
  amount_cents: euros * 100,
  created_at: new Date(isoDate),
});

/**
 * Base minimale : les requêtes du générateur, servies depuis des tableaux.
 *
 * `date_bin` est reproduit par un arrondi sur l'époque — tous les pas employés divisent la
 * journée, l'origine choisie par PostgreSQL et l'époque tombent donc sur les mêmes bornes.
 */
function fakeApp(samples: Sample[], events: Event[] = [], donations: Donation[] = []): FastifyInstance {
  const ordered = [...samples].sort((a, b) => a.sampled_at.getTime() - b.sampled_at.getTime());

  const bucket = (stepMinutes: number, from: Date, to: Date) => {
    const step = stepMinutes * 60_000;
    const last = new Map<number, Sample>();
    for (const item of ordered) {
      if (item.sampled_at < from || item.sampled_at > to) continue;
      last.set(Math.floor(item.sampled_at.getTime() / step) * step, item);
    }
    return [...last.entries()]
      .sort(([a], [b]) => a - b)
      .map(([at, item]) => ({ bucket: new Date(at), donation_cents: item.donation_cents }));
  };

  const query = async (sql: string, params: unknown[] = []) => {
    const [first, second, third] = params as [Date, Date, unknown];
    if (sql.includes("date_bin('60 minutes'")) return { rows: bucket(60, first, second) };
    if (sql.includes('date_bin(')) return { rows: bucket(Number(third), first, second) };
    if (sql.includes('GROUP BY lower(btrim(donor))')) {
      const anonymous = new Set(third as string[]);
      const totals = new Map<string, { donor: string; total: number; count: number }>();
      for (const item of donations) {
        if (item.created_at <= first || item.created_at > second) continue;
        const key = item.donor.trim().toLowerCase();
        if (anonymous.has(key)) continue;
        const entry = totals.get(key) ?? { donor: item.donor.trim(), total: 0, count: 0 };
        totals.set(key, { ...entry, total: entry.total + item.amount_cents, count: entry.count + 1 });
      }
      return {
        rows: [...totals.values()]
          .sort((a, b) => b.total - a.total)
          .map((item) => ({ donor: item.donor, total_cents: String(item.total), donations: item.count })),
      };
    }
    if (sql.includes('max(amount_cents)')) {
      const inRange = donations.filter((item) => item.created_at > first && item.created_at <= second);
      return {
        rows: [{
          donations: inRange.length,
          total_cents: inRange.length ? String(inRange.reduce((total, item) => total + item.amount_cents, 0)) : null,
          max_cents: inRange.length ? String(Math.max(...inRange.map((item) => item.amount_cents))) : null,
        }],
      };
    }
    if (sql.includes('max(viewers)')) {
      const inRange = ordered.filter((s) => s.sampled_at >= first! && s.sampled_at <= second!);
      return { rows: [{ peak: inRange.length ? Math.max(...inRange.map((s) => s.viewers)) : null }] };
    }
    if (sql.includes('detected_events')) {
      return { rows: events.filter((e) => e.occurred_at > first! && e.occurred_at <= second!) };
    }
    if (sql.includes('sampled_at > $1')) {
      return { rows: ordered.filter((s) => s.sampled_at > first! && s.sampled_at <= second!).slice(0, 1) };
    }
    return { rows: ordered.filter((s) => s.sampled_at <= first!).slice(-1) };
  };
  return { pg: { query } } as unknown as FastifyInstance;
}

const start = new Date('2026-09-05T00:00:00.000Z');
const end = new Date('2026-09-05T12:00:00.000Z');

describe('cumul de la cagnotte sur la période', () => {
  it('mesure la progression entre les bornes de la période', async () => {
    const app = fakeApp([
      sample('2026-09-04T23:00:00.000Z', 1_000_000, 50_000),
      sample('2026-09-05T06:00:00.000Z', 1_200_000, 90_000),
      sample('2026-09-05T11:59:00.000Z', 1_450_000, 70_000),
      sample('2026-09-05T13:00:00.000Z', 1_600_000, 60_000),
    ]);

    const content = await generateRecapContent(app, start, end);

    expect(content.summary.startCents).toBe(100_000_000);
    expect(content.summary.endCents).toBe(145_000_000);
    expect(content.summary.raisedCents).toBe(45_000_000);
    expect(content.summary.peakViewers).toBe(90_000);
    expect(content.summary.coverage.complete).toBe(true);
  });

  it('repart du premier échantillon disponible quand la collecte a démarré en cours de période', async () => {
    const app = fakeApp([
      sample('2026-09-05T04:00:00.000Z', 1_100_000, 60_000),
      sample('2026-09-05T11:00:00.000Z', 1_400_000, 80_000),
    ]);

    const content = await generateRecapContent(app, start, end);

    expect(content.summary.raisedCents).toBe(30_000_000);
    expect(content.summary.coverage.complete).toBe(false);
    expect(content.summary.coverage.start).toBe('2026-09-05T04:00:00.000Z');
  });

  it('annonce une période vide plutôt qu’un cumul inventé', async () => {
    const content = await generateRecapContent(fakeApp([]), start, end);

    expect(content.summary.raisedCents).toBe(0);
    expect(content.summary.endCents).toBeNull();
    expect(content.summary.coverage).toEqual({ start: null, end: null, complete: false });
  });

  it('conserve la cagnotte de fin même sans échantillon dans la période', async () => {
    const app = fakeApp([sample('2026-09-04T23:00:00.000Z', 1_000_000, 50_000)]);

    const content = await generateRecapContent(app, start, end);

    expect(content.summary.endCents).toBe(100_000_000);
    expect(content.summary.raisedCents).toBe(0);
  });

  it('rapporte la part de la cagnotte apportée par la période', async () => {
    const app = fakeApp([
      sample('2026-09-04T23:00:00.000Z', 750_000, 10),
      sample('2026-09-05T11:00:00.000Z', 1_000_000, 10),
    ]);

    const content = await generateRecapContent(app, start, end);

    expect(content.summary.shareOfTotal).toBeCloseTo(0.25, 5);
  });
});

describe('progressions par streamer', () => {
  it('classe toutes les progressions non nulles et expose le top 5', async () => {
    const before = [streamer('zerator', 1000), streamer('etoiles', 500), streamer('mistermv', 200)];
    const after = [streamer('zerator', 1500), streamer('etoiles', 2500), streamer('mistermv', 200)];
    const app = fakeApp([
      sample('2026-09-04T23:00:00.000Z', 1_000_000, 50_000, before),
      sample('2026-09-05T11:00:00.000Z', 1_400_000, 60_000, after),
    ]);

    const content = await generateRecapContent(app, start, end);

    expect(content.progressions).toEqual([
      { twitch: 'etoiles', display: 'ETOILES', raisedCents: 200_000 },
      { twitch: 'zerator', display: 'ZERATOR', raisedCents: 50_000 },
    ]);
    expect(content.topProgressions).toEqual(content.progressions);
  });
});

describe('courbe de la période', () => {
  it('adapte le pas à la durée pour garder une charge utile constante', () => {
    expect(seriesStepMinutes(60)).toBe(1);
    expect(seriesStepMinutes(24 * 60)).toBe(15);
    expect(seriesStepMinutes(7 * 24 * 60)).toBe(120);
  });

  it('retient le dernier relevé de chaque tranche', async () => {
    const app = fakeApp([
      sample('2026-09-05T00:04:00.000Z', 1_000_000, 10),
      sample('2026-09-05T00:09:00.000Z', 1_010_000, 10),
      sample('2026-09-05T00:14:00.000Z', 1_020_000, 10),
    ]);

    const content = await generateRecapContent(app, start, new Date('2026-09-05T00:15:00.000Z'));

    expect(content.series.stepMinutes).toBe(1);
    expect(content.series.points.at(-1)).toEqual({
      t: '2026-09-05T00:14:00.000Z',
      cents: 102_000_000,
    });
  });
});

describe('meilleure heure', () => {
  const hourly = (isoDate: string, cents: number) => ({ bucket: new Date(isoDate), donation_cents: String(cents) });

  it('retient la tranche où la cagnotte a le plus progressé', () => {
    const best = pickBestHour(
      [
        hourly('2026-09-05T00:00:00.000Z', 1_000),
        hourly('2026-09-05T01:00:00.000Z', 1_500),
        hourly('2026-09-05T02:00:00.000Z', 3_000),
        hourly('2026-09-05T03:00:00.000Z', 3_200),
      ],
      500,
      12 * 60,
    );

    expect(best).toEqual({ start: '2026-09-05T02:00:00.000Z', raisedCents: 1_500 });
  });

  it('ignore la première tranche quand rien ne précède la période', () => {
    const best = pickBestHour(
      [hourly('2026-09-05T00:00:00.000Z', 9_000_000), hourly('2026-09-05T01:00:00.000Z', 9_000_100)],
      null,
      12 * 60,
    );

    expect(best).toEqual({ start: '2026-09-05T01:00:00.000Z', raisedCents: 100 });
  });

  it('ne se prononce pas sur une période trop courte', () => {
    expect(pickBestHour([hourly('2026-09-05T00:00:00.000Z', 1_000)], 0, 60)).toBeNull();
  });
});

describe('dons observés sur la période', () => {
  it('agrège les dons du feed et classe les donateurs nominatifs', async () => {
    const app = fakeApp([sample('2026-09-05T11:00:00.000Z', 1_000_000, 10)], [], [
      donation('2026-09-05T01:00:00.000Z', 'Alice', 100),
      donation('2026-09-05T02:00:00.000Z', 'Alice', 50),
      donation('2026-09-05T03:00:00.000Z', 'Bob', 120),
      donation('2026-09-05T04:00:00.000Z', 'Anonyme', 5_000),
      donation('2026-09-06T04:00:00.000Z', 'Hors période', 900),
    ]);

    const content = await generateRecapContent(app, start, end);

    expect(content.observedDonations.count).toBe(4);
    expect(content.observedDonations.biggestCents).toBe(500_000);
    expect(content.observedDonations.averageCents).toBe(Math.round(527_000 / 4));
    expect(content.observedDonations.topDonors).toEqual([
      { donor: 'Alice', amountCents: 15_000, count: 2 },
      { donor: 'Bob', amountCents: 12_000, count: 1 },
    ]);
  });
});

describe('corps de la notification de récap', () => {
  it('rappelle le cumul, la cagnotte et les goals', () => {
    expect(
      recapBody({
        summary: {
          startCents: 0, endCents: 145_000_000, raisedCents: 45_000_000, peakViewers: 0,
          shareOfTotal: null, coverage: { start: null, end: null, complete: true },
        },
        counts: { milestones: 0, bigDonations: 0, liveStarts: 0, goalsReached: 2 },
        version: 3, milestones: [], bigDonations: [], liveStarts: [], goalsReached: [],
        topProgressions: [], progressions: [], highlights: [],
        series: { stepMinutes: 10, points: [] }, bestHour: null,
        observedDonations: { count: 0, totalCents: 0, averageCents: 0, biggestCents: 0, topDonors: [] },
      }),
    ).toContain('2 goals atteints');
  });
});

describe('alignement des bornes sur la minute', () => {
  it('tronque les secondes pour partager le cache entre appareils', () => {
    expect(floorToMinute(new Date('2026-09-05T12:34:56.789Z')).toISOString())
      .toBe('2026-09-05T12:34:00.000Z');
  });
});
