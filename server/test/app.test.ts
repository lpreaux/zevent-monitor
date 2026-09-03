import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';

const config: AppConfig = {
  HOST: '127.0.0.1',
  PORT: 3000,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://zevent:zevent@localhost:5432/zevent',
  COLLECTOR_ENABLED: false,
  COLLECT_INTERVAL_MS: 15_000,
  GOALS_SYNC_ENABLED: false,
  GOALS_SYNC_INTERVAL_MS: 300_000,
  GOALS_SYNC_REQUEST_DELAY_MS: 150,
  PLANNING_SYNC_ENABLED: false,
  PLANNING_SYNC_INTERVAL_MS: 600_000,
  EVENMORESTATS_EVENT_ID: '019f5bd1-fe07-7d78-a326-a02198a9d50f',
  DONATIONS_ENABLED: false,
  DONATIONS_INTERVAL_MS: 20_000,
  DONATIONS_MAX_AGE_MS: 1_800_000,
  STREAMLABS_TEAM_ID: '945347664248182491',
  NOTIFICATIONS_ENABLED: false,
  GOAL_NEAR_RATIO: 0.9,
  PUSH_RECEIPTS_INTERVAL_MS: 300_000,
};

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('health routes', () => {
  it('reports a healthy process without requiring external services', async () => {
    const app = buildApp({ config, database: false, logger: false });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('does not report readiness when PostgreSQL is disabled', async () => {
    const app = buildApp({ config, database: false, logger: false });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', database: 'disabled' });
  });
});
