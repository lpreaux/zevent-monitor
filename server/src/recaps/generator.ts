import type { FastifyInstance } from 'fastify';

import { ANONYMOUS_DONORS } from '../routes/donations.js';
import type { ZeventState } from '../sources/index.js';

type SampleRow = { sampled_at: Date; donation_cents: string; viewers: number; state: ZeventState };
type EventRow = { kind: string; occurred_at: Date; payload: Record<string, unknown> };
type BucketRow = { bucket: Date; donation_cents: string };
type DonorRow = { donor: string; total_cents: string; donations: number };
type DonationStatsRow = { donations: number; total_cents: string | null; max_cents: string | null };

/** Progression d'un streamer sur la période, en clés courtes : la liste est longue. */
export type RecapProgression = { twitch: string; display: string; raisedCents: number };

/** Un point de la courbe : instant de la tranche et cagnotte atteinte à ce moment. */
export type RecapPoint = { t: string; cents: number };

export type RecapContent = {
  /** Incrémentée à chaque changement de forme ; l'app tolère les récaps plus anciens. */
  version: number;
  summary: {
    startCents: number | null;
    endCents: number | null;
    raisedCents: number;
    peakViewers: number;
    /** Part de la cagnotte de fin apportée par la période, entre 0 et 1. */
    shareOfTotal: number | null;
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
  /** Courbe de la cagnotte sur la période, échantillonnée pour tenir dans la charge utile. */
  series: { stepMinutes: number; points: RecapPoint[] };
  /** Tranche horaire la plus généreuse. `null` sous trois heures : la question ne se pose pas. */
  bestHour: { start: string; raisedCents: number } | null;
  /**
   * Dons vus passer dans le feed Streamlabs pendant la période. Le feed est une fenêtre
   * glissante : ces chiffres sont un plancher, jamais le compte réel. L'app doit le dire.
   */
  observedDonations: {
    count: number;
    totalCents: number;
    averageCents: number;
    biggestCents: number;
    topDonors: Array<{ donor: string; amountCents: number; count: number }>;
  };
  highlights: string[];
};

export const RECAP_CONTENT_VERSION = 3;

/** Au-delà, la charge utile pèse sur le cache local de l'app sans rien apporter. */
const MAX_PROGRESSIONS = 250;
const MAX_BIG_DONATIONS = 25;
const MAX_TOP_DONORS = 10;

/**
 * Points visés pour la courbe, quelle que soit la durée : assez pour dessiner une forme,
 * assez peu pour qu'un récap d'une semaine ne pèse pas plus lourd qu'un récap d'une heure.
 */
const TARGET_SERIES_POINTS = 120;

/** Pas proposés, du plus fin au plus grossier : des durées rondes se lisent mieux en abscisse. */
const SERIES_STEPS_MINUTES = [1, 5, 10, 15, 30, 60, 120, 240] as const;

/** Pas de repli, au-delà duquel la courbe perdrait sa forme plutôt que du poids. */
const MAX_SERIES_STEP_MINUTES = 240;

/** En deçà, une « meilleure heure » ne distingue rien : la période tient en trop peu de tranches. */
const BEST_HOUR_MIN_MINUTES = 180;

const numberValue = (value: unknown): number => Number(value ?? 0);
const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const hourLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const centsOf = (row: SampleRow | undefined): number | null =>
  row ? Number(row.donation_cents) : null;

/** Pas d'échantillonnage de la courbe pour une durée donnée. */
export function seriesStepMinutes(durationMinutes: number): number {
  const wanted = durationMinutes / TARGET_SERIES_POINTS;
  return SERIES_STEPS_MINUTES.find((step) => step >= wanted) ?? MAX_SERIES_STEP_MINUTES;
}

/**
 * Tranche horaire où la cagnotte a le plus progressé.
 *
 * Chaque relevé retenu donne l'état atteint en fin de tranche : la progression d'une
 * tranche se lit donc par différence avec la précédente. La première n'en a pas — on lui
 * donne pour référence l'état d'avant la période quand il existe, et on la laisse de côté
 * sinon, plutôt que de lui attribuer toute la cagnotte déjà collectée.
 */
export function pickBestHour(
  rows: readonly BucketRow[],
  startCents: number | null,
  durationMinutes: number,
): { start: string; raisedCents: number } | null {
  if (durationMinutes < BEST_HOUR_MIN_MINUTES || rows.length === 0) return null;

  let best: { start: string; raisedCents: number } | null = null;
  let previous = startCents;
  for (const row of rows) {
    const cents = Number(row.donation_cents);
    if (previous !== null) {
      const raisedCents = Math.max(0, cents - previous);
      if (!best || raisedCents > best.raisedCents) {
        best = { start: new Date(row.bucket).toISOString(), raisedCents };
      }
    }
    previous = cents;
  }
  return best && best.raisedCents > 0 ? best : null;
}

/**
 * Produit uniquement des faits calculés depuis les échantillons et événements archivés.
 * Le résultat ne dépend d'aucun appareil : la personnalisation (favoris) se fait à l'affichage.
 */
export async function generateRecapContent(
  app: FastifyInstance,
  periodStart: Date,
  periodEnd: Date,
): Promise<RecapContent> {
  const durationMinutes = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / 60_000);
  const stepMinutes = seriesStepMinutes(durationMinutes);

  const [
    beforeResult, firstInPeriodResult, endResult, peakResult, eventsResult,
    seriesResult, hourlyResult, donorsResult, donationStatsResult,
  ] = await Promise.all([
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
    // Dernier relevé de chaque tranche : la cagnotte ne décroît pas, la fin de tranche est
    // donc l'état atteint, et deux tranches se soustraient pour donner un rythme.
    app.pg.query<BucketRow>(
      `SELECT DISTINCT ON (bucket)
         date_bin(($3 || ' minutes')::interval, sampled_at, '2020-01-01'::timestamptz) AS bucket,
         donation_cents
       FROM samples WHERE edition = 2026 AND sampled_at >= $1 AND sampled_at <= $2
       ORDER BY bucket, sampled_at DESC`, [periodStart, periodEnd, String(stepMinutes)],
    ),
    app.pg.query<BucketRow>(
      `SELECT DISTINCT ON (bucket)
         date_bin('60 minutes', sampled_at, '2020-01-01'::timestamptz) AS bucket, donation_cents
       FROM samples WHERE edition = 2026 AND sampled_at >= $1 AND sampled_at <= $2
       ORDER BY bucket, sampled_at DESC`, [periodStart, periodEnd],
    ),
    app.pg.query<DonorRow>(
      `SELECT btrim(donor) AS donor, sum(amount_cents) AS total_cents, count(*)::integer AS donations
       FROM donations
       WHERE created_at > $1 AND created_at <= $2 AND NOT (lower(btrim(donor)) = ANY($3::text[]))
       GROUP BY lower(btrim(donor)), btrim(donor)
       ORDER BY sum(amount_cents) DESC LIMIT $4`,
      [periodStart, periodEnd, [...ANONYMOUS_DONORS], MAX_TOP_DONORS],
    ),
    app.pg.query<DonationStatsRow>(
      `SELECT count(*)::integer AS donations, sum(amount_cents) AS total_cents,
              max(amount_cents) AS max_cents
       FROM donations WHERE created_at > $1 AND created_at <= $2`, [periodStart, periodEnd],
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

  const points: RecapPoint[] = seriesResult.rows.map((row) => ({
    t: new Date(row.bucket).toISOString(), cents: Number(row.donation_cents),
  }));
  const bestHour = pickBestHour(hourlyResult.rows, startCents, durationMinutes);

  const stats = donationStatsResult.rows[0];
  const observedCount = Number(stats?.donations ?? 0);
  const observedTotal = Number(stats?.total_cents ?? 0);
  const observedDonations = {
    count: observedCount,
    totalCents: observedTotal,
    averageCents: observedCount > 0 ? Math.round(observedTotal / observedCount) : 0,
    biggestCents: Number(stats?.max_cents ?? 0),
    topDonors: donorsResult.rows.map((row) => ({
      donor: row.donor, amountCents: Number(row.total_cents), count: Number(row.donations),
    })),
  };

  const highlights: string[] = [];
  if (raisedCents > 0) highlights.push(`La cagnotte a progressé de ${euros.format(raisedCents / 100)}.`);
  if (endCents !== null) highlights.push(`Elle atteint ${euros.format(endCents / 100)} au terme de la période.`);
  if (bestHour) highlights.push(`Meilleure heure : ${hourLabel.format(new Date(bestHour.start))}, ${euros.format(bestHour.raisedCents / 100)} collectés.`);
  if (milestones.length) highlights.push(`${milestones.length} palier${milestones.length > 1 ? 's' : ''} global${milestones.length > 1 ? 'aux' : ''} franchi${milestones.length > 1 ? 's' : ''}.`);
  if (bigDonations[0]) highlights.push(`Plus gros don détecté : ${euros.format(bigDonations[0].amountCents / 100)}.`);
  if (goalsReached.length) highlights.push(`${goalsReached.length} donation goal${goalsReached.length > 1 ? 's' : ''} atteint${goalsReached.length > 1 ? 's' : ''}.`);

  return {
    version: RECAP_CONTENT_VERSION,
    summary: {
      startCents, endCents, raisedCents,
      peakViewers: Number(peakResult.rows[0]?.peak ?? 0),
      shareOfTotal: endCents !== null && endCents > 0 ? raisedCents / endCents : null,
      coverage: {
        start: coverageStart ? new Date(coverageStart).toISOString() : null,
        end: end ? new Date(end.sampled_at).toISOString() : null,
        complete: Boolean(before) && Boolean(end),
      },
    },
    counts: { milestones: milestones.length, bigDonations: allBigDonations.length, liveStarts: liveStarts.length, goalsReached: goalsReached.length },
    milestones, bigDonations, liveStarts, goalsReached,
    topProgressions: progressions.slice(0, 5), progressions,
    series: { stepMinutes, points },
    bestHour,
    observedDonations,
    highlights,
  };
}
