import { useMemo } from 'react';

import { usePlanning } from '@/api/queries';
import type { PlanningEntry } from '@/api/types';
import { liveShowIndex } from './streamer-activity';
import { useNow } from './use-now';

/** Pas de l'horloge : un créneau du planning bascule à la minute, jamais à la seconde. */
const TICK_MS = 60_000;

/**
 * Shows du planning en cours, indexés par login Twitch. Partagé par tous les blocs qui
 * décrivent ce que fait un streamer (favoris, top du moment) : le planning n'est
 * parcouru qu'une fois par minute, quel que soit le nombre de listes à l'écran.
 */
export function useLiveShows(): Map<string, PlanningEntry> {
  const { entries } = usePlanning();
  const now = useNow(TICK_MS);
  return useMemo(() => liveShowIndex(entries, now), [entries, now]);
}
