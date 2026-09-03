import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { recapBody } from '../src/jobs/recaps.js';
import { floorToMinute } from '../src/recaps/content-cache.js';
import { generateRecapContent } from '../src/recaps/generator.js';

type Sample = {
  sampled_at: Date;
  donation_cents: string;
  viewers: number;
  state: { live: { twitch: string; display: string; donationAmount: { number: number } }[] };
};

type Event = { kind: string; occurred_at: Date; payload: Record<string, unknown> };

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

/** Base minimale : les quatre formes de requête du générateur, servies depuis des tableaux. */
function fakeApp(samples: Sample[], events: Event[] = []): FastifyInstance {
  const ordered = [...samples].sort((a, b) => a.sampled_at.getTime() - b.sampled_at.getTime());
  const query = async (sql: string, params: unknown[] = []) => {
    const [first, second] = params as Date[];
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

describe('corps de la notification de récap', () => {
  it('rappelle le cumul, la cagnotte et les goals', () => {
    expect(
      recapBody({
        summary: { startCents: 0, endCents: 145_000_000, raisedCents: 45_000_000, peakViewers: 0, coverage: { start: null, end: null, complete: true } },
        counts: { milestones: 0, bigDonations: 0, liveStarts: 0, goalsReached: 2 },
        version: 2, milestones: [], bigDonations: [], liveStarts: [], goalsReached: [],
        topProgressions: [], progressions: [], highlights: [],
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
