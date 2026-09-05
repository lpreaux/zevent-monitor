import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { commentText, normalizeCountry, toDonationRecords } from '../src/jobs/donations.js';
import {
  computeMomentum,
  isAnonymousDonor,
  parseLogins,
  registerDonationRoutes,
  toDonationDto,
  TtlCache,
  windowStart,
} from '../src/routes/donations.js';
import type { ZeventState } from '../src/sources/index.js';

const amount = (value: number) => ({ number: value, formatted: `${value}` });

function streamer(twitch: string, donation: number, online = true) {
  return {
    twitch_id: `id-${twitch}`,
    display: twitch.toUpperCase(),
    twitch,
    profileUrl: 'https://example.test/a.png',
    online,
    game: 'Just Chatting',
    viewersAmount: amount(10),
    streamlabsId: null,
    donationUrl: `https://zevent.fr/don/${twitch}`,
    ref: 'ref',
    donationAmount: amount(donation),
  };
}

function state(streamers: ReturnType<typeof streamer>[]): ZeventState {
  return {
    live: streamers,
    globalDonationUrl: 'https://zevent.fr/don',
    streamlabsCampaignId: '1',
    donationAmount: amount(1000),
    viewersCount: amount(100),
    calendar: [],
    marquee: null,
    widgetVersionId: 3,
    eventSourceDisabled: false,
    websiteMode: 'online',
    eventSourceWhitelist: [],
  };
}

describe('outils des routes de dons', () => {
  it('normalise les listes de logins', () => {
    expect(parseLogins(' Aducine, zerator ,,aducine')).toEqual(['aducine', 'zerator']);
    expect(parseLogins('bad login!')).toEqual([]);
    expect(parseLogins(undefined)).toEqual([]);
    expect(parseLogins('a,b,c', 2)).toEqual(['a', 'b']);
  });

  it('calcule le début des fenêtres glissantes', () => {
    const now = new Date('2026-09-05T14:00:00Z');
    expect(windowStart('1h', now)?.toISOString()).toBe('2026-09-05T13:00:00.000Z');
    expect(windowStart('24h', now)?.toISOString()).toBe('2026-09-04T14:00:00.000Z');
    expect(windowStart('all', now)).toBeNull();
  });

  it('reconnaît les donateurs anonymes', () => {
    expect(isAnonymousDonor(' Anonyme ')).toBe(true);
    expect(isAnonymousDonor('Anonymous')).toBe(true);
    expect(isAnonymousDonor('Lucas')).toBe(false);
  });

  it('convertit une ligne SQL en DTO', () => {
    const dto = toDonationDto({
      id: '42',
      amount_cents: '12345',
      donor: 'Anonyme',
      comment: 'GG',
      country: 'FR',
      twitch_display_name: 'Aducine',
      created_at: new Date('2026-09-05T14:00:00Z'),
    });
    expect(dto).toEqual({
      id: '42',
      donor: 'Anonyme',
      anonymous: true,
      amountCents: 12345,
      comment: 'GG',
      country: 'FR',
      twitch: 'aducine',
      createdAt: '2026-09-05T14:00:00.000Z',
    });
  });

  it('archive le pays normalisé des dons Streamlabs', () => {
    expect(normalizeCountry(' fr ')).toBe('FR');
    expect(normalizeCountry('France')).toBe('FR');
    expect(normalizeCountry('United Kingdom')).toBe('GB');
    expect(normalizeCountry('United States')).toBe('US');
    expect(normalizeCountry('Reunion')).toBe('RE');
    expect(normalizeCountry('The Netherlands')).toBe('NL');
    expect(normalizeCountry('Ivory Coast')).toBe('CI');
    expect(normalizeCountry('Czechia')).toBe('CZ');
    expect(normalizeCountry('Atlantide')).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
    const [record] = toDonationRecords(
      [{ id: 1, display_name: 'Lucas', converted_amount: '1500', created_at: '2026-09-05T14:00:00Z', country: 'be' }],
      () => null,
    );
    expect(record?.country).toBe('BE');
  });

  it('lit le commentaire du feed sous forme de chaîne ou d’objet', () => {
    expect(commentText('  GG  ')).toBe('GG');
    expect(commentText({ text: 'Bravo !' })).toBe('Bravo !');
    expect(commentText({ text: '   ' })).toBeNull();
    expect(commentText(null)).toBeNull();
    expect(commentText(undefined)).toBeNull();
  });

  it('déduplique les dons répétés dans un même relevé', () => {
    const records = toDonationRecords(
      [
        { id: 7, display_name: 'A', converted_amount: 100, created_at: '2026-09-05T14:00:00Z' },
        { id: '7', display_name: 'A', converted_amount: 100, created_at: '2026-09-05T14:00:00Z' },
      ],
      () => null,
    );
    expect(records).toHaveLength(1);
  });
});

