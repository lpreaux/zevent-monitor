import { fetchJson } from './client';
import type { GoalsResponse, StateResponse } from './types';

/** État courant normalisé du ZEvent 2026 (cagnotte, viewers, live, websiteMode). */
export function getState(): Promise<StateResponse> {
  return fetchJson<StateResponse>('/v1/state');
}

/** Dernier snapshot de donation goals mis en cache côté backend (source InGDoc/EvenMoreStats). */
export function getGoals(): Promise<GoalsResponse> {
  return fetchJson<GoalsResponse>('/v1/goals');
}
