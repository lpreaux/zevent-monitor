import { fetchJson } from './client';

/**
 * Client des routes de dons du backend (`server/src/routes/donations.ts`).
 *
 * Toutes ces données proviennent du feed Streamlabs archivé par le backend. Le feed ne montre
 * que les 3000 derniers dons par relevé : en pic d'affluence, des dons peuvent passer entre deux relevés.
 * Chaque réponse porte donc un bloc `observed` que l'UI doit afficher (« d'après les dons observés »).
 */

export type DonationWindow = '1h' | '6h' | '24h' | 'all';

export interface Donation {
  id: string;
  donor: string;
  anonymous: boolean;
  amountCents: number;
  comment: string | null;
  /** Code pays Streamlabs (ISO alpha-2), absent pour les dons archivés avant sa prise en compte. */
  country: string | null;
  /** Login Twitch du streamer soutenu, ou `null` pour la cagnotte globale. */
  twitch: string | null;
  createdAt: string;
}

export interface Observed {
  count: number;
  totalCents: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface RecentDonationsResponse {
  donations: Donation[];
  /**
   * Curseur de la page suivante, `null` quand le feed est épuisé. Le backend pagine sur
   * le couple (date, identifiant) plutôt que sur un décalage : la tête du feed s'enrichit
   * en continu, un `OFFSET` renverrait des dons déjà lus.
   */
  nextCursor: string | null;
  /**
   * Absent sur les pages suivantes : ce bloc porte sur toute la table, le recalculer à
   * chaque pas de défilement coûterait un balayage complet.
   */
  observed?: Observed;
}

export interface TopDonor {
  rank: number;
  donor: string;
  totalCents: number;
  count: number;
  largestCents: number;
  lastAt: string;
}

export interface TopDonorsResponse {
  window: DonationWindow;
  since: string | null;
  donors: TopDonor[];
  observed: Observed;
}

export interface LargestDonationsResponse {
  window: DonationWindow;
  since: string | null;
  donations: Donation[];
  observed: Observed;
}

export interface DonationSummary {
  count: number;
  totalCents: number;
  meanCents: number | null;
  medianCents: number | null;
  maxCents: number | null;
  withComment: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface DonationBucket {
  key: string;
  label: string;
  count: number;
  totalCents: number;
}

export interface DonationCountry {
  country: string | null;
  count: number;
  totalCents: number;
}

export interface DonationStatsResponse {
  window: DonationWindow;
  since: string | null;
  summary: DonationSummary;
  distribution: DonationBucket[];
  countries: DonationCountry[];
}

export interface StreamerDonationsResponse {
  twitch: string;
  summary: DonationSummary;
  distribution: DonationBucket[];
  largest: Donation[];
  recent: Donation[];
}

export interface StreamerMomentum {
  twitch: string;
  display: string;
  profileUrl: string;
  online: boolean;
  game: string;
  viewers: number;
  nowCents: number;
  deltaCents: number;
  rank: number;
  previousRank: number | null;
}

export interface MomentumResponse {
  windowMinutes: number;
  from: string | null;
  to: string;
  /** `false` tant que la collecte ne couvre pas toute la fenêtre demandée. */
  complete: boolean;
  streamers: StreamerMomentum[];
}

export interface RatePoint {
  bucket: string;
  endCents: number;
  raisedCents: number;
  peakViewers: number;
  samples: number;
}

export interface RateResponse {
  bucketMinutes: number;
  points: RatePoint[];
}

export interface StreamerSeriesPoint {
  bucket: string;
  eur: number;
  viewers: number;
  online: boolean;
}

export interface StreamerSeriesResponse {
  resolution: '1m' | '5m' | '10m';
  streamers: Record<string, StreamerSeriesPoint[]>;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export interface RecentDonationsParams {
  limit?: number;
  /** Logins Twitch, filtre « mes favoris » par exemple. */
  twitch?: string[];
  minCents?: number;
  withComment?: boolean;
  /** Page suivante : `nextCursor` de la réponse précédente. */
  cursor?: string;
}

export function getRecentDonations(params: RecentDonationsParams = {}): Promise<RecentDonationsResponse> {
  return fetchJson<RecentDonationsResponse>(
    `/v1/donations/recent${query({
      limit: params.limit,
      twitch: params.twitch?.join(','),
      minCents: params.minCents,
      withComment: params.withComment,
      cursor: params.cursor,
    })}`,
  );
}

export function getTopDonors(window: DonationWindow, limit = 20): Promise<TopDonorsResponse> {
  return fetchJson<TopDonorsResponse>(`/v1/donations/top${query({ window, limit })}`);
}

export function getLargestDonations(
  window: DonationWindow,
  limit = 10,
  twitch?: string[],
): Promise<LargestDonationsResponse> {
  return fetchJson<LargestDonationsResponse>(
    `/v1/donations/largest${query({ window, limit, twitch: twitch?.join(',') })}`,
  );
}

export function getDonationStats(
  window: DonationWindow,
  twitch?: string[],
): Promise<DonationStatsResponse> {
  return fetchJson<DonationStatsResponse>(
    `/v1/donations/stats${query({ window, twitch: twitch?.join(',') })}`,
  );
}

export function getStreamerDonations(twitch: string): Promise<StreamerDonationsResponse> {
  return fetchJson<StreamerDonationsResponse>(
    `/v1/streamers/${encodeURIComponent(twitch.toLowerCase())}/donations`,
  );
}

export function getMomentum(windowMinutes: number, limit = 10): Promise<MomentumResponse> {
  return fetchJson<MomentumResponse>(`/v1/streamers/momentum${query({ window: windowMinutes, limit })}`);
}

export function getCollectionRate(bucketMinutes: number): Promise<RateResponse> {
  return fetchJson<RateResponse>(`/v1/timeseries/rate${query({ bucket: bucketMinutes })}`);
}

export function getStreamerSeries(
  logins: string[],
  resolution: '1m' | '5m' | '10m' = '10m',
): Promise<StreamerSeriesResponse> {
  return fetchJson<StreamerSeriesResponse>(
    `/v1/timeseries/streamers${query({ twitch: logins.join(','), resolution })}`,
  );
}
