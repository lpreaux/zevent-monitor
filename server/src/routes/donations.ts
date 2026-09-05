import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ZeventState } from '../sources/index.js';

/**
 * Routes de lecture autour des dons Streamlabs archivés (`donations`) et des échantillons
 * `samples` : classements, feed, analyses et courbes par streamer.
 *
 * Le feed Streamlabs ne montre que les 3000 derniers dons à chaque relevé : en période de forte
 * affluence, des dons peuvent passer entre deux relevés. Tout ce qui sort d'ici est donc « d'après les
 * dons observés » et chaque réponse porte un bloc `observed` pour que l'app l'affiche.
 */

const WINDOWS = {
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  all: null,
} as const;

export type DonationWindow = keyof typeof WINDOWS;

const windowSchema = z.enum(['1h', '6h', '24h', 'all']).default('all');

/** Noms sous lesquels Streamlabs regroupe les dons anonymes : exclus des classements nominatifs. */
export const ANONYMOUS_DONORS = new Set(['', 'anonyme', 'anonymous', 'anon', 'anonym', 'anonymus']);

export function isAnonymousDonor(name: string): boolean {
  return ANONYMOUS_DONORS.has(name.trim().toLowerCase());
}

/** `since` en date absolue pour une fenêtre glissante, `null` = depuis le début. */
export function windowStart(window: DonationWindow, now = new Date()): Date | null {
  const minutes = WINDOWS[window];
  return minutes === null ? null : new Date(now.getTime() - minutes * 60_000);
}

/** Liste de logins Twitch `a,b,c` → tableau de logins minuscules dédupliqués. */
export function parseLogins(value: string | undefined, max = 10): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const login = part.trim().toLowerCase();
    if (login && /^[a-z0-9_]{1,40}$/.test(login)) seen.add(login);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Cache mémoire à durée de vie courte : ces réponses sont identiques pour tous les appareils. */
export class TtlCache {
  readonly #entries = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.#entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value as T;
    const value = await loader();
    this.#entries.set(key, { expiresAt: this.now() + ttlMs, value });
    if (this.#entries.size > 200) this.#evict();
    return value;
  }

  #evict(): void {
    const now = this.now();
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(key);
    }
  }
}

type DonationRow = {
  id: string;
  amount_cents: string;
  donor: string;
  comment: string | null;
  country: string | null;
  twitch_display_name: string | null;
  created_at: Date;
};

export type DonationDto = {
  id: string;
  donor: string;
  anonymous: boolean;
  amountCents: number;
  comment: string | null;
  country: string | null;
  twitch: string | null;
  createdAt: string;
};

