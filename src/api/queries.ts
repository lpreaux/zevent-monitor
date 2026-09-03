import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  GOALS_REFETCH_INTERVAL_MS,
  LIVE_REFETCH_INTERVAL_MS,
  PLANNING_REFETCH_INTERVAL_MS,
} from '@/lib/config';
import { loadBundledGoals } from './goals-fallback';
import { loadBundledPlanning } from './planning-fallback';
import { getGoals, getPlanning, getState, getTimeseries } from './zevent';
import type { Goal, PlanningEntry, Streamer, TimeseriesResolution } from './types';

export const queryKeys = {
  state: ['zevent', 'state'] as const,
  goals: ['zevent', 'goals'] as const,
  planning: ['zevent', 'planning'] as const,
  timeseries: ['zevent', 'timeseries'] as const,
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
 * le backend est injoignable ou n'a encore rien synchronisé (PLAN.md §4 P0 et §7).
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

export type StreamerSort = 'donation' | 'viewers' | 'live';

/** Tri + filtre de la liste des streamers pour l'onglet dédié. */
export function sortStreamers(
  streamers: Streamer[],
  sort: StreamerSort,
  search: string,
): Streamer[] {
  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? streamers.filter(
        (s) =>
          s.display.toLowerCase().includes(needle) ||
          s.twitch.toLowerCase().includes(needle),
      )
    : streamers;

  const sorted = [...filtered];
  switch (sort) {
    case 'viewers':
      sorted.sort((a, b) => b.viewersAmount.number - a.viewersAmount.number);
      break;
    case 'live':
      sorted.sort(
        (a, b) =>
          Number(b.online) - Number(a.online) ||
          b.viewersAmount.number - a.viewersAmount.number,
      );
      break;
    case 'donation':
    default:
      sorted.sort((a, b) => b.donationAmount.number - a.donationAmount.number);
      break;
  }
  return sorted;
}
