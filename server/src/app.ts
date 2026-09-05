import postgres from '@fastify/postgres';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from './config.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerDonationRoutes } from './routes/donations.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerRecapRoutes } from './routes/recaps.js';
import { registerAccountRoutes } from './routes/account.js';

type BuildAppOptions = {
  config: AppConfig;
  database?: boolean;
  logger?: boolean;
};

export function buildApp({ config, database = true, logger = true }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: logger ? { level: config.LOG_LEVEL } : false,
  });

  if (database) {
    void app.register(postgres, { connectionString: config.DATABASE_URL });
    registerPublicRoutes(app);
    registerDeviceRoutes(app);
    registerRecapRoutes(app);
    registerDonationRoutes(app);
    registerAccountRoutes(app, config);
  }

  app.get('/healthz', async () => ({ status: 'ok' as const }));

  app.get('/readyz', async (_request, reply) => {
    if (!database) {
      return reply.code(503).send({ status: 'not_ready', database: 'disabled' });
    }

    try {
      await app.pg.query('SELECT 1');
      return { status: 'ready' as const, database: 'connected' as const };
    } catch (error) {
      app.log.error({ err: error }, 'PostgreSQL readiness check failed');
      return reply.code(503).send({ status: 'not_ready', database: 'unavailable' });
    }
  });

  return app;
}