export function toDonationDto(row: DonationRow): DonationDto {
  return {
    id: String(row.id),
    donor: row.donor,
    anonymous: isAnonymousDonor(row.donor),
    amountCents: Number(row.amount_cents),
    comment: row.comment,
    country: row.country,
    twitch: row.twitch_display_name ? row.twitch_display_name.toLowerCase() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

type ObservedRow = { count: number; total_cents: string | null; first_at: Date | null; last_at: Date | null };

export type Observed = {
  count: number;
  totalCents: number;
  firstAt: string | null;
  lastAt: string | null;
};

const toObserved = (row: ObservedRow | undefined): Observed => ({
  count: Number(row?.count ?? 0),
  totalCents: Number(row?.total_cents ?? 0),
  firstAt: row?.first_at ? new Date(row.first_at).toISOString() : null,
  lastAt: row?.last_at ? new Date(row.last_at).toISOString() : null,
});

/** Tranches de montant (bornes hautes exclusives, centimes) pour l'histogramme de distribution. */
export const AMOUNT_BUCKETS: { key: string; label: string; maxCents: number | null }[] = [
  { key: 'lt5', label: '< 5 €', maxCents: 500 },
  { key: '5-10', label: '5–10 €', maxCents: 1_000 },
  { key: '10-20', label: '10–20 €', maxCents: 2_000 },
  { key: '20-50', label: '20–50 €', maxCents: 5_000 },
  { key: '50-100', label: '50–100 €', maxCents: 10_000 },
  { key: '100-500', label: '100–500 €', maxCents: 50_000 },
  { key: 'gte500', label: '≥ 500 €', maxCents: null },
];

const bucketCase = `CASE
  WHEN amount_cents < 500 THEN 0
  WHEN amount_cents < 1000 THEN 1
  WHEN amount_cents < 2000 THEN 2
  WHEN amount_cents < 5000 THEN 3
  WHEN amount_cents < 10000 THEN 4
  WHEN amount_cents < 50000 THEN 5
  ELSE 6 END`;

/** Momentum d'un streamer entre deux échantillons : progression de sa cagnotte et de son rang. */
export type StreamerMomentum = {
  twitch: string;
  display: string;
  profileUrl: string;
  online: boolean;
  game: string;
  viewers: number;
  nowCents: number;
  deltaCents: number;
  rank: number;
  previousRank: number | null;
};

/**
 * Compare deux états : delta de cagnotte par streamer et évolution du rang au classement
 * par cagnotte. Les streamers absents de l'état précédent démarrent de leur cagnotte actuelle.
 */
export function computeMomentum(
  previous: ZeventState | undefined,
  current: ZeventState,
  limit: number,
): StreamerMomentum[] {
  const cents = (value: number) => Math.round(value * 100);
  const rankOf = (state: ZeventState | undefined): Map<string, number> => {
    const map = new Map<string, number>();
    if (!state) return map;
    const sorted = [...state.live].sort(
      (a, b) => b.donationAmount.number - a.donationAmount.number,
    );
    sorted.forEach((streamer, index) => map.set(streamer.twitch.toLowerCase(), index + 1));
    return map;
  };
  const previousCents = new Map(
    (previous?.live ?? []).map((s) => [s.twitch.toLowerCase(), cents(s.donationAmount.number)]),
  );
  const ranksNow = rankOf(current);
  const ranksBefore = rankOf(previous);

  return current.live
    .map((streamer) => {
      const login = streamer.twitch.toLowerCase();
      const nowCents = cents(streamer.donationAmount.number);
      const before = previousCents.get(login) ?? nowCents;
      return {
        twitch: login,
        display: streamer.display,
        profileUrl: streamer.profileUrl,
        online: streamer.online,
        game: streamer.game,
        viewers: streamer.viewersAmount.number,
        nowCents,
        deltaCents: Math.max(0, nowCents - before),
        rank: ranksNow.get(login) ?? 0,
        previousRank: ranksBefore.get(login) ?? null,
      };
    })
    .filter((item) => item.deltaCents > 0)
    .sort((a, b) => b.deltaCents - a.deltaCents || a.rank - b.rank)
    .slice(0, limit);
}

const recentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  twitch: z.string().optional(),
  minCents: z.coerce.number().int().min(0).default(0),
  /** Ne garder que les dons avec message. */
  withComment: z.stringbool().default(false),
});

