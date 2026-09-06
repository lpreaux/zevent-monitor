import type { FastifyInstance } from 'fastify';

/**
 * Migrations appliquées dans l'ordre, une seule fois chacune (`schema_migrations`).
 * Ne jamais modifier une migration déjà déployée : en ajouter une nouvelle.
 */
const migrations: string[] = [
  // 1 — collecte 2026 et snapshots de donation goals
  `
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
`,
  // 2 — appareils, préférences de notification et moteur d'alertes dédupliqué
  `
CREATE TABLE IF NOT EXISTS devices (
  installation_id text PRIMARY KEY,
  secret_salt text NOT NULL,
  secret_hash text NOT NULL,
  expo_push_token text,
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  platform text,
  app_version text,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_push_token_idx
  ON devices (expo_push_token) WHERE expo_push_token IS NOT NULL AND disabled_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  installation_id text PRIMARY KEY REFERENCES devices (installation_id) ON DELETE CASCADE,
  preferences jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  installation_id text NOT NULL REFERENCES devices (installation_id) ON DELETE CASCADE,
  twitch text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (installation_id, twitch)
);

CREATE TABLE IF NOT EXISTS donations (
  id text PRIMARY KEY,
  amount_cents bigint NOT NULL,
  donor text NOT NULL,
  comment text,
  country text,
  twitch_display_name text,
  created_at timestamptz NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS donations_created_at_idx ON donations (created_at DESC);

CREATE TABLE IF NOT EXISTS detected_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detected_events_occurred_at_idx ON detected_events (occurred_at DESC);

CREATE TABLE IF NOT EXISTS push_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  installation_id text NOT NULL REFERENCES devices (installation_id) ON DELETE CASCADE,
  event_id bigint NOT NULL REFERENCES detected_events (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  ticket_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, event_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_pending_receipt_idx
  ON push_deliveries (created_at) WHERE status = 'sent' AND ticket_id IS NOT NULL;
`,
  // 3 — snapshots du planning (shows EvenMoreStats + calendar officiel fusionnés)
  `
CREATE TABLE IF NOT EXISTS planning_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetched_at timestamptz NOT NULL,
  source text NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS planning_snapshots_fetched_at_idx
  ON planning_snapshots (fetched_at DESC);
`,
  // 4 — réconciliation des migrations planning/récaps développées en parallèle.
  // Les CREATE idempotents couvrent aussi une base ayant déjà reçu l'une des deux migrations v3.
  `
CREATE TABLE IF NOT EXISTS planning_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetched_at timestamptz NOT NULL,
  source text NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS planning_snapshots_fetched_at_idx
  ON planning_snapshots (fetched_at DESC);

CREATE TABLE IF NOT EXISTS recap_schedules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  installation_id text NOT NULL REFERENCES devices (installation_id) ON DELETE CASCADE,
  local_time text NOT NULL CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, local_time)
);
CREATE INDEX IF NOT EXISTS recap_schedules_due_idx
  ON recap_schedules (next_run_at) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS recaps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  installation_id text NOT NULL REFERENCES devices (installation_id) ON DELETE CASCADE,
  schedule_id bigint REFERENCES recap_schedules (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('scheduled', 'manual')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text NOT NULL UNIQUE,
  content jsonb NOT NULL,
  CHECK (period_end > period_start)
);
CREATE INDEX IF NOT EXISTS recaps_installation_generated_idx
  ON recaps (installation_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS recap_push_deliveries (
  recap_id bigint PRIMARY KEY REFERENCES recaps (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  ticket_id text,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`,
  // 5 — cache anonyme des contenus de récap, partagé entre appareils.
  // Le contenu ne dépend que de la période : une plage identique n'est calculée qu'une fois.
  `
CREATE TABLE IF NOT EXISTS recap_contents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  content jsonb NOT NULL,
  UNIQUE (period_start, period_end),
  CHECK (period_end > period_start)
);
CREATE INDEX IF NOT EXISTS recap_contents_generated_at_idx
  ON recap_contents (generated_at DESC);
`,
  // 6 — classements et analyses de dons (top donateurs, gros dons, dons par streamer)
  `
CREATE INDEX IF NOT EXISTS donations_amount_idx ON donations (amount_cents DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS donations_twitch_created_idx
  ON donations (twitch_display_name, created_at DESC) WHERE twitch_display_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS donations_donor_idx ON donations (lower(btrim(donor)));
`,
  // 7 — compte Clerk : plusieurs installations partagent favoris et préférences.
  `
ALTER TABLE devices ADD COLUMN IF NOT EXISTS clerk_user_id text;
CREATE INDEX IF NOT EXISTS devices_clerk_user_id_idx
  ON devices (clerk_user_id) WHERE clerk_user_id IS NOT NULL;
`,
  // 8 — pagination par curseur du feed : le tri porte sur (date, identifiant), l'index aussi.
  `
CREATE INDEX IF NOT EXISTS donations_created_id_idx ON donations (created_at DESC, id DESC);
`,
];

export async function migrateDatabase(app: FastifyInstance): Promise<void> {
  const client = await app.pg.connect();
  try {
    await client.query(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);
    const applied = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const done = new Set(applied.rows.map((row) => row.version));

    for (const [index, sql] of migrations.entries()) {
      const version = index + 1;
      if (done.has(version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        app.log.info({ version }, 'Database migration applied');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
