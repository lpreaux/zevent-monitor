import type { PlanningEntry, PlanningPayload } from './types';

/**
 * Snapshot embarqué du planning 2026 (src/content/planning-2026.json), utilisé uniquement
 * quand le backend est injoignable. Chargé paresseusement, comme les donation goals.
 */
let cached: PlanningPayload | null = null;

interface RawSnapshot {
  provenance?: { eventId?: string; fetchedAt?: string };
  entries?: PlanningEntry[];
}

export function loadBundledPlanning(): PlanningPayload & { fetchedAt: string | null } {
  const raw = require('@/content/planning-2026.json') as RawSnapshot;
  if (!cached) {
    const entries = raw.entries ?? [];
    cached = {
      eventId: raw.provenance?.eventId ?? '',
      entries,
      counts: { ingdoc: entries.length, zevent: 0 },
    };
  }
  return { ...cached, fetchedAt: raw.provenance?.fetchedAt ?? null };
}
