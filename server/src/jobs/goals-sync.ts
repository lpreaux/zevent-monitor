import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { EvenMoreStatsSource, SourceClient } from '../sources/index.js';

const overviewEntrySchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    donation_goals_count: z.number().optional(),
    socials: z
      .object({ twitch: z.object({ login: z.string() }).optional() })
      .optional(),
  })
  .passthrough();

const goalEntrySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  amount: z.number(),
  category: z.string().nullable().optional(),
  reached: z.boolean().optional(),
});

export type GoalsSnapshotStreamer = {
  twitch: string;
  displayName?: string;
  participationId: string;
  goals: Array<{
    id: string | number;
    amountCents: number;
    label: string;
    category: string | null;
    reached: boolean;
  }>;
};

export type GoalsSnapshotPayload = {
  eventId: string;
  streamers: GoalsSnapshotStreamer[];
};

function unwrap<T>(data: T[] | { data?: T[] | undefined }): T[] {
  return Array.isArray(data) ? data : (data.data ?? []);
}

/** Ne conserve que les participations dotées d'un login Twitch et d'au moins un palier. */
export function selectOverviewParticipants(
  overview: unknown[],
): Array<{ id: string; name?: string; twitch: string }> {
  const participants: Array<{ id: string; name?: string; twitch: string }> = [];
  for (const raw of overview) {
    const parsed = overviewEntrySchema.safeParse(raw);
    if (!parsed.success) continue;
    const twitch = parsed.data.socials?.twitch?.login;
    if (!twitch || !parsed.data.donation_goals_count) continue;
    participants.push({ id: parsed.data.id, ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), twitch });
  }
  return participants;
}

export function toGoalsSnapshotEntries(goals: unknown[]): GoalsSnapshotStreamer['goals'] {
  const entries: GoalsSnapshotStreamer['goals'] = [];
  for (const raw of goals) {
    const parsed = goalEntrySchema.safeParse(raw);
    if (!parsed.success) continue;
    entries.push({
      id: parsed.data.id,
      amountCents: parsed.data.amount,
      label: parsed.data.name,
      category: parsed.data.category ?? null,
      reached: Boolean(parsed.data.reached),
    });
  }
  return entries;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Synchronise périodiquement les donation goals ZEvent 2026 depuis EvenMoreStats/InGDoc
 * (source communautaire non officielle) et conserve le dernier snapshot valide en base.
 * Cf. PLAN.md §1.3 et §3.1.
 */
export class GoalsSync {
  readonly #source: EvenMoreStatsSource;
  #timer?: NodeJS.Timeout;
  #running = false;

  constructor(
    private readonly app: FastifyInstance,
    private readonly config: AppConfig,
  ) {
    this.#source = new EvenMoreStatsSource(new SourceClient());
  }

  async start(): Promise<void> {
    await this.sync();
    this.#timer = setInterval(() => void this.sync(), this.config.GOALS_SYNC_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async sync(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const eventId = this.config.EVENMORESTATS_EVENT_ID;
      const overviewResult = await this.#source.getGoalsOverview(eventId);
      const participants = selectOverviewParticipants(unwrap(overviewResult.data));

      let stale = overviewResult.stale;
      const streamers: GoalsSnapshotStreamer[] = [];
      for (const participant of participants) {
        const goalsResult = await this.#source.getParticipationGoals(participant.id);
        stale = stale || goalsResult.stale;
        streamers.push({
          twitch: participant.twitch,
          ...(participant.name !== undefined ? { displayName: participant.name } : {}),
          participationId: participant.id,
          goals: toGoalsSnapshotEntries(unwrap(goalsResult.data)),
        });
        await sleep(this.config.GOALS_SYNC_REQUEST_DELAY_MS);
      }

      const payload: GoalsSnapshotPayload = { eventId, streamers };
      await this.app.pg.query(
        'INSERT INTO goals_snapshots (fetched_at, source, stale, payload) VALUES ($1, $2, $3, $4)',
        [new Date(), 'ingdoc', stale, payload],
      );
      this.app.log.info({ streamers: streamers.length, stale }, 'Donation goals snapshot stored');
    } catch (error) {
      this.app.log.error({ err: error }, 'Donation goals sync failed');
    } finally {
      this.#running = false;
    }
  }
}
