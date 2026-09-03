import type { FastifyInstance } from 'fastify';

import type { ZeventState } from '../sources/index.js';

type SampleRow = { sampled_at: Date; donation_cents: string; viewers: number; state: ZeventState };
type EventRow = { kind: string; occurred_at: Date; payload: Record<string, unknown> };

/** Progression d'un streamer sur la période, en clés courtes : la liste est longue. */
export type RecapProgression = { twitch: string; display: string; raisedCents: number };

export type RecapContent = {
  /** Incrémentée à chaque changement de forme ; l'app tolère les récaps plus anciens. */
  version: number;
  summary: {
    startCents: number | null;
    endCents: number | null;
    raisedCents: number;
    peakViewers: number;
    /** Période réellement couverte par les échantillons collectés. */
    coverage: { start: string | null; end: string | null; complete: boolean };
  };
  counts: { milestones: number; bigDonations: number; liveStarts: number; goalsReached: number };
  milestones: Array<{ thresholdCents: number; occurredAt: string }>;
  bigDonations: Array<{ donor: string; amountCents: number; twitch: string | null; occurredAt: string }>;
  liveStarts: Array<{ twitch: string; display: string; occurredAt: string }>;
  goalsReached: Array<{ twitch: string; display: string; label: string; occurredAt: string }>;
  /** Top 5, conservé pour les versions de l'app antérieures à `progressions`. */
  topProgressions: RecapProgression[];
  /** Toutes les progressions non nulles : l'app y pioche celles de ses favoris. */
  progressions: RecapProgression[];
  highlights: string[];
};

export const RECAP_CONTENT_VERSION = 2;

/** Au-delà, la charge utile pèse sur le cache local de l'app sans rien apporter. */
const MAX_PROGRESSIONS = 250;
const MAX_BIG_DONATIONS = 25;

const numberValue = (value: unknown): number => Number(value ?? 0);
const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

const centsOf = (row: SampleRow | undefined): number | null =>
  row ? Number(row.donation_cents) : null;

/**
 * Produit uniquement des faits calculés depuis les échantillons et événements archivés.
 * Le résultat ne dépend d'aucun appareil : la personnalisation (favoris) se fait à l'affichage.
 */
