import { z } from 'zod';

const configSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url().default('postgres://zevent:zevent@localhost:5432/zevent'),
  COLLECTOR_ENABLED: z.stringbool().default(true),
  COLLECT_INTERVAL_MS: z.coerce.number().int().min(5_000).default(15_000),
  GOALS_SYNC_ENABLED: z.stringbool().default(true),
  GOALS_SYNC_INTERVAL_MS: z.coerce.number().int().min(30_000).default(300_000),
  GOALS_SYNC_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(150),
  PLANNING_SYNC_ENABLED: z.stringbool().default(true),
  /** Le planning bouge rarement : une synchro toutes les 10 min suffit. */
  PLANNING_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).default(600_000),
  // ZEvent 2026 sur EvenMoreStats, cf. GET https://api.ppr.evenmorestats.fr/events
  EVENMORESTATS_EVENT_ID: z.string().default('019f5bd1-fe07-7d78-a326-a02198a9d50f'),
  // Feed des dons Streamlabs Charity (team ZEvent 2026, cf. PLAN.md §1.2)
  DONATIONS_ENABLED: z.stringbool().default(true),
  DONATIONS_INTERVAL_MS: z.coerce.number().int().min(10_000).default(20_000),
  /** Au-delà, un don du feed est archivé mais plus annoncé en direct. */
  DONATIONS_MAX_AGE_MS: z.coerce.number().int().min(60_000).default(1_800_000),
  STREAMLABS_TEAM_ID: z.string().default('945347664248182491'),
  /**
   * Montant minimal (centimes) pour qu'un don dépassant le plus gros don observé soit
   * annoncé comme « nouveau record » : évite d'alerter sur les premiers dons de l'événement.
   */
  RECORD_DONATION_MIN_CENTS: z.coerce.number().int().min(100).default(100_000),
  // Moteur de notifications
  NOTIFICATIONS_ENABLED: z.stringbool().default(true),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Part d'un palier atteinte à partir de laquelle il est annoncé « proche ». */
  GOAL_NEAR_RATIO: z.coerce.number().min(0.5).max(0.999).default(0.9),
  PUSH_RECEIPTS_INTERVAL_MS: z.coerce.number().int().min(30_000).default(300_000),
  RECAPS_ENABLED: z.stringbool().default(true),
  RECAPS_INTERVAL_MS: z.coerce.number().int().min(15_000).default(60_000),
  /** Clé Clerk backend. Sans elle, l'app reste utilisable en mode local/anonyme. */
  CLERK_SECRET_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  CLERK_JWT_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(environment);
}
