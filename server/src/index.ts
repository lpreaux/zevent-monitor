import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrateDatabase } from './db/migrate.js';
import { Collector } from './jobs/collector.js';
import { GoalsSync } from './jobs/goals-sync.js';

const config = loadConfig();
const app = buildApp({ config });
let collector: Collector | undefined;
let goalsSync: GoalsSync | undefined;

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'Stopping server');
  collector?.stop();
  goalsSync?.stop();
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.ready();
  await migrateDatabase(app);
  if (config.COLLECTOR_ENABLED) {
    collector = new Collector(app, config);
    await collector.start();
  }
  if (config.GOALS_SYNC_ENABLED) {
    goalsSync = new GoalsSync(app, config);
    await goalsSync.start();
  }
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal(error);
  process.exit(1);
}
