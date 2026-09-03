import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrateDatabase } from './db/migrate.js';
import { Collector } from './jobs/collector.js';
import { DonationsCollector } from './jobs/donations.js';
import { GoalsSync } from './jobs/goals-sync.js';
import { PlanningSync } from './jobs/planning-sync.js';
import { NotificationEngine } from './notifications/engine.js';

const config = loadConfig();
const app = buildApp({ config });
let collector: Collector | undefined;
let goalsSync: GoalsSync | undefined;
let planningSync: PlanningSync | undefined;
let donations: DonationsCollector | undefined;
let notifications: NotificationEngine | undefined;

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'Stopping server');
  collector?.stop();
  goalsSync?.stop();
  planningSync?.stop();
  donations?.stop();
  notifications?.stop();
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.ready();
  await migrateDatabase(app);
  if (config.NOTIFICATIONS_ENABLED) {
    notifications = new NotificationEngine(app, config);
    await notifications.start();
  }
  if (config.COLLECTOR_ENABLED) {
    collector = new Collector(app, config, notifications);
    await collector.start();
  }
  if (config.GOALS_SYNC_ENABLED) {
    goalsSync = new GoalsSync(app, config, notifications);
    await goalsSync.start();
  }
  if (config.PLANNING_SYNC_ENABLED) {
    planningSync = new PlanningSync(app, config);
    await planningSync.start();
  }
  if (config.DONATIONS_ENABLED) {
    donations = new DonationsCollector(app, config, notifications);
    await donations.start();
  }
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal(error);
  process.exit(1);
}
