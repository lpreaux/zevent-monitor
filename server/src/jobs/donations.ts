import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import type { NotificationEngine } from '../notifications/engine.js';
import { detectRecordDonations, type DonationRecord } from '../notifications/events.js';
import {
  SourceClient,
  StreamlabsSource,
  type StreamlabsDonation,
  type StreamlabsDonationEntry,
  type StreamlabsDonationMember,
  type StreamlabsDonations,
  type ZeventState,
} from '../sources/index.js';

type FeedItem = { donation: StreamlabsDonation; member: StreamlabsDonationMember | null };

/** Aplatit les deux formats du feed (enveloppe `{ donation, member }` ou don à plat). */
export function unwrapDonations(data: StreamlabsDonations): FeedItem[] {
  const entries: StreamlabsDonationEntry[] = Array.isArray(data) ? data : data.data;
  return entries.map((entry) =>
    'donation' in entry
      ? { donation: entry.donation, member: entry.member ?? null }
      : { donation: entry, member: null },
  );
}

/** Ce que l'on sait du streamer soutenu par un don, pour retrouver son login Twitch. */
export type StreamerHint = {
  /** `member.id` Streamlabs, identique au `streamlabsId` de l'API ZEvent. */
  streamlabsId?: string | null;
  /** Noms candidats (slug Streamlabs, nom affiché), testés dans l'ordre. */
  names?: (string | null | undefined)[];
};

export type LoginResolver = (hint: StreamerHint) => string | null;

/**
 * Associe le streamer soutenu (membre Streamlabs) au login Twitch connu de l'API ZEvent :
 * par `streamlabsId` d'abord (exact), sinon par slug ou nom affiché.
 */
export function buildLoginResolver(state: ZeventState | undefined): LoginResolver {
  const byStreamlabsId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const streamer of state?.live ?? []) {
    const login = streamer.twitch.toLowerCase();
    if (streamer.streamlabsId) byStreamlabsId.set(String(streamer.streamlabsId), login);
    byName.set(login, login);
    byName.set(streamer.display.toLowerCase(), login);
  }
  return (hint) => {
    if (hint.streamlabsId) {
      const login = byStreamlabsId.get(String(hint.streamlabsId));
      if (login) return login;
    }
    for (const name of hint.names ?? []) {
      const login = name ? byName.get(name.trim().toLowerCase()) : undefined;
      if (login) return login;
    }
    return null;
  };
}

/** Noms de pays Streamlabs qui ne correspondent pas au libellé anglais CLDR. */
const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  thenetherlands: 'NL',
  netherlands: 'NL',
  ivorycoast: 'CI',
  hongkong: 'HK',
  reunion: 'RE',
  czechrepublic: 'CZ',
  unitedstatesofamerica: 'US',
  usa: 'US',
  uk: 'GB',
  greatbritain: 'GB',
  russia: 'RU',
  southkorea: 'KR',
  vietnam: 'VN',
  macau: 'MO',
  turkey: 'TR',
  swaziland: 'SZ',
  macedonia: 'MK',
};

const foldName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** Libellé anglais CLDR replié → code ISO 3166-1 alpha-2, construit à la demande. */
let countryIndex: Map<string, string> | undefined;

function countryCodeByName(): Map<string, string> {
  if (countryIndex) return countryIndex;
  const index = new Map<string, string>();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      let label: string | undefined;
      try {
        label = names.of(code);
      } catch {
        continue;
      }
      // Premier code gagnant : « France » est aussi le libellé de FX (France métropolitaine).
      const key = label && label !== code ? foldName(label) : null;
      if (key && !index.has(key)) index.set(key, code);
    }
  }
  for (const [name, code] of Object.entries(COUNTRY_NAME_OVERRIDES)) index.set(name, code);
  countryIndex = index;
  return index;
}

/**
 * Pays d'un don en ISO 3166-1 alpha-2. Streamlabs fournit un nom anglais (« France »,
 * « United Kingdom ») ; les codes alpha-2 déjà normalisés sont acceptés tels quels.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return countryCodeByName().get(foldName(trimmed)) ?? null;
}

/** Texte d'un commentaire (chaîne ou objet `{ text }`), `null` si vide. */
export function commentText(comment: StreamlabsDonation['comment']): string | null {
  const text = typeof comment === 'string' ? comment : comment?.text;
  const trimmed = (text ?? '').trim();
  return trimmed ? trimmed : null;
}

