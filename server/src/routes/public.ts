import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const timeseriesQuery = z.object({
  edition: z.coerce.number().int().default(2026),
  resolution: z.enum(['1m', '5m', '10m']).default('1m'),
});

export function registerPublicRoutes(app: FastifyInstance): void {
  app.get('/v1/collection-status', async () => {
    const result = await app.pg.query(
      `SELECT count(*)::integer AS "sampleCount", min(sampled_at) AS "firstSampleAt",
              max(sampled_at) AS "lastSampleAt"
       FROM samples WHERE edition = 2026`,
    );
    return { edition: 2026, ...result.rows[0] };
  });

  app.get('/v1/state', async (_request, reply) => {
    const result = await app.pg.query(
      `SELECT sampled_at, source_fetched_at, source_stale, state
       FROM samples WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return reply.code(503).send({ error: 'state_unavailable' });
    return { data: row.state, sampledAt: row.sampled_at, source: { fetchedAt: row.source_fetched_at, stale: row.source_stale } };
  });

  app.get('/v1/timeseries', async (request, reply) => {
    const parsed = timeseriesQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    const { edition, resolution } = parsed.data;
    const minutes = Number.parseInt(resolution, 10);
    const result = await app.pg.query(
      `SELECT DISTINCT ON (bucket)
         date_bin(($2 || ' minutes')::interval, sampled_at, '2020-01-01'::timestamptz) AS bucket,
         sampled_at, donation_cents, viewers
       FROM samples WHERE edition = $1
       ORDER BY bucket, sampled_at DESC`,
      [edition, minutes],
    );
    return { edition, resolution, points: result.rows };
  });

  app.get('/v1/goals', async (_request, reply) => {
    const result = await app.pg.query(
      'SELECT fetched_at, source, stale, payload FROM goals_snapshots ORDER BY fetched_at DESC LIMIT 1',
    );
    const row = result.rows[0];
    if (!row) return reply.code(503).send({ error: 'goals_unavailable' });
    return { data: row.payload, fetchedAt: row.fetched_at, source: row.source, stale: row.stale };
  });
}
