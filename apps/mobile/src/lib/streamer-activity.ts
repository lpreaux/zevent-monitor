/**
 * Ce que fait un streamer à l'instant T, formulé en une ligne.
 *
 * Le champ `game` de l'état officiel est la source la plus fiable, mais le planning
 * communautaire en dit souvent plus (« Blind Test », « Karaoké »…) : quand le streamer
 * est annoncé sur un show en cours, c'est ce titre qui gagne.
 */

import type { PlanningEntry, Streamer } from '@/api/types';
import { entryStatus } from './planning';

export type ActivityKind = 'planning' | 'game' | 'live' | 'offline';

export interface StreamerActivity {
  kind: ActivityKind;
  label: string;
  /** Icône Ionicons associée, pour que la ligne se lise d'un coup d'œil. */
  icon: 'calendar' | 'game-controller' | 'radio' | 'moon';
}

/**
 * Shows en cours indexés par login de participant. Construit une fois pour toute la
 * liste : le planning complet est parcouru une seule fois, quel que soit le nombre de favoris.
 */
export function liveShowIndex(entries: PlanningEntry[], now: number): Map<string, PlanningEntry> {
  const index = new Map<string, PlanningEntry>();
  for (const entry of entries) {
    if (entryStatus(entry, now) !== 'live') continue;
    for (const participant of entry.participants) {
      const login = (participant.twitch ?? '').toLowerCase();
      // Premier show gagnant : deux créneaux qui se chevauchent restent l'exception.
      if (login && !index.has(login)) index.set(login, entry);
    }
  }
  return index;
}

/**
 * Activité affichable d'un streamer, `show` venant de `liveShowIndex`. Ne demande que
 * l'état de direct et le jeu : les entrées du classement de progression, plus maigres
 * qu'un streamer complet, se décrivent avec exactement les mêmes mots.
 */
export function streamerActivity(
  streamer: Pick<Streamer, 'online' | 'game'>,
  show?: PlanningEntry,
): StreamerActivity {
  if (!streamer.online) return { kind: 'offline', label: 'Hors ligne', icon: 'moon' };
  if (show) return { kind: 'planning', label: show.title, icon: 'calendar' };
  const game = streamer.game.trim();
  if (game) return { kind: 'game', label: game, icon: 'game-controller' };
  return { kind: 'live', label: 'En stream', icon: 'radio' };
}