export async function generateRecapContent(
  app: FastifyInstance,
  periodStart: Date,
  periodEnd: Date,
): Promise<RecapContent> {
  const [beforeResult, firstInPeriodResult, endResult, peakResult, eventsResult] = await Promise.all([
    app.pg.query<SampleRow>(
      `SELECT sampled_at, donation_cents, viewers, state FROM samples
       WHERE edition = 2026 AND sampled_at <= $1 ORDER BY sampled_at DESC LIMIT 1`, [periodStart],
    ),
    app.pg.query<SampleRow>(
      `SELECT sampled_at, donation_cents, viewers, state FROM samples
       WHERE edition = 2026 AND sampled_at > $1 AND sampled_at <= $2
       ORDER BY sampled_at LIMIT 1`, [periodStart, periodEnd],
    ),
    app.pg.query<SampleRow>(
      `SELECT sampled_at, donation_cents, viewers, state FROM samples
       WHERE edition = 2026 AND sampled_at <= $1 ORDER BY sampled_at DESC LIMIT 1`, [periodEnd],
    ),
    app.pg.query<{ peak: number | null }>(
      `SELECT max(viewers)::integer AS peak FROM samples
       WHERE edition = 2026 AND sampled_at >= $1 AND sampled_at <= $2`, [periodStart, periodEnd],
    ),
    app.pg.query<EventRow>(
      `SELECT kind, occurred_at, payload FROM detected_events
       WHERE occurred_at > $1 AND occurred_at <= $2 ORDER BY occurred_at`, [periodStart, periodEnd],
    ),
  ]);

  const before = beforeResult.rows[0];
  const firstInPeriod = firstInPeriodResult.rows[0];
  // Sans échantillon antérieur à la période (collecte démarrée après), on part du premier
  // échantillon disponible : mieux vaut un cumul partiel annoncé comme tel que 0 €.
  const baseline = before ?? firstInPeriod;
  const end = endResult.rows[0];
  const startCents = centsOf(baseline);
  const endCents = centsOf(end);
  const raisedCents = startCents === null || endCents === null ? 0 : Math.max(0, endCents - startCents);
  const coverageStart = before ? periodStart : (firstInPeriod?.sampled_at ?? null);
  const events = eventsResult.rows;

  const milestones = events.filter((e) => e.kind === 'global_milestone').map((event) => ({
    thresholdCents: numberValue(event.payload.thresholdCents), occurredAt: new Date(event.occurred_at).toISOString(),
  }));
  const allBigDonations = events.filter((e) => e.kind === 'big_donation').map((event) => ({
    donor: String(event.payload.donor ?? 'Anonyme'), amountCents: numberValue(event.payload.amountCents),
    twitch: typeof event.payload.twitch === 'string' ? event.payload.twitch.toLowerCase() : null,
    occurredAt: new Date(event.occurred_at).toISOString(),
  })).sort((a, b) => b.amountCents - a.amountCents);
  const bigDonations = allBigDonations.slice(0, MAX_BIG_DONATIONS);
  const liveStarts = events.filter((e) => e.kind === 'favorite_live').map((event) => ({
    twitch: String(event.payload.twitch ?? '').toLowerCase(),
    display: String(event.payload.display ?? event.payload.twitch ?? ''),
    occurredAt: new Date(event.occurred_at).toISOString(),
  }));
  const goalsReached = events.filter((e) => e.kind === 'goal_reached').map((event) => ({
    twitch: String(event.payload.twitch ?? '').toLowerCase(),
    display: String(event.payload.display ?? event.payload.twitch ?? ''),
    label: String(event.payload.label ?? ''), occurredAt: new Date(event.occurred_at).toISOString(),
  }));

  const starting = new Map((baseline?.state.live ?? []).map((s) => [s.twitch.toLowerCase(), s]));
  const progressions = (end?.state.live ?? []).map((streamer) => ({
    twitch: streamer.twitch.toLowerCase(), display: streamer.display,
    raisedCents: Math.max(0, Math.round((streamer.donationAmount.number - (starting.get(streamer.twitch.toLowerCase())?.donationAmount.number ?? streamer.donationAmount.number)) * 100)),
  })).filter((item) => item.raisedCents > 0)
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .slice(0, MAX_PROGRESSIONS);

  const highlights: string[] = [];
  if (raisedCents > 0) highlights.push(`La cagnotte a progressé de ${euros.format(raisedCents / 100)}.`);
  if (endCents !== null) highlights.push(`Elle atteint ${euros.format(endCents / 100)} au terme de la période.`);
  if (milestones.length) highlights.push(`${milestones.length} palier${milestones.length > 1 ? 's' : ''} global${milestones.length > 1 ? 'aux' : ''} franchi${milestones.length > 1 ? 's' : ''}.`);
  if (bigDonations[0]) highlights.push(`Plus gros don détecté : ${euros.format(bigDonations[0].amountCents / 100)}.`);
  if (goalsReached.length) highlights.push(`${goalsReached.length} donation goal${goalsReached.length > 1 ? 's' : ''} atteint${goalsReached.length > 1 ? 's' : ''}.`);

  return {
    version: RECAP_CONTENT_VERSION,
    summary: {
      startCents, endCents, raisedCents,
      peakViewers: Number(peakResult.rows[0]?.peak ?? 0),
      coverage: {
        start: coverageStart ? new Date(coverageStart).toISOString() : null,
        end: end ? new Date(end.sampled_at).toISOString() : null,
        complete: Boolean(before) && Boolean(end),
      },
    },
    counts: { milestones: milestones.length, bigDonations: allBigDonations.length, liveStarts: liveStarts.length, goalsReached: goalsReached.length },
    milestones, bigDonations, liveStarts, goalsReached,
    topProgressions: progressions.slice(0, 5), progressions, highlights,
  };
}
