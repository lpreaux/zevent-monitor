import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  defaultPreferences,
  notificationPreferencesSchema,
  parsePreferences,
} from '../notifications/preferences.js';

const installationId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const secret = z.string().min(24).max(128);
const twitchLogin = z.string().min(1).max(40).regex(/^[A-Za-z0-9_]+$/);

const deviceBody = z.object({
  installationId,
  secret,
  /** `null` retire le token (désinscription des notifications). */
  expoPushToken: z.string().min(10).max(200).nullable().optional(),
  timezone: z.string().min(1).max(64).default('Europe/Paris'),
  platform: z.string().max(32).optional(),
  appVersion: z.string().max(32).optional(),
});

const preferencesBody = z.object({
  preferences: notificationPreferencesSchema.optional(),
  favorites: z.array(twitchLogin).max(500).optional(),
});

/** Le secret est aléatoire à 256 bits : un SHA-256 salé suffit, sans coût de dérivation. */
export function hashSecret(secretValue: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${secretValue}`).digest('hex');
}

/** Comparaison à durée constante de l'empreinte du secret. */
export function secretMatches(candidate: string, salt: string, expected: string): boolean {
  const hashed = Buffer.from(hashSecret(candidate, salt), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return hashed.length === stored.length && timingSafeEqual(hashed, stored);
}

type DeviceRow = { installation_id: string; secret_salt: string; secret_hash: string };

async function authenticate(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const id = request.headers['x-installation-id'];
  const authorization = request.headers.authorization;
  const token = typeof authorization === 'string' ? authorization.replace(/^Bearer /i, '') : '';

  if (typeof id !== 'string' || !installationId.safeParse(id).success || token.length === 0) {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const result = await app.pg.query<DeviceRow>(
    'SELECT installation_id, secret_salt, secret_hash FROM devices WHERE installation_id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row || !secretMatches(token, row.secret_salt, row.secret_hash)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return row.installation_id;
}

async function readDevice(app: FastifyInstance, id: string) {
  const [device, preferences, favorites] = await Promise.all([
    app.pg.query<{ expo_push_token: string | null; timezone: string; updated_at: Date }>(
      'SELECT expo_push_token, timezone, updated_at FROM devices WHERE installation_id = $1',
      [id],
    ),
    app.pg.query<{ preferences: unknown }>(
      'SELECT preferences FROM notification_preferences WHERE installation_id = $1',
      [id],
    ),
    app.pg.query<{ twitch: string }>('SELECT twitch FROM favorites WHERE installation_id = $1', [id]),
  ]);

  const row = device.rows[0];
  return {
    installationId: id,
    pushEnabled: Boolean(row?.expo_push_token),
    timezone: row?.timezone ?? 'Europe/Paris',
    updatedAt: row?.updated_at ?? null,
    preferences: parsePreferences(preferences.rows[0]?.preferences),
    favorites: favorites.rows.map((favorite) => favorite.twitch),
  };
}

/**
 * Enregistrement des appareils et préférences de notification.
 *
 * Pas de compte utilisateur en V1 : l'app génère un `installationId` et un secret au premier
 * lancement, le serveur ne conserve que l'empreinte du secret. Les écritures sont idempotentes.
 */
export function registerDeviceRoutes(app: FastifyInstance): void {
  app.put('/v1/device', async (request, reply) => {
    const parsed = deviceBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    const body = parsed.data;

    const existing = await app.pg.query<DeviceRow>(
      'SELECT installation_id, secret_salt, secret_hash FROM devices WHERE installation_id = $1',
      [body.installationId],
    );
    const row = existing.rows[0];

    if (row) {
      if (!secretMatches(body.secret, row.secret_salt, row.secret_hash)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      await app.pg.query(
        `UPDATE devices
         SET expo_push_token = CASE WHEN $2::boolean THEN $3 ELSE expo_push_token END,
             timezone = $4, platform = COALESCE($5, platform), app_version = COALESCE($6, app_version),
             disabled_at = NULL, updated_at = now()
         WHERE installation_id = $1`,
        [
          body.installationId,
          body.expoPushToken !== undefined,
          body.expoPushToken ?? null,
          body.timezone,
          body.platform ?? null,
          body.appVersion ?? null,
        ],
      );
    } else {
      const salt = randomBytes(16).toString('hex');
      await app.pg.query(
        `INSERT INTO devices
           (installation_id, secret_salt, secret_hash, expo_push_token, timezone, platform, app_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          body.installationId,
          salt,
          hashSecret(body.secret, salt),
          body.expoPushToken ?? null,
          body.timezone,
          body.platform ?? null,
          body.appVersion ?? null,
        ],
      );
      await app.pg.query(
        `INSERT INTO notification_preferences (installation_id, preferences)
         VALUES ($1, $2) ON CONFLICT (installation_id) DO NOTHING`,
        [body.installationId, defaultPreferences()],
      );
    }

    return readDevice(app, body.installationId);
  });

  app.get('/v1/preferences', async (request, reply) => {
    const id = await authenticate(app, request, reply);
    if (!id) return reply;
    return readDevice(app, id);
  });

  app.put('/v1/preferences', async (request, reply) => {
    const id = await authenticate(app, request, reply);
    if (!id) return reply;

    const parsed = preferencesBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.issues });
    }
    const { preferences, favorites } = parsed.data;

    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      if (preferences) {
        await client.query(
          `INSERT INTO notification_preferences (installation_id, preferences)
           VALUES ($1, $2)
           ON CONFLICT (installation_id)
           DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = now()`,
          [id, preferences],
        );
      }
      if (favorites) {
        const logins = [...new Set(favorites.map((twitch) => twitch.toLowerCase()))];
        await client.query('DELETE FROM favorites WHERE installation_id = $1 AND NOT (twitch = ANY($2::text[]))', [id, logins]);
        if (logins.length > 0) {
          await client.query(
            `INSERT INTO favorites (installation_id, twitch)
             SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
            [id, logins],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return readDevice(app, id);
  });

  /** Désinscription : le token est retiré, les préférences restent pour un futur retour. */
  app.delete('/v1/device', async (request, reply) => {
    const id = await authenticate(app, request, reply);
    if (!id) return reply;
    await app.pg.query(
      'UPDATE devices SET expo_push_token = NULL, updated_at = now() WHERE installation_id = $1',
      [id],
    );
    return reply.code(204).send();
  });
}
