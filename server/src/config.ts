import { z } from 'zod';

const configSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url().default('postgres://zevent:zevent@localhost:5432/zevent'),
  COLLECTOR_ENABLED: z.stringbool().default(true),
  COLLECT_INTERVAL_MS: z.coerce.number().int().min(5_000).default(15_000),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(environment);
}
