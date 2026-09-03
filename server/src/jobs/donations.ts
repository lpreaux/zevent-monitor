import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import type { NotificationEngine } from '../notifications/engine.js';
import type { DonationRecord } from '../notifications/events.js';
import {
  SourceClient,
  StreamlabsSource,
  type StreamlabsDonations,
  type ZeventState,
} from '../sources/index.js';

function unwrapDonations(data: StreamlabsDonations) {
  return Array.isArray(data) ? data : data.data;
}

/**
 * Associe le nom affiché d'un don Streamlabs au login Twitch connu de l'API ZEvent
 * (les préférences et favoris raisonnent en logins).
 */
export function buildLoginResolver(state: ZeventState | undefined): (name: string | null | undefined) => string | null {
  const byName = new Map<string, string>();
  for (const streamer of state?.live ?? []) {
    const login = streamer.twitch.toLowerCase();
    byName.set(login, login);
    byName.set(streamer.display.toLowerCase(), login);
  }
  return (name) => (name ? (byName.get(name.trim().toLowerCase()) ?? null) : null);
}

export function toDonationRecords(
  data: StreamlabsDonations,
  resolveLogin: (name: string | null | undefined) => string | null,
): DonationRecord[] {
  const records: DonationRecord[] = [];
  for (const donation of unwrapDonations(data)) {
    const amountCents = Math.round(Number(donation.converted_amount));
    const createdAt = new Date(donation.created_at);
    if (!Number.isFinite(amountCents) || Number.isNaN(createdAt.getTime())) continue;
    records.push({
      id: String(donation.id),
      donor: donation.display_name,
      amountCents,
      comment: donation.comment ?? null,
      twitch: resolveLogin(donation.z_event_name?.twitch_display_name),
      createdAt,
    });
  }
  return records;
}

/**
 * Collecte le feed des derniers dons Streamlabs Charity. La déduplication par identifiant
 * de don rend la source rejouable : seuls les dons inédits alimentent le moteur d'alertes.
 */
export class DonationsCollector {
  readonly #source: StreamlabsSource;
  #timer?: NodeJS.Timeout;
  #running = false;

  constructor(
    private readonly app: FastifyInstance,
    private readonly config: AppConfig,
    private readonly engine?: NotificationEngine,
  ) {
    this.#source = new StreamlabsSource(new SourceClient());
  }

  async start(): Promise<void> {
    await this.collect();
    this.#timer = setInterval(() => void this.collect(), this.config.DONATIONS_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async collect(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const result = await this.#source.getDonations(this.config.STREAMLABS_TEAM_ID);
      if (result.stale) return;

      // Premier passage : le feed renvoie une centaine de dons déjà anciens, on les
      // enregistre sans alerter.
      const known = await this.app.pg.query('SELECT 1 FROM donations LIMIT 1');
      const seeding = known.rowCount === 0;

      const latest = await this.app.pg.query<{ state: ZeventState }>(
        'SELECT state FROM samples WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1',
      );
      const records = toDonationRecords(result.data, buildLoginResolver(latest.rows[0]?.state));

      const fresh: DonationRecord[] = [];
      for (const record of records) {
        const inserted = await this.app.pg.query(
          `INSERT INTO donations (id, amount_cents, donor, comment, country, twitch_display_name, created_at)
           VALUES ($1, $2, $3, $4, NULL, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [record.id, record.amountCents, record.donor, record.comment, record.twitch, record.createdAt],
        );
        if (inserted.rowCount) fresh.push(record);
      }

      if (fresh.length === 0) return;
      this.app.log.info({ donations: fresh.length, seeding }, 'New Streamlabs donations stored');
      if (seeding) return;

      // Après une interruption prolongée, le feed peut contenir des dons trop anciens
      // pour être annoncés en direct : ils restent en base sans notification.
      const cutoff = Date.now() - this.config.DONATIONS_MAX_AGE_MS;
      const recent = fresh.filter((record) => record.createdAt.getTime() >= cutoff);
      await this.engine?.onDonations(recent);
    } catch (error) {
      this.app.log.error({ err: error }, 'Streamlabs donations collection failed');
    } finally {
      this.#running = false;
    }
  }
}