export function toDonationRecords(data: StreamlabsDonations, resolveLogin: LoginResolver): DonationRecord[] {
  const records: DonationRecord[] = [];
  const seen = new Set<string>();
  for (const { donation, member } of unwrapDonations(data)) {
    const id = String(donation.id);
    if (seen.has(id)) continue;
    const amountCents = Math.round(Number(donation.converted_amount));
    const createdAt = new Date(donation.created_at);
    if (!Number.isFinite(amountCents) || Number.isNaN(createdAt.getTime())) continue;
    seen.add(id);
    const slug = member?.user?.slug?.trim().toLowerCase() || null;
    const twitch = member
      ? (resolveLogin({ streamlabsId: String(member.id), names: [slug, member.user?.display_name] }) ?? slug)
      : null;
    records.push({
      id,
      donor: donation.display_name,
      amountCents,
      comment: commentText(donation.comment),
      country: normalizeCountry(donation.country),
      twitch,
      createdAt,
    });
  }
  return records;
}

/**
 * Collecte le feed des derniers dons Streamlabs Charity (3000 dons par relevé). La
 * déduplication par identifiant de don rend la source rejouable : seuls les dons inédits
 * alimentent le moteur d'alertes. Le pays, renseigné par Streamlabs avec un délai, est
 * complété sur les dons déjà connus tant qu'ils figurent encore dans le feed.
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

      // Premier passage : le feed renvoie des milliers de dons déjà anciens, on les
      // enregistre sans alerter.
      const known = await this.app.pg.query('SELECT 1 FROM donations LIMIT 1');
      const seeding = known.rowCount === 0;

      const latest = await this.app.pg.query<{ state: ZeventState }>(
        'SELECT state FROM samples WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1',
      );
      const records = toDonationRecords(result.data, buildLoginResolver(latest.rows[0]?.state));
      if (records.length === 0) return;

      // Plus gros don observé avant ce passage, pour détecter un nouveau record.
      const maxResult = await this.app.pg.query<{ max: string | null }>(
        'SELECT max(amount_cents)::text AS max FROM donations',
      );
      const maxValue = maxResult.rows[0]?.max ?? null;
      const previousMaxCents = maxValue === null ? null : Number(maxValue);

      const fresh = await this.upsert(records);

      if (fresh.length === 0) return;
      this.app.log.info({ donations: fresh.length, seeding }, 'New Streamlabs donations stored');
      if (seeding) return;

      // Après une interruption prolongée, le feed peut contenir des dons trop anciens
      // pour être annoncés en direct : ils restent en base sans notification.
      const cutoff = Date.now() - this.config.DONATIONS_MAX_AGE_MS;
      const recent = fresh.filter((record) => record.createdAt.getTime() >= cutoff);
      await this.engine?.onDonations(recent);
      await this.engine?.publish(
        detectRecordDonations(recent, previousMaxCents, this.config.RECORD_DONATION_MIN_CENTS),
      );
    } catch (error) {
      this.app.log.error({ err: error }, 'Streamlabs donations collection failed');
    } finally {
      this.#running = false;
    }
  }

  /**
   * Insère tout le relevé en une requête et renvoie les dons réellement nouveaux. Les dons
   * déjà connus ne sont réécrits que si le feed apporte un pays ou un streamer manquant.
   */
  private async upsert(records: DonationRecord[]): Promise<DonationRecord[]> {
    const result = await this.app.pg.query<{ id: string; inserted: boolean }>(
      `INSERT INTO donations (id, amount_cents, donor, comment, country, twitch_display_name, created_at)
       SELECT * FROM unnest(
         $1::text[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
       )
       ON CONFLICT (id) DO UPDATE SET
         country = COALESCE(donations.country, EXCLUDED.country),
         twitch_display_name = COALESCE(donations.twitch_display_name, EXCLUDED.twitch_display_name)
       WHERE (donations.country IS NULL AND EXCLUDED.country IS NOT NULL)
          OR (donations.twitch_display_name IS NULL AND EXCLUDED.twitch_display_name IS NOT NULL)
       RETURNING id, (xmax = 0) AS inserted`,
      [
        records.map((r) => r.id),
        records.map((r) => r.amountCents),
        records.map((r) => r.donor),
        records.map((r) => r.comment),
        records.map((r) => r.country),
        records.map((r) => r.twitch),
        records.map((r) => r.createdAt),
      ],
    );
    const insertedIds = new Set(result.rows.filter((row) => row.inserted).map((row) => String(row.id)));
    return records.filter((record) => insertedIds.has(record.id));
  }
}
