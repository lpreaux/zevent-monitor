import type { FastifyInstance } from 'fastify';

import type { ZeventState } from '../sources/index.js';

type SampleRow = { sampled_at: Date; donation_cents: string; viewers: number; state: ZeventState };
type EventRow = { kind: string; occurred_at: Date; payload: Record<string, unknown> };

export type RecapContent = {
  summary: {
    startCents: number | null;
    endCents: number | null;
    raisedCents: number;
    peakViewers: number;
  };
  counts: { milestones: number; bigDonations: number; liveStarts: number; goalsReached: number };
  milestones: Array<{ thresholdCents: number; occurredAt: string }>;
  bigDonations: Array<{ donor: string; amountCents: number; twitch: string | null; occurredAt: string }>;
  liveStarts: Array<{ twitch: string; display: string; occurredAt: string }>;
  goalsReached: Array<{ twitch: string; display: string; label: string; occurredAt: string }>;
  topProgressions: Array<{ twitch: string; display: string; raisedCents: number }>;
  highlights: string[];
};

const numberValue = (value: unknown): number => Number(value ?? 0);
const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

/** Produit uniquement des faits calculés depuis les échantillons et événements archivés. */
export async function generateRecapContent(
  app: FastifyInstance,
  periodStart: Date,
  periodEnd: Date,
): Promise<RecapContent> {
  const [startResult, endResult, peakResult, eventsResult] = await Promise.all([
    app.pg.query<SampleRow>(
      `SELECT sampled_at, donation_cents, viewers, state FROM samples
       WHERE edition = 2026 AND sampled_at <= $1 ORDER BY sampled_at DESC LIMIT 1`, [periodStart],
    ),
    app.pg.query<SampleRow>(
      `SELECT sampled_at, donation_cents, viewers, state FROM samples
       WHERE edition = 2026 AND sampled_at <= $1 ORDER BY sampled_at DESC LIMIT 1`, [periodEnd],
    ),
    app.pg.query<{ peak: number | null }>(
      `SELECT max(viewers)::integer AS peak FROM samples
       WHERE edition = 2026 AND sampled_at > $1 AND sampled_at <= $2`, [periodStart, periodEnd],
    ),
    app.pg.query<EventRow>(
      `SELECT kind, occurred_at, payload FROM detected_events
       WHERE occurred_at > $1 AND occurred_at <= $2 ORDER BY occurred_at`, [periodStart, periodEnd],
    ),
  ]);

  const start = startResult.rows[0];
  const end = endResult.rows[0];
  const startCents = start ? Number(start.donation_cents) : null;
  const endCents = end ? Number(end.donation_cents) : null;
  const raisedCents = startCents === null || endCents === null ? 0 : Math.max(0, endCents - startCents);
  const events = eventsResult.rows;

  const milestones = events.filter((e) => e.kind === 'global_milestone').map((event) => ({
    thresholdCents: numberValue(event.payload.thresholdCents), occurredAt: new Date(event.occurred_at).toISOString(),
  }));
  const allBigDonations = events.filter((e) => e.kind === 'big_donation').map((event) => ({
    donor: String(event.payload.donor ?? 'Anonyme'), amountCents: numberValue(event.payload.amountCents),
    twitch: typeof event.payload.twitch === 'string' ? event.payload.twitch : null,
    occurredAt: new Date(event.occurred_at).toISOString(),
  })).sort((a, b) => b.amountCents - a.amountCents);
  const bigDonations = allBigDonations.slice(0, 10);
  const liveStarts = events.filter((e) => e.kind === 'favorite_live').map((event) => ({
    twitch: String(event.payload.twitch ?? ''), display: String(event.payload.display ?? event.payload.twitch ?? ''),
    occurredAt: new Date(event.occurred_at).toISOString(),
  }));
  const goalsReached = events.filter((e) => e.kind === 'goal_reached').map((event) => ({
    twitch: String(event.payload.twitch ?? ''), display: String(event.payload.display ?? event.payload.twitch ?? ''),
    label: String(event.payload.label ?? ''), occurredAt: new Date(event.occurred_at).toISOString(),
  }));

  const starting = new Map((start?.state.live ?? []).map((s) => [s.twitch.toLowerCase(), s]));
  const topProgressions = (end?.state.live ?? []).map((streamer) => ({
    twitch: streamer.twitch.toLowerCase(), display: streamer.display,
    raisedCents: Math.max(0, Math.round((streamer.donationAmount.number - (starting.get(streamer.twitch.toLowerCase())?.donationAmount.number ?? streamer.donationAmount.number)) * 100)),
  })).filter((item) => item.raisedCents > 0).sort((a, b) => b.raisedCents - a.raisedCents).slice(0, 5);

  const highlights: string[] = [];
  if (raisedCents > 0) highlights.push(`La cagnotte a progressé de ${euros.format(raisedCents / 100)}.`);
  if (milestones.length) highlights.push(`${milestones.length} palier${milestones.length > 1 ? 's' : ''} global${milestones.length > 1 ? 'aux' : ''} franchi${milestones.length > 1 ? 's' : ''}.`);
  if (bigDonations[0]) highlights.push(`Plus gros don détecté : ${euros.format(bigDonations[0].amountCents / 100)}.`);
  if (goalsReached.length) highlights.push(`${goalsReached.length} donation goal${goalsReached.length > 1 ? 's' : ''} atteint${goalsReached.length > 1 ? 's' : ''}.`);

  return {
    summary: { startCents, endCents, raisedCents, peakViewers: Number(peakResult.rows[0]?.peak ?? 0) },
    counts: { milestones: milestones.length, bigDonations: allBigDonations.length, liveStarts: liveStarts.length, goalsReached: goalsReached.length },
    milestones, bigDonations, liveStarts, goalsReached, topProgressions, highlights,
  };
}
