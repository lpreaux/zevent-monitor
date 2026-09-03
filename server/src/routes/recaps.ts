import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { generateRecapContent } from '../recaps/generator.js';
import { nextScheduleOccurrence } from '../recaps/schedule.js';
import { authenticateDevice } from './devices.js';

const scheduleBody = z.object({
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(12),
});
const generateBody = z.object({
  durationMinutes: z.number().int().min(15).max(7 * 24 * 60),
  idempotencyKey: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/).default(() => randomUUID()),
});
const idParams = z.object({ id: z.coerce.number().int().positive() });

const recapSelect = `id, kind, period_start AS "periodStart", period_end AS "periodEnd",
  generated_at AS "generatedAt", content`;

export function registerRecapRoutes(app: FastifyInstance): void {
  app.get('/v1/recap-schedules', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const result = await app.pg.query<{ local_time: string }>(
      `SELECT local_time FROM recap_schedules
       WHERE installation_id = $1 AND enabled = true ORDER BY local_time`, [installationId],
    );
    return { times: result.rows.map((row) => row.local_time) };
  });

  app.put('/v1/recap-schedules', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const parsed = scheduleBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    const times = [...new Set(parsed.data.times)].sort();
    const device = await app.pg.query<{ timezone: string }>('SELECT timezone FROM devices WHERE installation_id = $1', [installationId]);
    const timeZone = device.rows[0]?.timezone ?? 'Europe/Paris';
    const now = new Date();
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE recap_schedules SET enabled = false, updated_at = now() WHERE installation_id = $1 AND NOT (local_time = ANY($2::text[]))',
        [installationId, times],
      );
      for (const time of times) {
        await client.query(
          `INSERT INTO recap_schedules (installation_id, local_time, enabled, next_run_at)
           VALUES ($1, $2, true, $3)
           ON CONFLICT (installation_id, local_time) DO UPDATE
           SET enabled = true, next_run_at = EXCLUDED.next_run_at, updated_at = now()`,
          [installationId, time, nextScheduleOccurrence(time, timeZone, now)],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { times };
  });

  app.get('/v1/recaps', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const result = await app.pg.query(
      `SELECT ${recapSelect} FROM recaps WHERE installation_id = $1
       ORDER BY period_end DESC LIMIT 100`, [installationId],
    );
    return { recaps: result.rows };
  });

  app.get('/v1/recaps/:id', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_id' });
    const result = await app.pg.query(
      `SELECT ${recapSelect} FROM recaps WHERE id = $1 AND installation_id = $2`,
      [parsed.data.id, installationId],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'recap_not_found' });
    return result.rows[0];
  });

  app.post('/v1/recaps/generate', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const parsed = generateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - parsed.data.durationMinutes * 60_000);
    const dedupeKey = `manual:${installationId}:${parsed.data.idempotencyKey}`;
    const existing = await app.pg.query(
      `SELECT ${recapSelect} FROM recaps WHERE dedupe_key = $1 AND installation_id = $2`,
      [dedupeKey, installationId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const content = await generateRecapContent(app, periodStart, periodEnd);
    const inserted = await app.pg.query(
      `INSERT INTO recaps (installation_id, kind, period_start, period_end, dedupe_key, content)
       VALUES ($1, 'manual', $2, $3, $4, $5)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING ${recapSelect}`,
      [installationId, periodStart, periodEnd, dedupeKey, content],
    );
    if (inserted.rows[0]) return reply.code(201).send(inserted.rows[0]);
    const raced = await app.pg.query(`SELECT ${recapSelect} FROM recaps WHERE dedupe_key = $1`, [dedupeKey]);
    return raced.rows[0];
  });
}
