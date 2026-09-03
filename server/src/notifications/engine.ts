import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import type { GoalsSnapshotPayload } from '../jobs/goals-sync.js';
import type { ZeventState } from '../sources/index.js';
import {
  detectGoalEvents,
  detectLiveStarts,
  detectWebsiteModeChange,
  donationEvent,
  milestoneEvent,
  renderNotification,
  shouldDeliver,
  type DetectedEvent,
  type DeviceContext,
  type DonationRecord,
} from './events.js';
import { ExpoPushClient, isUnrecoverableTokenError, type ExpoPushMessage } from './expo-push.js';
import { milestonesCrossed, parsePreferences } from './preferences.js';

type DeviceRow = {
  installation_id: string;
  expo_push_token: string;
  timezone: string;
  preferences: unknown;
  favorites: string[];
};

type Device = DeviceContext & { installationId: string; pushToken: string };

type StoredEvent = { id: number; event: DetectedEvent };

/**
 * Moteur d'alertes : détecte les événements à partir des collectes, les déduplique
 * en base (`detected_events.dedupe_key`), puis diffuse une notification au plus par
 * appareil et par événement (`push_deliveries`). Cf. PLAN.md §3.1 et §7.
 */
export class NotificationEngine {
  readonly #push: ExpoPushClient;
  #lastState?: ZeventState;
  #lastTotalCents?: number;
  #receiptsTimer?: NodeJS.Timeout;

  constructor(
    private readonly app: FastifyInstance,
    private readonly config: AppConfig,
    push?: ExpoPushClient,
  ) {
    this.#push =
      push ??
      new ExpoPushClient({
        ...(config.EXPO_ACCESS_TOKEN ? { accessToken: config.EXPO_ACCESS_TOKEN } : {}),
      });
  }

