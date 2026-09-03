import type { Goal, GoalsPayload, GoalsSnapshotStreamer } from './types';

/**
 * Snapshot embarqué des donation goals 2026 (src/content/goals-2026.json), utilisé
 * uniquement quand le backend est injoignable. Chargé paresseusement pour ne pas
 * peser sur le démarrage quand la synchro en direct fonctionne.
 */
let cached: GoalsPayload | null = null;

interface RawSnapshot {
  provenance?: { eventId?: string };
  streamers?: (GoalsSnapshotStreamer & { goals?: Goal[] })[];
}

export function loadBundledGoals(): GoalsPayload {
  if (cached) return cached;
  const raw = require('@/content/goals-2026.json') as RawSnapshot;
  cached = {
    eventId: raw.provenance?.eventId ?? '',
    streamers: (raw.streamers ?? []).map((entry) => ({
      twitch: entry.twitch,
      displayName: entry.displayName,
      participationId: entry.participationId,
      goals: entry.goals ?? [],
    })),
  };
  return cached;
}
