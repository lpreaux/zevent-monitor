import AsyncStorage from '@react-native-async-storage/async-storage';

import { requestJson } from './client';
import { authHeaders, type DeviceIdentity } from './device';

export interface RecapProgression {
  twitch: string;
  display: string;
  raisedCents: number;
}

/**
 * Contenu produit par le serveur, identique pour tout le monde sur une période donnée.
 * Les champs optionnels sont absents des récaps générés avant la version 2 : l'app en
 * conserve en cache local, il faut donc rester tolérant.
 */
export interface RecapContent {
  version?: number;
  summary: {
    startCents: number | null;
    endCents: number | null;
    raisedCents: number;
    peakViewers: number;
    coverage?: { start: string | null; end: string | null; complete: boolean };
  };
  counts: { milestones: number; bigDonations: number; liveStarts: number; goalsReached: number };
  milestones: { thresholdCents: number; occurredAt: string }[];
  bigDonations: { donor: string; amountCents: number; twitch: string | null; occurredAt: string }[];
  liveStarts: { twitch: string; display: string; occurredAt: string }[];
  goalsReached: { twitch: string; display: string; label: string; occurredAt: string }[];
  topProgressions: RecapProgression[];
  /** Toutes les progressions non nulles, pour l'affichage personnalisé par favoris. */
  progressions?: RecapProgression[];
  highlights: string[];
}

export interface Recap {
  /** Les `bigint` PostgreSQL sont sérialisés en chaînes. */
  id: string;
  kind: 'scheduled' | 'manual';
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  content: RecapContent;
}

const cacheKey = (identity: DeviceIdentity) => `recaps:${identity.installationId}`;

async function cacheRecaps(identity: DeviceIdentity, recaps: Recap[]): Promise<void> {
  await AsyncStorage.setItem(cacheKey(identity), JSON.stringify(recaps.slice(0, 100)));
}

async function readCache(identity: DeviceIdentity): Promise<Recap[]> {
  try { return JSON.parse((await AsyncStorage.getItem(cacheKey(identity))) ?? '[]') as Recap[]; }
  catch { return []; }
}

export async function getRecaps(identity: DeviceIdentity): Promise<{ recaps: Recap[]; cached: boolean }> {
  try {
    const response = await requestJson<{ recaps: Recap[] }>('/v1/recaps', { headers: authHeaders(identity) });
    await cacheRecaps(identity, response.recaps);
    return { recaps: response.recaps, cached: false };
  } catch (error) {
    const recaps = await readCache(identity);
    if (recaps.length) return { recaps, cached: true };
    throw error;
  }
}

export async function getRecap(identity: DeviceIdentity, id: string): Promise<Recap> {
  try {
    const recap = await requestJson<Recap>(`/v1/recaps/${id}`, { headers: authHeaders(identity) });
    const cached = await readCache(identity);
    await cacheRecaps(identity, [recap, ...cached.filter((item) => item.id !== recap.id)]);
    return recap;
  } catch (error) {
    const recap = (await readCache(identity)).find((item) => item.id === id);
    if (recap) return recap;
    throw error;
  }
}

export function generateRecap(identity: DeviceIdentity, durationMinutes: number, idempotencyKey: string): Promise<Recap> {
  return requestJson<Recap>('/v1/recaps/generate', {
    method: 'POST', headers: authHeaders(identity), body: { durationMinutes, idempotencyKey }, timeoutMs: 30_000,
  });
}

export function getRecapSchedules(identity: DeviceIdentity): Promise<{ times: string[] }> {
  return requestJson('/v1/recap-schedules', { headers: authHeaders(identity) });
}

export function putRecapSchedules(identity: DeviceIdentity, times: string[]): Promise<{ times: string[] }> {
  return requestJson('/v1/recap-schedules', { method: 'PUT', headers: authHeaders(identity), body: { times } });
}
