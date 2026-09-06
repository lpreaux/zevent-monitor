import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  DONATIONS_REFETCH_INTERVAL_MS,
  GOALS_REFETCH_INTERVAL_MS,
  LIVE_REFETCH_INTERVAL_MS,
  PLANNING_REFETCH_INTERVAL_MS,
  SERIES_REFETCH_INTERVAL_MS,
} from '@/lib/config';
import {
  getCollectionRate,
  getDonationStats,
  getLargestDonations,
  getMomentum,
  getRecentDonations,
  getStreamerDonations,
  getStreamerSeries,
  getTopDonors,
  type DonationWindow,
  type RecentDonationsParams,
} from './donations';
import { loadBundledGoals } from './goals-fallback';
import { loadBundledPlanning } from './planning-fallback';
import { getGoals, getPlanning, getState, getTimeseries } from './zevent';
import type { Goal, PlanningEntry, TimeseriesResolution } from './types';

export const queryKeys = {
  state: ['zevent', 'state'] as const,
  goals: ['zevent', 'goals'] as const,
  planning: ['zevent', 'planning'] as const,
  timeseries: ['zevent', 'timeseries'] as const,
  donations: ['zevent', 'donations'] as const,
  streamers: ['zevent', 'streamers'] as const,
};

/** Polling de l'état courant (cagnotte, viewers, live) toutes les 15 s en avant-plan. */
export function useZeventState() {
  return useQuery({
    queryKey: queryKeys.state,
    queryFn: getState,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: getGoals,
    refetchInterval: GOALS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export function usePlanningQuery() {
  return useQuery({
    queryKey: queryKeys.planning,
    queryFn: getPlanning,
    refetchInterval: PLANNING_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export interface PlanningResult {
  entries: PlanningEntry[];
  /** `live` = snapshot backend, `bundled` = copie embarquée exportée avant le week-end. */
  origin: 'live' | 'bundled';
  stale: boolean;
  fetchedAt: string | null;
}

/**
 * Planning affiché : snapshot backend en priorité, repli sur la copie embarquée dès que
 * le backend est injoignable ou n'a encore rien synchronisé (docs/plans/2026-mobile-app.md §4 P0 et §7).
 */
export function usePlanning(): PlanningResult & {
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => void;
} {
  const query = usePlanningQuery();

  const result = useMemo<PlanningResult>(() => {
    const live = query.data;
    if (live && live.data.entries.length > 0) {
      return {
        entries: live.data.entries,
        origin: 'live',
        stale: live.stale,
        fetchedAt: live.fetchedAt,
      };
    }
    const bundled = loadBundledPlanning();
    return {
      entries: bundled.entries,
      origin: 'bundled',
      stale: true,
      fetchedAt: bundled.fetchedAt,
    };
  }, [query.data]);

  return {
    ...result,
    isLoading: query.isLoading && !query.data,
    isRefetching: query.isRefetching,
    refetch: () => void query.refetch(),
  };
}

/** Courbe de collecte 2026 collectée côté serveur (pour les stats et la superposition 2025/2026). */
export function useTimeseries2026(resolution: TimeseriesResolution = '10m') {
  return useQuery({
    queryKey: [...queryKeys.timeseries, 2026, resolution] as const,
    queryFn: () => getTimeseries(2026, resolution),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export interface StreamerGoalsResult {
  goals: Goal[];
  /** `live` = snapshot backend, `bundled` = copie de secours embarquée. */
  origin: 'live' | 'bundled';
  stale: boolean;
  fetchedAt: string | null;
}

/**
 * Paliers d'un streamer : snapshot backend en priorité, repli sur la copie embarquée
 * si le backend est indisponible ou ne connaît pas encore ce streamer.
 */
export function useStreamerGoals(twitch: string | undefined): StreamerGoalsResult {
  const goalsQuery = useGoals();

  return useMemo(() => {
    const login = (twitch ?? '').toLowerCase();
    const byLogin = <T extends { twitch: string }>(list: T[]): T | undefined =>
      list.find((entry) => entry.twitch.toLowerCase() === login);

    const live = goalsQuery.data;
    if (live) {
      const match = byLogin(live.data.streamers);
      if (match) {
        return {
          goals: sortGoals(match.goals),
          origin: 'live',
          stale: live.stale,
          fetchedAt: live.fetchedAt,
        };
      }
    }

    const bundled = byLogin(loadBundledGoals().streamers);
    return {
      goals: bundled ? sortGoals(bundled.goals) : [],
      origin: 'bundled',
      stale: true,
      fetchedAt: null,
    };
  }, [twitch, goalsQuery.data]);
}

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => a.amountCents - b.amountCents);
}

/** Feed des derniers dons observés (rafraîchi au rythme du direct). */
export function useRecentDonations(params: RecentDonationsParams = {}) {
  const twitch = params.twitch ? [...params.twitch].sort().join(',') : '';
  return useQuery({
    queryKey: [...queryKeys.donations, 'recent', params.limit ?? 50, twitch, params.minCents ?? 0, params.withComment ?? false] as const,
    queryFn: () => getRecentDonations(params),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Taille d'une page du feed paginé. Assez pour remplir deux écrans, assez peu pour arriver vite. */
export const DONATION_PAGE_SIZE = 40;

/**
 * Feed paginé des dons, curseur côté serveur : chaque page repart du dernier don rendu,
 * jamais d'un décalage — la tête du feed s'enrichissant en continu, un `OFFSET` finirait
 * par resservir des dons déjà lus.
 *
 * Le rafraîchissement automatique ne vaut que pour la tête : dès qu'une page suivante est
 * chargée, on ne lit plus le direct mais le passé, et React Query rejouerait toutes les
 * pages à chaque relève. Le geste de rafraîchir (voir `resetDonationFeed`) ramène à la tête.
 */
export function donationFeedKey(params: RecentDonationsParams = {}) {
  return [
    ...queryKeys.donations,
    'feed',
    params.limit ?? DONATION_PAGE_SIZE,
    params.twitch ? [...params.twitch].sort().join(',') : '',
    params.minCents ?? 0,
    params.withComment ?? false,
  ] as const;
}

export function useDonationFeed(params: RecentDonationsParams = {}) {
  const limit = params.limit ?? DONATION_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: donationFeedKey(params),
    queryFn: ({ pageParam }) => getRecentDonations({ ...params, limit, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (query) =>
      (query.state.data?.pages.length ?? 1) > 1 ? false : LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useTopDonors(window: DonationWindow, limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.donations, 'top', window, limit] as const,
    queryFn: () => getTopDonors(window, limit),
    refetchInterval: DONATIONS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** `twitch` restreint le classement à quelques streamers (filtre « mes favoris »). */
export function useLargestDonations(window: DonationWindow, limit = 10, twitch?: readonly string[]) {
  const logins = normalizeLogins(twitch);
  return useQuery({
    queryKey: [...queryKeys.donations, 'largest', window, limit, logins.join(',')] as const,
    queryFn: () => getLargestDonations(window, limit, logins.length ? logins : undefined),
    refetchInterval: DONATIONS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useDonationStats(window: DonationWindow, twitch?: readonly string[]) {
  const logins = normalizeLogins(twitch);
  return useQuery({
    queryKey: [...queryKeys.donations, 'stats', window, logins.join(',')] as const,
    queryFn: () => getDonationStats(window, logins.length ? logins : undefined),
    refetchInterval: DONATIONS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Même liste de logins dans un autre ordre : même requête, donc même clé de cache. */
function normalizeLogins(logins: readonly string[] | undefined): string[] {
  return [...new Set((logins ?? []).map((login) => login.toLowerCase()))].sort();
}

/** Dons reçus par un streamer (stats, plus gros dons, derniers messages). */
export function useStreamerDonations(twitch: string | undefined) {
  const login = (twitch ?? '').toLowerCase();
  return useQuery({
    queryKey: [...queryKeys.streamers, login, 'donations'] as const,
    queryFn: () => getStreamerDonations(login),
    enabled: login.length > 0,
    refetchInterval: DONATIONS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Streamers ayant le plus progressé sur les dernières minutes. */
export function useMomentum(windowMinutes: number, limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.streamers, 'momentum', windowMinutes, limit] as const,
    queryFn: () => getMomentum(windowMinutes, limit),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Rythme de collecte (euros levés par tranche), calculé depuis les échantillons du backend. */
export function useCollectionRate(bucketMinutes: number) {
  return useQuery({
    queryKey: [...queryKeys.timeseries, 'rate', bucketMinutes] as const,
    queryFn: () => getCollectionRate(bucketMinutes),
    refetchInterval: SERIES_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Courbes de cagnotte de quelques streamers (fiche, comparaison de favoris). */
export function useStreamerSeries(logins: string[], resolution: '1m' | '5m' | '10m' = '10m') {
  const normalized = [...new Set(logins.map((l) => l.toLowerCase()))].sort();
  return useQuery({
    queryKey: [...queryKeys.timeseries, 'streamers', resolution, normalized.join(',')] as const,
    queryFn: () => getStreamerSeries(normalized, resolution),
    enabled: normalized.length > 0,
    refetchInterval: SERIES_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}
