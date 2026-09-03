import type { FastifyInstance } from 'fastify';

const migration = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition smallint NOT NULL,
  sampled_at timestamptz NOT NULL,
  donation_cents bigint NOT NULL CHECK (donation_cents >= 0),
  viewers integer NOT NULL CHECK (viewers >= 0),
  website_mode text NOT NULL,
  state jsonb NOT NULL,
  source_fetched_at timestamptz NOT NULL,
  source_stale boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS samples_edition_sampled_at_idx
  ON samples (edition, sampled_at DESC);

CREATE TABLE IF NOT EXISTS goals_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetched_at timestamptz NOT NULL,
  source text NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL
);
`;

export async function migrateDatabase(app: FastifyInstance): Promise<void> {
  const client = await app.pg.connect();
  try {
    await client.query('BEGIN');
    await client.query(migration);
    await client.query('INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