describe('cache mémoire', () => {
  it('sert la valeur en cache pendant sa durée de vie puis la recharge', async () => {
    let clock = 0;
    const cache = new TtlCache(() => clock);
    let loads = 0;
    const load = () => cache.get('k', 1000, async () => ++loads);

    expect(await load()).toBe(1);
    clock = 500;
    expect(await load()).toBe(1);
    clock = 1500;
    expect(await load()).toBe(2);
  });
});

describe('momentum des streamers', () => {
  it('classe par progression et suit l’évolution du rang', () => {
    const before = state([streamer('a', 1000), streamer('b', 900), streamer('c', 100)]);
    const after = state([streamer('a', 1010), streamer('b', 1200), streamer('c', 100), streamer('d', 50)]);

    const momentum = computeMomentum(before, after, 10);

    expect(momentum.map((m) => m.twitch)).toEqual(['b', 'a']);
    expect(momentum[0]).toMatchObject({ deltaCents: 30_000, rank: 1, previousRank: 2 });
    expect(momentum[1]).toMatchObject({ deltaCents: 1_000, rank: 2, previousRank: 1 });
  });

  it('ne renvoie rien sans état précédent et borne la liste', () => {
    const after = state([streamer('a', 1010), streamer('b', 1200)]);
    expect(computeMomentum(undefined, after, 10)).toEqual([]);
    const before = state([streamer('a', 0), streamer('b', 0)]);
    expect(computeMomentum(before, after, 1)).toHaveLength(1);
  });
});

/** Base factice : chaque requête SQL est reconnue par un fragment caractéristique. */
function fakeApp(handlers: { match: string; rows: unknown[] }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const handler = handlers.find((h) => sql.includes(h.match));
    return { rows: handler?.rows ?? [], rowCount: handler?.rows.length ?? 0 };
  };
  return { app: { pg: { query } } as unknown as FastifyInstance, calls };
}

