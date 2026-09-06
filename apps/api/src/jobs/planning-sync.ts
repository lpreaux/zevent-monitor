import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { EvenMoreStatsSource, SourceClient } from '../sources/index.js';

export type PlanningParticipant = {
  name: string;
  twitch: string | null;
  profileUrl: string | null;
  /** `host`, `guest`, `participant`… tel que fourni par la source, en minuscules. */
  role: string | null;
  broadcaster: boolean;
};

export type PlanningEntry = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  /** `ingdoc` = planning communautaire EvenMoreStats, `zevent` = champ `calendar` officiel. */
  source: 'ingdoc' | 'zevent';
  participants: PlanningParticipant[];
};

export type PlanningSnapshotPayload = {
  eventId: string;
  entries: PlanningEntry[];
  /** Nombre d'entrées retenues par source, pour diagnostiquer un repli silencieux. */
  counts: { ingdoc: number; zevent: number };
};

const participantSchema = z
  .object({
    streamer_name: z.string(),
    profile_url: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    broadcaster: z.boolean().optional(),
    socials: z
      .object({ twitch: z.object({ login: z.string().optional() }).loose().optional() })
      .loose()
      .optional(),
  })
  .loose();

const showSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    description: z.string().nullable().optional(),
    schedule: z.object({ start: z.string(), end: z.string().nullable().optional() }).loose(),
    all_day: z.boolean().optional(),
    participants: z.array(z.unknown()).optional(),
  })
  .loose();

/**
 * Entrée du champ `calendar` de `zevent.fr/api/`, resté vide jusqu'au lancement 2026.
 * Sa forme exacte n'ayant jamais été publiée, on accepte les noms de champs les plus
 * probables et on ignore silencieusement ce qui ne s'y conforme pas (docs/plans/2026-mobile-app.md §1.1 et §5).
 */
const officialEntrySchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    label: z.string().optional(),
    description: z.string().nullable().optional(),
    start: z.string().optional(),
    startAt: z.string().optional(),
    start_at: z.string().optional(),
    startsAt: z.string().optional(),
    date: z.string().optional(),
    end: z.string().nullable().optional(),
    endAt: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    allDay: z.boolean().optional(),
    all_day: z.boolean().optional(),
  })
  .loose();

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toParticipants(raw: unknown[]): PlanningParticipant[] {
  const participants: PlanningParticipant[] = [];
  for (const item of raw) {
    const parsed = participantSchema.safeParse(item);
    if (!parsed.success) continue;
    const login = parsed.data.socials?.twitch?.login;
    participants.push({
      name: parsed.data.streamer_name,
      twitch: typeof login === 'string' && login.length > 0 ? login.toLowerCase() : null,
      profileUrl: parsed.data.profile_url ?? null,
      role: parsed.data.role ? parsed.data.role.toLowerCase() : null,
      broadcaster: Boolean(parsed.data.broadcaster),
    });
  }
  return participants;
}

/** Normalise `GET /events/{id}/shows` en entrées de planning, en ignorant les éléments illisibles. */
export function toPlanningEntries(shows: unknown[]): PlanningEntry[] {
  const entries: PlanningEntry[] = [];
  for (const raw of shows) {
    const parsed = showSchema.safeParse(raw);
    if (!parsed.success) continue;
    const startsAt = toIso(parsed.data.schedule.start);
    if (!startsAt) continue;
    entries.push({
      id: `ingdoc:${parsed.data.id}`,
      title: parsed.data.name,
      description: parsed.data.description ?? '',
      startsAt,
      endsAt: toIso(parsed.data.schedule.end),
      allDay: Boolean(parsed.data.all_day),
      source: 'ingdoc',
      participants: toParticipants(parsed.data.participants ?? []),
    });
  }
  return sortEntries(entries);
}

/** Parseur tolérant du `calendar` officiel, dont la structure n'est pas documentée. */
export function toOfficialCalendarEntries(calendar: unknown): PlanningEntry[] {
  if (!Array.isArray(calendar)) return [];
  const entries: PlanningEntry[] = [];
  for (const [index, raw] of calendar.entries()) {
    const parsed = officialEntrySchema.safeParse(raw);
    if (!parsed.success) continue;
    const data = parsed.data;
    const title = data.title ?? data.name ?? data.label;
    const startsAt = toIso(data.start ?? data.startAt ?? data.start_at ?? data.startsAt ?? data.date);
    if (!title || !startsAt) continue;
    entries.push({
      id: `zevent:${data.id ?? index}`,
      title,
      description: data.description ?? '',
      startsAt,
      endsAt: toIso(data.end ?? data.endAt ?? data.end_at ?? data.endsAt),
      allDay: Boolean(data.allDay ?? data.all_day),
      source: 'zevent',
      participants: [],
    });
  }
  return sortEntries(entries);
}

/**
 * Fusionne les deux sources : le planning officiel prime, les entrées communautaires
 * complètent tant qu'elles ne portent pas le même titre au même horaire.
 */
export function mergePlanningEntries(
  official: PlanningEntry[],
  community: PlanningEntry[],
): PlanningEntry[] {
  const seen = new Set(official.map((entry) => `${entry.title.trim().toLowerCase()}@${entry.startsAt}`));
  const merged = [...official];
  for (const entry of community) {
    if (seen.has(`${entry.title.trim().toLowerCase()}@${entry.startsAt}`)) continue;
    merged.push(entry);
  }
  return sortEntries(merged);
}

function sortEntries(entries: PlanningEntry[]): PlanningEntry[] {
  return [...entries].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'fr'),
  );
}

/**
 * Synchronise le planning du ZEvent 2026. Source principale : les « shows » d'EvenMoreStats
 * (InGDoc, communautaire, cf. docs/plans/2026-mobile-app.md §1.3) ; le champ `calendar` de l'API officielle, vide
 * jusqu'au lancement, est fusionné dès qu'il contient quelque chose d'exploitable.
 * Le dernier snapshot valide reste servi par `GET /v1/planning`.
 */
export class PlanningSync {
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
    this.#timer = setInterval(() => void this.sync(), this.config.PLANNING_SYNC_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  /** Dernier `calendar` officiel collecté, lu depuis la dernière collecte enregistrée. */
  async #officialCalendar(): Promise<unknown> {
    try {
      const result = await this.app.pg.query<{ calendar: unknown }>(
        `SELECT state->'calendar' AS calendar FROM samples
         WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1`,
      );
      return result.rows[0]?.calendar ?? [];
    } catch (error) {
      this.app.log.warn({ err: error }, 'Official calendar unavailable for planning sync');
      return [];
    }
  }

  async sync(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const eventId = this.config.EVENMORESTATS_EVENT_ID;
      const showsResult = await this.#source.getShows(eventId);
      const community = toPlanningEntries(showsResult.data);
      const official = toOfficialCalendarEntries(await this.#officialCalendar());
      const entries = mergePlanningEntries(official, community);

      const payload: PlanningSnapshotPayload = {
        eventId,
        entries,
        counts: { ingdoc: community.length, zevent: official.length },
      };
      await this.app.pg.query(
        'INSERT INTO planning_snapshots (fetched_at, source, stale, payload) VALUES ($1, $2, $3, $4)',
        [new Date(), official.length > 0 ? 'zevent+ingdoc' : 'ingdoc', showsResult.stale, payload],
      );
      this.app.log.info(
        { entries: entries.length, ...payload.counts, stale: showsResult.stale },
        'Planning snapshot stored',
      );
    } catch (error) {
      this.app.log.error({ err: error }, 'Planning sync failed');
    } finally {
      this.#running = false;
    }
  }
}