  /** Reprend l'état de la dernière collecte pour ne pas rejouer d'anciens franchissements. */
  async start(): Promise<void> {
    const result = await this.app.pg.query<{ donation_cents: string; state: ZeventState }>(
      'SELECT donation_cents, state FROM samples WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1',
    );
    const row = result.rows[0];
    if (row) {
      this.#lastState = row.state;
      this.#lastTotalCents = Number(row.donation_cents);
    }
    this.#receiptsTimer = setInterval(
      () => void this.checkReceipts(),
      this.config.PUSH_RECEIPTS_INTERVAL_MS,
    );
    this.#receiptsTimer.unref();
  }

  stop(): void {
    if (this.#receiptsTimer) clearInterval(this.#receiptsTimer);
  }

  /** Appelé à chaque collecte réussie de `zevent.fr/api/`. */
  async onState(state: ZeventState, now = new Date()): Promise<void> {
    const totalCents = Math.round(state.donationAmount.number * 100);
    const previousState = this.#lastState;
    const previousTotal = this.#lastTotalCents;
    this.#lastState = state;
    this.#lastTotalCents = totalCents;

    const events = [
      ...detectWebsiteModeChange(previousState, state, now),
      ...detectLiveStarts(previousState, state, now),
    ];
    if (previousTotal !== undefined && totalCents > previousTotal) {
      events.push(...(await this.#milestoneEvents(previousTotal, totalCents, now)));
    }
    await this.publish(events, now);
  }

  /** Appelé après chaque snapshot de donation goals. */
  async onGoals(goals: GoalsSnapshotPayload, now = new Date()): Promise<void> {
    const state = this.#lastState;
    if (!state) return;
    const events = detectGoalEvents(goals, state, now, this.config.GOAL_NEAR_RATIO);
    if (events.length === 0) return;

    // Premier passage : on enregistre les paliers déjà atteints sans notifier,
    // sinon un premier démarrage déclencherait des centaines d'alertes rétroactives.
    const seeded = await this.app.pg.query(
      "SELECT 1 FROM detected_events WHERE kind IN ('goal_reached', 'goal_near') LIMIT 1",
    );
    await this.publish(events, now, { deliver: seeded.rowCount !== 0 });
  }

  /** Appelé avec les dons Streamlabs nouvellement vus (déjà dédupliqués par identifiant). */
  async onDonations(donations: DonationRecord[], now = new Date()): Promise<void> {
    if (donations.length === 0) return;
    await this.publish(donations.map(donationEvent), now);
  }

  /** Union des seuils franchis, tous appareils confondus (chaque seuil reste unique en base). */
  async #milestoneEvents(
    previousCents: number,
    currentCents: number,
    now: Date,
  ): Promise<DetectedEvent[]> {
    const result = await this.app.pg.query<{ preferences: unknown }>(
      `SELECT np.preferences FROM notification_preferences np
       JOIN devices d ON d.installation_id = np.installation_id
       WHERE d.expo_push_token IS NOT NULL AND d.disabled_at IS NULL`,
    );

    const thresholds = new Set<number>();
    for (const row of result.rows) {
      for (const threshold of milestonesCrossed(
        previousCents,
        currentCents,
        parsePreferences(row.preferences),
      )) {
        thresholds.add(threshold);
      }
    }
    return [...thresholds]
      .sort((a, b) => a - b)
      .map((threshold) => milestoneEvent(threshold, currentCents, now));
  }

  /** Enregistre les événements inédits puis, sauf amorçage, les diffuse aux appareils concernés. */
  async publish(
    events: DetectedEvent[],
    now = new Date(),
    options: { deliver?: boolean } = {},
  ): Promise<void> {
    if (events.length === 0) return;

    const stored: StoredEvent[] = [];
    for (const event of events) {
      const result = await this.app.pg.query<{ id: string }>(
        `INSERT INTO detected_events (kind, dedupe_key, occurred_at, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        [event.kind, event.dedupeKey, event.occurredAt, event.payload],
      );
      const row = result.rows[0];
      if (row) stored.push({ id: Number(row.id), event });
    }

    if (stored.length === 0) return;
    this.app.log.info(
      { events: stored.length, kinds: [...new Set(stored.map((s) => s.event.kind))] },
      'Detected events stored',
    );
    if (options.deliver === false || !this.config.NOTIFICATIONS_ENABLED) return;

    await this.#dispatch(stored, now);
  }

  async #dispatch(stored: StoredEvent[], now: Date): Promise<void> {
    const devices = await this.#loadDevices();
    if (devices.length === 0) return;

    const messages: ExpoPushMessage[] = [];
    const deliveries: number[] = [];

    for (const device of devices) {
      for (const { id, event } of stored) {
        if (!shouldDeliver(event, device, now)) continue;

        // La clé de déduplication est posée avant l'envoi : deux collectes identiques
        // ne peuvent pas produire deux notifications pour le même événement.
        const claimed = await this.app.pg.query<{ id: string }>(
          `INSERT INTO push_deliveries (installation_id, event_id)
           VALUES ($1, $2)
           ON CONFLICT (installation_id, event_id) DO NOTHING
           RETURNING id`,
          [device.installationId, id],
        );
        const row = claimed.rows[0];
        if (!row) continue;

        const notification = renderNotification(event);
        messages.push({
          to: device.pushToken,
          title: notification.title,
          body: notification.body,
          data: { ...notification.data, eventId: id },
          sound: device.preferences.sound ? 'default' : null,
          channelId: device.preferences.vibration ? 'alerts' : 'alerts-silent',
          priority: 'high',
        });
        deliveries.push(Number(row.id));
      }
    }

    if (messages.length === 0) return;

    let tickets;
    try {
      tickets = await this.#push.send(messages);
    } catch (error) {
      this.app.log.error({ err: error }, 'Expo push send failed');
      await this.#markDeliveries(deliveries, 'failed', null, 'send_failed');
      return;
    }

    for (const [index, ticket] of tickets.entries()) {
      const deliveryId = deliveries[index];
      const message = messages[index];
      if (deliveryId === undefined || message === undefined) continue;

      if (ticket.status === 'ok') {
        await this.#markDeliveries([deliveryId], 'sent', ticket.id, null);
        continue;
      }
      await this.#markDeliveries([deliveryId], 'failed', null, ticket.details?.error ?? ticket.message);
      if (isUnrecoverableTokenError(ticket.details?.error)) {
        await this.#disableToken(message.to);
      }
    }

    this.app.log.info({ sent: messages.length }, 'Push notifications dispatched');
  }

  async #loadDevices(): Promise<Device[]> {
    const result = await this.app.pg.query<DeviceRow>(
      `SELECT d.installation_id, d.expo_push_token, d.timezone, np.preferences,
              COALESCE(array_agg(f.twitch) FILTER (WHERE f.twitch IS NOT NULL), '{}') AS favorites
       FROM devices d
       LEFT JOIN notification_preferences np ON np.installation_id = d.installation_id
       LEFT JOIN favorites f ON f.installation_id = d.installation_id
       WHERE d.expo_push_token IS NOT NULL AND d.disabled_at IS NULL
       GROUP BY d.installation_id, np.preferences`,
    );

    return result.rows.map((row) => ({
      installationId: row.installation_id,
      pushToken: row.expo_push_token,
      timeZone: row.timezone,
      preferences: parsePreferences(row.preferences),
      favorites: new Set(row.favorites.map((twitch) => twitch.toLowerCase())),
    }));
  }

  async #markDeliveries(
    ids: number[],
    status: string,
    ticketId: string | null,
    error: string | null,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.app.pg.query(
      `UPDATE push_deliveries
       SET status = $2, ticket_id = COALESCE($3, ticket_id), error = $4, updated_at = now()
       WHERE id = ANY($1::bigint[])`,
      [ids, status, ticketId, error],
    );
  }

  async #disableToken(pushToken: string): Promise<void> {
    await this.app.pg.query(
      'UPDATE devices SET expo_push_token = NULL, updated_at = now() WHERE expo_push_token = $1',
      [pushToken],
    );
    this.app.log.warn('Expo push token rejected by Expo, cleared');
  }

  /** Traite les reçus Expo : confirme les envois et retire les tokens définitivement invalides. */
  async checkReceipts(): Promise<void> {
    try {
      const pending = await this.app.pg.query<{ id: string; ticket_id: string; installation_id: string }>(
        `SELECT id, ticket_id, installation_id FROM push_deliveries
         WHERE status = 'sent' AND ticket_id IS NOT NULL AND created_at < now() - interval '1 minute'
         ORDER BY created_at LIMIT 500`,
      );
      if (pending.rowCount === 0) return;

      const receipts = await this.#push.getReceipts(pending.rows.map((row) => row.ticket_id));
      for (const row of pending.rows) {
        const receipt = receipts[row.ticket_id];
        if (!receipt) continue;
        if (receipt.status === 'ok') {
          await this.#markDeliveries([Number(row.id)], 'delivered', null, null);
          continue;
        }
        await this.#markDeliveries(
          [Number(row.id)],
          'failed',
          null,
          receipt.details?.error ?? receipt.message,
        );
        if (isUnrecoverableTokenError(receipt.details?.error)) {
          await this.app.pg.query(
            'UPDATE devices SET expo_push_token = NULL, updated_at = now() WHERE installation_id = $1',
            [row.installation_id],
          );
        }
      }
    } catch (error) {
      this.app.log.error({ err: error }, 'Expo push receipts check failed');
    }
  }
}
