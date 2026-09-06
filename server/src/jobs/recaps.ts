import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import { ExpoPushClient, isUnrecoverableTokenError } from '../notifications/expo-push.js';
import { isQuietHour, parsePreferences } from '../notifications/preferences.js';
import { getOrCreateRecapContent } from '../recaps/content-cache.js';
import { buildRecapDays } from '../recaps/days.js';
import type { RecapContent } from '../recaps/generator.js';
import { nextScheduleOccurrence, previousScheduleOccurrence } from '../recaps/schedule.js';

type DueSchedule = {
  id: string; installation_id: string; local_time: string; next_run_at: Date;
  timezone: string; expo_push_token: string | null; preferences: unknown;
};

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Corps de la notification : le cumul de la période, puis la cagnotte atteinte. */
export function recapBody(content: RecapContent): string {
  const parts = [`${euros.format(content.summary.raisedCents / 100)} collectés sur la période`];
  if (content.summary.endCents !== null) {
    parts.push(`cagnotte à ${euros.format(content.summary.endCents / 100)}`);
  }
  if (content.counts.goalsReached > 0) {
    parts.push(`${content.counts.goalsReached} goal${content.counts.goalsReached > 1 ? 's' : ''} atteint${content.counts.goalsReached > 1 ? 's' : ''}`);
  }
  return parts.join(' · ');
}

export class RecapScheduler {
  readonly #push: ExpoPushClient;
  #timer?: NodeJS.Timeout;
  #running = false;

  constructor(private readonly app: FastifyInstance, private readonly config: AppConfig, push?: ExpoPushClient) {
    this.#push = push ?? new ExpoPushClient({ ...(config.EXPO_ACCESS_TOKEN ? { accessToken: config.EXPO_ACCESS_TOKEN } : {}) });
  }