describe('routes de dons (HTTP)', () => {
  const apps = [] as ReturnType<typeof buildApp>[];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const config = {
    HOST: '127.0.0.1', PORT: 3000, LOG_LEVEL: 'silent', DATABASE_URL: 'postgres://x/y',
    COLLECTOR_ENABLED: false, COLLECT_INTERVAL_MS: 15_000, GOALS_SYNC_ENABLED: false,
    GOALS_SYNC_INTERVAL_MS: 300_000, GOALS_SYNC_REQUEST_DELAY_MS: 150, PLANNING_SYNC_ENABLED: false,
    PLANNING_SYNC_INTERVAL_MS: 600_000, EVENMORESTATS_EVENT_ID: 'x', DONATIONS_ENABLED: false,
    DONATIONS_INTERVAL_MS: 20_000, DONATIONS_MAX_AGE_MS: 1_800_000, STREAMLABS_TEAM_ID: '1',
    RECORD_DONATION_MIN_CENTS: 100_000, NOTIFICATIONS_ENABLED: false, GOAL_NEAR_RATIO: 0.9,
    PUSH_RECEIPTS_INTERVAL_MS: 300_000, RECAPS_ENABLED: false, RECAPS_INTERVAL_MS: 60_000,
  } as const;

  function build(handlers: { match: string; rows: unknown[] }[]) {
    const app = buildApp({ config, database: false, logger: false });
    apps.push(app);
    const { app: fake, calls } = fakeApp(handlers);
    app.decorate('pg', (fake as unknown as { pg: never }).pg);
    registerDonationRoutes(app);
    return { app, calls };
  }

  const row = {
    id: '1', amount_cents: '50000', donor: 'Lucas', comment: 'Bravo', country: 'FR',
    twitch_display_name: 'aducine', created_at: new Date('2026-09-05T14:00:00Z'),
  };

  it('renvoie le feed avec le bloc « observé »', async () => {
    const { app, calls } = build([
      { match: 'ORDER BY created_at DESC LIMIT', rows: [row] },
      { match: 'count(*)::int AS count, sum(amount_cents)::text AS total_cents', rows: [{ count: 1, total_cents: '50000', first_at: row.created_at, last_at: row.created_at }] },
    ]);

    const response = await app.inject({ method: 'GET', url: '/v1/donations/recent?limit=10&twitch=Aducine&minCents=100' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.donations[0]).toMatchObject({ donor: 'Lucas', amountCents: 50_000, twitch: 'aducine' });
    expect(body.observed.count).toBe(1);
    const feed = calls.find((c) => c.sql.includes('ORDER BY created_at DESC LIMIT'));
    expect(feed?.params).toEqual([['aducine'], 100, 10]);
  });

  it('rejette une fenêtre inconnue', async () => {
    const { app } = build([]);
    const response = await app.inject({ method: 'GET', url: '/v1/donations/top?window=2h' });
    expect(response.statusCode).toBe(400);
  });

  it('exclut les anonymes du top donateurs', async () => {
    const { app, calls } = build([
      { match: 'GROUP BY lower(btrim(donor))', rows: [{ donor: 'Lucas', total_cents: '70000', count: 2, largest_cents: '50000', last_at: row.created_at }] },
    ]);

    const response = await app.inject({ method: 'GET', url: '/v1/donations/top?window=1h&limit=5' });

    expect(response.statusCode).toBe(200);
    expect(response.json().donors).toEqual([
      expect.objectContaining({ rank: 1, donor: 'Lucas', totalCents: 70_000, count: 2, largestCents: 50_000 }),
    ]);
    const top = calls.find((c) => c.sql.includes('GROUP BY lower(btrim(donor))'));
    expect(top?.sql).toContain('<> ALL(');
    expect(top?.params[0]).toBeInstanceOf(Date);
    expect(top?.params[2]).toBe(5);
  });

  it('agrège les statistiques et complète les tranches vides', async () => {
    const { app } = build([
      { match: 'percentile_cont', rows: [{ count: 3, total_cents: '9000', mean_cents: 3000, median_cents: 2500.4, max_cents: '5000', first_at: row.created_at, last_at: row.created_at, with_comment: 1 }] },
      { match: 'GROUP BY bucket', rows: [{ bucket: 1, count: 2, total_cents: '4000' }, { bucket: 3, count: 1, total_cents: '5000' }] },
      { match: 'GROUP BY country', rows: [{ country: 'FR', count: 3, total_cents: '9000' }] },
    ]);

    const response = await app.inject({ method: 'GET', url: '/v1/donations/stats' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary).toMatchObject({ count: 3, totalCents: 9000, medianCents: 2500, maxCents: 5000, withComment: 1 });
    expect(body.distribution).toHaveLength(7);
    expect(body.distribution[1]).toMatchObject({ key: '5-10', count: 2 });
    expect(body.distribution[0]).toMatchObject({ key: 'lt5', count: 0 });
    expect(body.countries).toEqual([{ country: 'FR', count: 3, totalCents: 9000 }]);
  });

  it('calcule le momentum à partir des deux échantillons', async () => {
    const latest = { sampled_at: new Date('2026-09-05T14:10:00Z'), state: state([streamer('a', 1500), streamer('b', 900)]) };
    const before = { sampled_at: new Date('2026-09-05T14:00:00Z'), state: state([streamer('a', 1000), streamer('b', 900)]) };
    const { app } = build([
      { match: 'make_interval(mins => $2::int)', rows: [before] },
      { match: 'ORDER BY sampled_at DESC LIMIT 1', rows: [latest] },
    ]);

    const response = await app.inject({ method: 'GET', url: '/v1/streamers/momentum?window=10' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      windowMinutes: 10,
      complete: true,
      streamers: [expect.objectContaining({ twitch: 'a', deltaCents: 50_000 })],
    });
  });

  it('signale l’absence d’échantillon', async () => {
    const { app } = build([]);
    const response = await app.inject({ method: 'GET', url: '/v1/streamers/momentum' });
    expect(response.statusCode).toBe(503);
  });

  it('renvoie une série par streamer demandé, même vide', async () => {
    const { app } = build([
      { match: 'jsonb_array_elements', rows: [
        { bucket: new Date('2026-09-05T14:00:00Z'), sampled_at: new Date('2026-09-05T14:09:00Z'), twitch: 'a', eur: 1500, viewers: 12, online: true },
      ] },
    ]);

    const response = await app.inject({ method: 'GET', url: '/v1/timeseries/streamers?twitch=a,b' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.streamers.a).toEqual([{ bucket: '2026-09-05T14:00:00.000Z', eur: 1500, viewers: 12, online: true }]);
    expect(body.streamers.b).toEqual([]);
  });

  it('borne à zéro un rythme négatif', async () => {
    const { app } = build([
      { match: 'lag(end_cents)', rows: [
        { bucket: new Date('2026-09-05T14:00:00Z'), end_cents: '1000', raised_cents: '-5', peak_viewers: 3, samples: 4 },
      ] },
    ]);

    const response = await app.inject({ method: 'GET', url: '/v1/timeseries/rate?bucket=60' });

    expect(response.statusCode).toBe(200);
    expect(response.json().points[0]).toMatchObject({ raisedCents: 0, endCents: 1000, peakViewers: 3 });
  });
});