const topQuery = z.object({
  window: windowSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const largestQuery = z.object({
  window: windowSchema,
  limit: z.coerce.number().int().min(1).max(50).default(10),
  twitch: z.string().optional(),
});

const statsQuery = z.object({ window: windowSchema, twitch: z.string().optional() });

const momentumQuery = z.object({
  window: z.coerce.number().int().min(5).max(360).default(10),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const rateQuery = z.object({ bucket: z.coerce.number().int().min(10).max(360).default(60) });

const streamerSeriesQuery = z.object({
  twitch: z.string().min(1),
  resolution: z.enum(['1m', '5m', '10m']).default('10m'),
});

const STATE_CACHE_MS = 15_000;
const LIST_CACHE_MS = 20_000;
const SERIES_CACHE_MS = 60_000;

export function registerDonationRoutes(app: FastifyInstance, cache = new TtlCache()): void {
  /** Filtre commun « fenêtre + streamer » avec ses paramètres numérotés à partir de `offset`. */
  const buildFilter = (
    since: Date | null,
    logins: string[],
    offset = 1,
  ): { where: string; params: unknown[] } => {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (since) {
      params.push(since);
      clauses.push(`created_at >= $${offset + params.length - 1}`);
    }
    if (logins.length > 0) {
      params.push(logins);
      clauses.push(`lower(twitch_display_name) = ANY($${offset + params.length - 1}::text[])`);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  };

  const observedFor = async (where: string, params: unknown[]): Promise<Observed> => {
    const result = await app.pg.query<ObservedRow>(
      `SELECT count(*)::int AS count, sum(amount_cents)::text AS total_cents,
              min(created_at) AS first_at, max(created_at) AS last_at
       FROM donations ${where}`,
      params,
    );
    return toObserved(result.rows[0]);
  };

  app.get('/v1/donations/recent', async (request, reply) => {
    const parsed = recentQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { limit, minCents, withComment } = parsed.data;
    const logins = parseLogins(parsed.data.twitch, 50);

    const key = `recent:${limit}:${minCents}:${withComment}:${logins.join(',')}`;
    return cache.get(key, STATE_CACHE_MS, async () => {
      const { where, params } = buildFilter(null, logins);
      const extra: string[] = [];
      if (minCents > 0) {
        params.push(minCents);
        extra.push(`amount_cents >= $${params.length}`);
      }
      if (withComment) extra.push(`comment IS NOT NULL AND btrim(comment) <> ''`);
      const fullWhere = extra.length
        ? `${where ? `${where} AND ` : 'WHERE '}${extra.join(' AND ')}`
        : where;
      params.push(limit);
      const [rows, observed] = await Promise.all([
        app.pg.query<DonationRow>(
          `SELECT id, amount_cents::text, donor, comment, country, twitch_display_name, created_at
           FROM donations ${fullWhere} ORDER BY created_at DESC LIMIT $${params.length}`,
          params,
        ),
        observedFor('', []),
      ]);
      return { donations: rows.rows.map(toDonationDto), observed };
    });
  });

  app.get('/v1/donations/top', async (request, reply) => {
    const parsed = topQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { window, limit } = parsed.data;

    return cache.get(`top:${window}:${limit}`, LIST_CACHE_MS, async () => {
      const since = windowStart(window);
      const { where, params } = buildFilter(since, []);
      params.push([...ANONYMOUS_DONORS]);
      const anonymousParam = params.length;
      params.push(limit);
      const [rows, observed] = await Promise.all([
        app.pg.query<{
          donor: string; total_cents: string; count: number; largest_cents: string; last_at: Date;
        }>(
          `SELECT min(donor) AS donor, sum(amount_cents)::text AS total_cents, count(*)::int AS count,
                  max(amount_cents)::text AS largest_cents, max(created_at) AS last_at
           FROM donations
           ${where ? `${where} AND` : 'WHERE'} lower(btrim(donor)) <> ALL($${anonymousParam}::text[])
           GROUP BY lower(btrim(donor))
           ORDER BY sum(amount_cents) DESC, count(*) DESC, min(donor)
           LIMIT $${params.length}`,
          params,
        ),
        observedFor(where, params.slice(0, since ? 1 : 0)),
      ]);
      return {
        window,
        since: since ? since.toISOString() : null,
        donors: rows.rows.map((row, index) => ({
          rank: index + 1,
          donor: row.donor,
          totalCents: Number(row.total_cents),
          count: Number(row.count),
          largestCents: Number(row.largest_cents),
          lastAt: new Date(row.last_at).toISOString(),
        })),
        observed,
      };
    });
  });

  app.get('/v1/donations/largest', async (request, reply) => {
    const parsed = largestQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { window, limit } = parsed.data;
    const logins = parseLogins(parsed.data.twitch);

    return cache.get(`largest:${window}:${limit}:${logins.join(',')}`, LIST_CACHE_MS, async () => {
      const since = windowStart(window);
      const { where, params } = buildFilter(since, logins);
      const filterParams = [...params];
      params.push(limit);
      const [rows, observed] = await Promise.all([
        app.pg.query<DonationRow>(
          `SELECT id, amount_cents::text, donor, comment, country, twitch_display_name, created_at
           FROM donations ${where} ORDER BY amount_cents DESC, created_at DESC LIMIT $${params.length}`,
          params,
        ),
        observedFor(where, filterParams),
      ]);
      return {
        window,
        since: since ? since.toISOString() : null,
        donations: rows.rows.map(toDonationDto),
        observed,
      };
    });
  });

  const statsFor = async (since: Date | null, logins: string[]) => {
    const { where, params } = buildFilter(since, logins);
    const [summary, distribution, countries] = await Promise.all([
      app.pg.query<{
        count: number; total_cents: string | null; mean_cents: number | null;
        median_cents: number | null; max_cents: string | null; first_at: Date | null; last_at: Date | null;
        with_comment: number;
      }>(
        `SELECT count(*)::int AS count, sum(amount_cents)::text AS total_cents,
                avg(amount_cents)::float8 AS mean_cents,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY amount_cents)::float8 AS median_cents,
                max(amount_cents)::text AS max_cents, min(created_at) AS first_at, max(created_at) AS last_at,
                count(*) FILTER (WHERE comment IS NOT NULL AND btrim(comment) <> '')::int AS with_comment
         FROM donations ${where}`,
        params,
      ),
      app.pg.query<{ bucket: number; count: number; total_cents: string }>(
        `SELECT bucket, count(*)::int AS count, sum(amount_cents)::text AS total_cents
         FROM (SELECT ${bucketCase} AS bucket, amount_cents FROM donations ${where}) t
         GROUP BY bucket ORDER BY bucket`,
        params,
      ),
      app.pg.query<{ country: string | null; count: number; total_cents: string }>(
        `SELECT country, count(*)::int AS count, sum(amount_cents)::text AS total_cents
         FROM donations ${where}
         GROUP BY country ORDER BY count(*) DESC, sum(amount_cents) DESC LIMIT 12`,
        params,
      ),
    ]);
    const row = summary.rows[0];
    const byBucket = new Map(distribution.rows.map((r) => [Number(r.bucket), r]));
    return {
      summary: {
        count: Number(row?.count ?? 0),
        totalCents: Number(row?.total_cents ?? 0),
        meanCents: row?.mean_cents === null || row?.mean_cents === undefined ? null : Math.round(row.mean_cents),
        medianCents: row?.median_cents === null || row?.median_cents === undefined ? null : Math.round(row.median_cents),
        maxCents: row?.max_cents ? Number(row.max_cents) : null,
        withComment: Number(row?.with_comment ?? 0),
        firstAt: row?.first_at ? new Date(row.first_at).toISOString() : null,
        lastAt: row?.last_at ? new Date(row.last_at).toISOString() : null,
      },
      distribution: AMOUNT_BUCKETS.map((bucket, index) => ({
        key: bucket.key,
        label: bucket.label,
        count: Number(byBucket.get(index)?.count ?? 0),
        totalCents: Number(byBucket.get(index)?.total_cents ?? 0),
      })),
      countries: countries.rows.map((r) => ({
        country: r.country,
        count: Number(r.count),
        totalCents: Number(r.total_cents),
      })),
    };
  };

  app.get('/v1/donations/stats', async (request, reply) => {
    const parsed = statsQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { window } = parsed.data;
    const logins = parseLogins(parsed.data.twitch);
    return cache.get(`stats:${window}:${logins.join(',')}`, LIST_CACHE_MS, async () => {
      const since = windowStart(window);
      return { window, since: since ? since.toISOString() : null, ...(await statsFor(since, logins)) };
    });
  });

  app.get<{ Params: { twitch: string } }>('/v1/streamers/:twitch/donations', async (request, reply) => {
    const logins = parseLogins(request.params.twitch, 1);
    if (logins.length === 0) return reply.code(400).send({ error: 'invalid_twitch' });
    const login = logins[0]!;

    return cache.get(`streamer-donations:${login}`, STATE_CACHE_MS, async () => {
      const { where, params } = buildFilter(null, [login]);
      const [stats, largest, recent] = await Promise.all([
        statsFor(null, [login]),
        app.pg.query<DonationRow>(
          `SELECT id, amount_cents::text, donor, comment, country, twitch_display_name, created_at
           FROM donations ${where} ORDER BY amount_cents DESC, created_at DESC LIMIT 5`,
          params,
        ),
        app.pg.query<DonationRow>(
          `SELECT id, amount_cents::text, donor, comment, country, twitch_display_name, created_at
           FROM donations ${where} ORDER BY created_at DESC LIMIT 25`,
          params,
        ),
      ]);
      return {
        twitch: login,
        summary: stats.summary,
        distribution: stats.distribution,
        largest: largest.rows.map(toDonationDto),
        recent: recent.rows.map(toDonationDto),
      };
    });
  });

  app.get('/v1/streamers/momentum', async (request, reply) => {
    const parsed = momentumQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { window, limit } = parsed.data;

    const momentum = await cache.get(`momentum:${window}:${limit}`, STATE_CACHE_MS, async () => {
      const latest = await app.pg.query<{ sampled_at: Date; state: ZeventState }>(
        'SELECT sampled_at, state FROM samples WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1',
      );
      const current = latest.rows[0];
      if (!current) return null;
      const previous = await app.pg.query<{ sampled_at: Date; state: ZeventState }>(
        `SELECT sampled_at, state FROM samples
         WHERE edition = 2026 AND sampled_at <= $1::timestamptz - make_interval(mins => $2::int)
         ORDER BY sampled_at DESC LIMIT 1`,
        [current.sampled_at, window],
      );
      const before = previous.rows[0];
      return {
        windowMinutes: window,
        from: before ? new Date(before.sampled_at).toISOString() : null,
        to: new Date(current.sampled_at).toISOString(),
        /** `false` tant que la collecte ne couvre pas encore toute la fenêtre. */
        complete: Boolean(before),
        streamers: computeMomentum(before?.state, current.state, limit),
      };
    });
    if (!momentum) return reply.code(503).send({ error: 'state_unavailable' });
    return momentum;
  });

  app.get('/v1/timeseries/rate', async (request, reply) => {
    const parsed = rateQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { bucket } = parsed.data;

    return cache.get(`rate:${bucket}`, LIST_CACHE_MS, async () => {
      const result = await app.pg.query<{
        bucket: Date; end_cents: string; raised_cents: string; peak_viewers: number; samples: number;
      }>(
        `WITH buckets AS (
           SELECT date_bin(make_interval(mins => $1::int), sampled_at, '2020-01-01'::timestamptz) AS bucket,
                  max(donation_cents) AS end_cents, min(donation_cents) AS start_cents,
                  max(viewers)::integer AS peak_viewers, count(*)::int AS samples
           FROM samples WHERE edition = 2026 GROUP BY 1)
         SELECT bucket, end_cents::text,
                COALESCE(end_cents - lag(end_cents) OVER (ORDER BY bucket), end_cents - start_cents)::text AS raised_cents,
                peak_viewers, samples
         FROM buckets ORDER BY bucket`,
        [bucket],
      );
      return {
        bucketMinutes: bucket,
        points: result.rows.map((row) => ({
          bucket: new Date(row.bucket).toISOString(),
          endCents: Number(row.end_cents),
          raisedCents: Math.max(0, Number(row.raised_cents)),
          peakViewers: Number(row.peak_viewers),
          samples: Number(row.samples),
        })),
      };
    });
  });

  app.get('/v1/timeseries/streamers', async (request, reply) => {
    const parsed = streamerSeriesQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const logins = parseLogins(parsed.data.twitch, 5);
    if (logins.length === 0) return reply.code(400).send({ error: 'invalid_twitch' });
    const minutes = Number.parseInt(parsed.data.resolution, 10);

    return cache.get(`series:${minutes}:${logins.join(',')}`, SERIES_CACHE_MS, async () => {
      const result = await app.pg.query<{
        bucket: Date; sampled_at: Date; twitch: string; eur: number | null; viewers: number | null; online: boolean | null;
      }>(
        `WITH buckets AS (
           SELECT DISTINCT ON (bucket)
             date_bin(make_interval(mins => $1::int), sampled_at, '2020-01-01'::timestamptz) AS bucket,
             sampled_at, state
           FROM samples WHERE edition = 2026
           ORDER BY bucket, sampled_at DESC)
         SELECT b.bucket, b.sampled_at, lower(s->>'twitch') AS twitch,
                (s->'donationAmount'->>'number')::float8 AS eur,
                (s->'viewersAmount'->>'number')::int AS viewers,
                (s->>'online')::boolean AS online
         FROM buckets b
         CROSS JOIN LATERAL jsonb_array_elements(b.state->'live') s
         WHERE lower(s->>'twitch') = ANY($2::text[])
         ORDER BY b.bucket`,
        [minutes, logins],
      );
      const series: Record<string, { bucket: string; eur: number; viewers: number; online: boolean }[]> = {};
      for (const login of logins) series[login] = [];
      for (const row of result.rows) {
        series[row.twitch]?.push({
          bucket: new Date(row.bucket).toISOString(),
          eur: Number(row.eur ?? 0),
          viewers: Number(row.viewers ?? 0),
          online: Boolean(row.online),
        });
      }
      return { resolution: parsed.data.resolution, streamers: series };
    });
  });
}
