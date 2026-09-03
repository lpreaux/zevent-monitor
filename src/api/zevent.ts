import { fetchJson } from './client';
import type {
  GoalsResponse,
  PlanningResponse,
  StateResponse,
  TimeseriesResolution,
  TimeseriesResponse,
} from './types';

/** État courant normalisé du ZEvent 2026 (cagnotte, viewers, live, websiteMode). */
export function getState(): Promise<StateResponse> {
  return fetchJson<StateResponse>('/v1/state');
}

/** Dernier snapshot de donation goals mis en cache côté backend (source InGDoc/EvenMoreStats). */
export function getGoals(): Promise<GoalsResponse> {
  return fetchJson<GoalsResponse>('/v1/goals');
}

/** Dernier snapshot du planning (shows InGDoc/EvenMoreStats + `calendar` officiel fusionnés). */
export function getPlanning(): Promise<PlanningResponse> {
  return fetchJson<PlanningResponse>('/v1/planning');
}

/** Courbe agrégée de la collecte, alimentée par le collecteur central (édition 2026 par défaut). */
export function getTimeseries(
  edition = 2026,
  resolution: TimeseriesResolution = '10m',
): Promise<TimeseriesResponse> {
  return fetchJson<TimeseriesResponse>(
    `/v1/timeseries?edition=${edition}&resolution=${resolution}`,
  );
}
