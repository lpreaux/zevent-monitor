/** Types des réponses du backend ZEvent Monitor (voir apps/api/src/routes/public.ts). */

export interface Amount {
  number: number;
  formatted: string;
}

export interface Streamer {
  twitch_id: string;
  display: string;
  twitch: string;
  profileUrl: string;
  online: boolean;
  game: string;
  viewersAmount: Amount;
  streamlabsId: string | null;
  donationUrl: string;
  ref: string;
  donationAmount: Amount;
}

export type WebsiteMode = 'offline' | 'concert' | 'online';

export interface ZeventState {
  live: Streamer[];
  globalDonationUrl: string;
  streamlabsCampaignId: string;
  donationAmount: Amount;
  viewersCount: Amount;
  calendar: unknown[];
  marquee: unknown;
  widgetVersionId: number;
  eventSourceDisabled: boolean;
  websiteMode: WebsiteMode;
  eventSourceWhitelist: string[];
}

export interface StateResponse {
  data: ZeventState;
  sampledAt: string;
  source: { fetchedAt: string; stale: boolean };
}

export interface Goal {
  id: string | number;
  amountCents: number;
  label: string;
  category: string | null;
  reached: boolean;
}

export interface GoalsSnapshotStreamer {
  twitch: string;
  displayName?: string;
  participationId: string;
  goals: Goal[];
}

export interface GoalsPayload {
  eventId: string;
  streamers: GoalsSnapshotStreamer[];
}

export interface GoalsResponse {
  data: GoalsPayload;
  fetchedAt: string;
  source: string;
  stale: boolean;
}

export interface PlanningParticipant {
  name: string;
  twitch: string | null;
  profileUrl: string | null;
  role: string | null;
  broadcaster: boolean;
}

export interface PlanningEntry {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  /** `ingdoc` = planning communautaire EvenMoreStats, `zevent` = champ `calendar` officiel. */
  source: 'ingdoc' | 'zevent';
  participants: PlanningParticipant[];
}

export interface PlanningPayload {
  eventId: string;
  entries: PlanningEntry[];
  counts: { ingdoc: number; zevent: number };
}

export interface PlanningResponse {
  data: PlanningPayload;
  fetchedAt: string;
  source: string;
  stale: boolean;
}

export type TimeseriesResolution = '1m' | '5m' | '10m';

/** Un point agrégé renvoyé par `GET /v1/timeseries` (les `bigint` PostgreSQL arrivent en chaîne). */
export interface TimeseriesPoint {
  bucket: string;
  sampled_at: string;
  donation_cents: number | string;
  viewers: number | string;
}

export interface TimeseriesResponse {
  edition: number;
  resolution: TimeseriesResolution;
  points: TimeseriesPoint[];
}