  async start(): Promise<void> {
    await this.run();
    this.#timer = setInterval(() => void this.run(), this.config.RECAPS_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void { if (this.#timer) clearInterval(this.#timer); }

  async run(now = new Date()): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const due = await this.app.pg.query<DueSchedule>(
        `SELECT rs.id, rs.installation_id, rs.local_time, rs.next_run_at,
                d.timezone, d.expo_push_token, np.preferences
         FROM recap_schedules rs JOIN devices d ON d.installation_id = rs.installation_id
         LEFT JOIN notification_preferences np ON np.installation_id = rs.installation_id
         WHERE rs.enabled = true AND rs.next_run_at <= $1 ORDER BY rs.next_run_at LIMIT 100`, [now],
      );
      for (const schedule of due.rows) await this.#generate(schedule, now);
      await this.#warmDays(now);
      await this.#checkReceipts();
    } catch (error) {
      this.app.log.error({ err: error }, 'Scheduled recap generation failed');
    } finally {
      this.#running = false;
    }
  }

  /**
   * Calcule d'avance le contenu des journées closes.
   *
   * Ces récaps sont publics : le premier lecteur d'un dimanche matin paierait sinon le
   * calcul d'une journée entière au moment où il ouvre la carte. `getOrCreateRecapContent`
   * ne recalcule rien s'il est déjà en base, l'appel répété ne coûte qu'un SELECT.
   */
  async #warmDays(now: Date): Promise<void> {
    const bounds = await this.app.pg.query<{ first_at: Date | null; last_at: Date | null }>(
      `SELECT min(sampled_at) AS first_at, max(sampled_at) AS last_at
       FROM samples WHERE edition = 2026`,
    );
    const row = bounds.rows[0];
    const days = buildRecapDays(row?.first_at ?? null, row?.last_at ?? null, now);
    for (const day of days) {
      if (day.inProgress) continue;
      await getOrCreateRecapContent(this.app, day.periodStart, day.periodEnd, now);
    }
  }

  async #generate(schedule: DueSchedule, now: Date): Promise<void> {
    const periodEnd = new Date(schedule.next_run_at);
    const all = await this.app.pg.query<{ local_time: string }>(
      'SELECT local_time FROM recap_schedules WHERE installation_id = $1 AND enabled = true',
      [schedule.installation_id],
    );
    const periodStart = previousScheduleOccurrence(all.rows.map((row) => row.local_time), schedule.timezone, periodEnd);
    const nextRun = nextScheduleOccurrence(schedule.local_time, schedule.timezone, periodEnd);
    const dedupeKey = `scheduled:${schedule.installation_id}:${schedule.id}:${periodEnd.toISOString()}`;
    const content = await getOrCreateRecapContent(this.app, periodStart, periodEnd, now);
    const inserted = await this.app.pg.query<{ id: string }>(
      `INSERT INTO recaps (installation_id, schedule_id, kind, period_start, period_end, dedupe_key, content)
       VALUES ($1, $2, 'scheduled', $3, $4, $5, $6)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [schedule.installation_id, schedule.id, periodStart, periodEnd, dedupeKey, content],
    );
    await this.app.pg.query('UPDATE recap_schedules SET next_run_at = $2, updated_at = now() WHERE id = $1', [schedule.id, nextRun]);
    const recapId = inserted.rows[0]?.id;
    if (!recapId || !schedule.expo_push_token) return;
    // Le récap est enregistré dans tous les cas : seule la notification est filtrée,
    // l'utilisateur le retrouve dans l'historique de l'onglet Récaps.
    const preferences = parsePreferences(schedule.preferences);
    if (!preferences.enabled || !preferences.recaps.enabled) return;
    if (preferences.pausedUntil && Date.parse(preferences.pausedUntil) > now.getTime()) return;
    if (preferences.recaps.respectQuietHours && isQuietHour(now, schedule.timezone, preferences)) return;
    await this.#notify(recapId, schedule.expo_push_token, content, preferences.sound, preferences.vibration);
  }

  async #notify(recapId: string, token: string, content: RecapContent, sound: boolean, vibration: boolean) {
    const claimed = await this.app.pg.query(
      `INSERT INTO recap_push_deliveries (recap_id) VALUES ($1)
       ON CONFLICT (recap_id) DO NOTHING`, [recapId],
    );
    if (!claimed.rowCount) return;
    try {
      const [ticket] = await this.#push.send([{
        to: token, title: 'Votre récap ZEvent est prêt',
        body: recapBody(content),
        data: { kind: 'recap', recapId: Number(recapId), url: `/recap/${recapId}` },
        sound: sound ? 'default' : null, channelId: vibration ? 'alerts' : 'alerts-silent', priority: 'high',
      }]);
      await this.app.pg.query(
        `UPDATE recap_push_deliveries SET status = $2, ticket_id = $3, error = $4, updated_at = now() WHERE recap_id = $1`,
        [recapId, ticket?.status === 'ok' ? 'sent' : 'failed', ticket?.status === 'ok' ? ticket.id : null, ticket?.status === 'error' ? ticket.message : null],
      );
    } catch (error) {
      await this.app.pg.query(
        `UPDATE recap_push_deliveries SET status = 'failed', error = 'send_failed', updated_at = now() WHERE recap_id = $1`, [recapId],
      );
    }
  }

  async #checkReceipts(): Promise<void> {
    const pending = await this.app.pg.query<{
      recap_id: string; ticket_id: string; installation_id: string;
    }>(
      `SELECT rpd.recap_id, rpd.ticket_id, r.installation_id
       FROM recap_push_deliveries rpd JOIN recaps r ON r.id = rpd.recap_id
       WHERE rpd.status = 'sent' AND rpd.ticket_id IS NOT NULL
         AND rpd.updated_at < now() - interval '1 minute'
       ORDER BY rpd.updated_at LIMIT 500`,
    );
    if (!pending.rowCount) return;
    const receipts = await this.#push.getReceipts(pending.rows.map((row) => row.ticket_id));
    for (const row of pending.rows) {
      const receipt = receipts[row.ticket_id];
      if (!receipt) continue;
      await this.app.pg.query(
        `UPDATE recap_push_deliveries SET status = $2, error = $3, updated_at = now()
         WHERE recap_id = $1`,
        [row.recap_id, receipt.status === 'ok' ? 'delivered' : 'failed', receipt.status === 'error' ? (receipt.details?.error ?? receipt.message) : null],
      );
      if (receipt.status === 'error' && isUnrecoverableTokenError(receipt.details?.error)) {
        await this.app.pg.query(
          'UPDATE devices SET expo_push_token = NULL, updated_at = now() WHERE installation_id = $1',
          [row.installation_id],
        );
      }
    }
  }
}
