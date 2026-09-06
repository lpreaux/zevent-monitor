import AsyncStorage from '@react-native-async-storage/async-storage';

import { requestJson } from './client';
import { authHeaders, type DeviceIdentity } from './device';

export interface RecapProgression {
  twitch: string;
  display: string;
  raisedCents: number;
}

export interface RecapPoint {
  t: string;
  cents: number;
}

/**
 * Contenu produit par le serveur, identique pour tout le monde sur une période donnée.
 * Les champs optionnels sont absents des récaps générés avant leur version : l'app en
 * conserve en cache local, il faut donc rester tolérant.
 */
export interface RecapContent {
  version?: number;
  summary: {
    startCents: number | null;
    endCents: number | null;
    raisedCents: number;
    peakViewers: number;
    /** v3 : part de la cagnotte de fin apportée par la période. */
    shareOfTotal?: number | null;
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
  /** v3 : courbe de la cagnotte sur la période. */
  series?: { stepMinutes: number; points: RecapPoint[] };
  /** v3 : tranche horaire la plus généreuse, absente sous trois heures de période. */
  bestHour?: { start: string; raisedCents: number } | null;
  /** v3 : dons vus passer dans le feed Streamlabs, un plancher et non le compte réel. */
  observedDonations?: {
    count: number;
    totalCents: number;
    averageCents: number;
    biggestCents: number;
    topDonors: { donor: string; amountCents: number; count: number }[];
  };
  highlights: string[];
}

/**
 * `scheduled` et `manual` appartiennent à un appareil ; `day` est une journée de
 * l'événement, publique et lisible sans enregistrement.
 */
export type RecapKind = 'scheduled' | 'manual' | 'day';

export interface Recap {
  /** Les `bigint` PostgreSQL sont sérialisés en chaînes ; une journée porte sa clé (`day-…`). */
  id: string;
  kind: RecapKind;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  content: RecapContent;
  /** Journées : le nom du chapitre et ses bornes en clair. */
  title?: string;
  subtitle?: string;
  /** Journées : la période court encore, le contenu changera. */
  inProgress?: boolean;
}

/** Ce qu'une carte de journée montre, sans faire descendre tout le contenu. */
export interface RecapDaySummary {
  id: string;
  kind: 'day';
  title: string;
  subtitle: string;
  periodStart: string;
  periodEnd: string;
  inProgress: boolean;
  preview: {
    raisedCents: number;
    endCents: number | null;
    peakViewers: number;
    shareOfTotal: number | null;
    counts: RecapContent['counts'];
    points: number[];
  };
}

/** Les journées sont publiques : leur cache ne dépend d'aucune installation. */
const DAYS_CACHE_KEY = 'recap-days';
const cacheKey = (identity: DeviceIdentity) => `recaps:${identity.installationId}`;

export const isRecapDayId = (id: string): boolean => id.startsWith('day-');

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

export async function getRecapDays(): Promise<{ days: RecapDaySummary[]; cached: boolean }> {
  try {
    const response = await requestJson<{ days: RecapDaySummary[] }>('/v1/recap-days');
    await AsyncStorage.setItem(DAYS_CACHE_KEY, JSON.stringify(response.days));
    return { days: response.days, cached: false };
  } catch (error) {
    try {
      const days = JSON.parse((await AsyncStorage.getItem(DAYS_CACHE_KEY)) ?? '[]') as RecapDaySummary[];
      if (days.length) return { days, cached: true };
    } catch {
      // Cache illisible : on remonte l'erreur réseau, plus parlante pour l'écran.
    }
    throw error;
  }
}

/**
 * Récap par identifiant, journée publique comprise.
 *
 * Une journée se lit sans identité — c'est tout l'intérêt : quelqu'un qui vient d'installer
 * l'application, et dont l'enregistrement d'appareil n'a pas encore abouti, peut déjà lire
 * ce qui s'est passé depuis vendredi.
 */
export async function getRecapById(identity: DeviceIdentity | null, id: string): Promise<Recap> {
  if (isRecapDayId(id)) {
    const day = await requestJson<Recap>(`/v1/recap-days/${id}`);
    return day;
  }
  if (!identity) throw new Error('Récap indisponible sans appareil enregistré');
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

/** Période demandée : une durée qui remonte depuis maintenant, ou des bornes explicites. */
export type RecapRequest =
  | { durationMinutes: number }
  | { from: string; to: string };

export function generateRecap(
  identity: DeviceIdentity,
  request: RecapRequest,
  idempotencyKey: string,
): Promise<Recap> {
  return requestJson<Recap>('/v1/recaps/generate', {
    method: 'POST', headers: authHeaders(identity), body: { ...request, idempotencyKey }, timeoutMs: 30_000,
  });
}

export async function deleteRecap(identity: DeviceIdentity, id: string): Promise<void> {
  await requestJson<void>(`/v1/recaps/${id}`, { method: 'DELETE', headers: authHeaders(identity) });
  const cached = await readCache(identity);
  await cacheRecaps(identity, cached.filter((item) => item.id !== id));
}

export function getRecapSchedules(identity: DeviceIdentity): Promise<{ times: string[] }> {
  return requestJson('/v1/recap-schedules', { headers: authHeaders(identity) });
}

export function putRecapSchedules(identity: DeviceIdentity, times: string[]): Promise<{ times: string[] }> {
  return requestJson('/v1/recap-schedules', { method: 'PUT', headers: authHeaders(identity), body: { times } });
}
