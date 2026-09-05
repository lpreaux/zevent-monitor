import { verifyToken } from '@clerk/backend';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { notificationPreferencesSchema, parsePreferences } from '../notifications/preferences.js';
import { authenticateDevice } from './devices.js';

const twitchLogin = z.string().min(1).max(40).regex(/^[A-Za-z0-9_]+$/);
const syncBody = z.object({
  preferences: notificationPreferencesSchema,
  favorites: z.array(twitchLogin).max(500),
});

async function authenticateClerk(
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  if (!config.CLERK_SECRET_KEY && !config.CLERK_JWT_KEY) {
    await reply.code(503).send({ error: 'account_sync_not_configured' });
    return null;
  }
  const token = request.headers['x-clerk-token'];
  if (typeof token !== 'string' || token.length === 0) {
    await reply.code(401).send({ error: 'clerk_unauthorized' });
    return null;
  }
  try {
    const payload = await verifyToken(token, {
      ...(config.CLERK_JWT_KEY ? { jwtKey: config.CLERK_JWT_KEY } : {}),
      ...(config.CLERK_SECRET_KEY ? { secretKey: config.CLERK_SECRET_KEY } : {}),
    });
    return payload.sub;
  } catch {
    await reply.code(401).send({ error: 'clerk_unauthorized' });
    return null;
  }
}

/** Relie l'installation au compte et renvoie l'état fusionné du compte. */
export function registerAccountRoutes(app: FastifyInstance, config: AppConfig): void {
  app.post('/v1/account/sync', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const userId = await authenticateClerk(config, request, reply);
    if (!userId) return reply;
    const parsed = syncBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }

    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      // Verrouille toutes les installations du compte pour rendre la fusion atomique.
      const prior = await client.query<{ installation_id: string; preferences: unknown }>(
        `SELECT d.installation_id, np.preferences
         FROM devices d
         LEFT JOIN notification_preferences np USING (installation_id)
         WHERE d.clerk_user_id = $1
         ORDER BY np.updated_at DESC NULLS LAST
         FOR UPDATE OF d`,
        [userId],
      );
      await client.query(
        'UPDATE devices SET clerk_user_id = $2, updated_at = now() WHERE installation_id = $1',
        [installationId, userId],
      );

      const accountIds = [...new Set([...prior.rows.map((row) => row.installation_id), installationId])];
      const existingFavorites = await client.query<{ twitch: string }>(
        'SELECT DISTINCT twitch FROM favorites WHERE installation_id = ANY($1::text[])',
        [accountIds],
      );
      const favorites = [...new Set([
        ...existingFavorites.rows.map((row) => row.twitch.toLowerCase()),
        ...parsed.data.favorites.map((login) => login.toLowerCase()),
      ])].sort();
      // Un compte existant fait autorité; au premier rattachement, on conserve le local.
      const preferences = prior.rows.length > 0
        ? parsePreferences(prior.rows[0]?.preferences)
        : parsed.data.preferences;

      for (const id of accountIds) {
        await client.query(
          `INSERT INTO notification_preferences (installation_id, preferences)
           VALUES ($1, $2) ON CONFLICT (installation_id) DO UPDATE
           SET preferences = EXCLUDED.preferences, updated_at = now()`,
          [id, preferences],
        );
        await client.query('DELETE FROM favorites WHERE installation_id = $1', [id]);
        if (favorites.length > 0) {
          await client.query(
            `INSERT INTO favorites (installation_id, twitch)
             SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
            [id, favorites],
          );
        }
      }
      await client.query('COMMIT');
      return { userId, preferences, favorites, deviceCount: accountIds.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete('/v1/account/link', async (request, reply) => {
    const installationId = await authenticateDevice(app, request, reply);
    if (!installationId) return reply;
    const userId = await authenticateClerk(config, request, reply);
    if (!userId) return reply;
    await app.pg.query(
      'UPDATE devices SET clerk_user_id = NULL, updated_at = now() WHERE installation_id = $1 AND clerk_user_id = $2',
      [installationId, userId],
    );
    return reply.code(204).send();
  });
}
