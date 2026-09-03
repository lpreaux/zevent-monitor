import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { GOALS_REFETCH_INTERVAL_MS, LIVE_REFETCH_INTERVAL_MS } from '@/lib/config';
import { loadBundledGoals } from './goals-fallback';
import { getGoals, getState } from './zevent';
import type { Goal, Streamer } from './types';

export const queryKeys = {
  state: ['zevent', 'state'] as const,
  goals: ['zevent', 'goals'] as const,
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
