/**
 * Configuration runtime de l'application mobile.
 *
 * `EXPO_PUBLIC_API_BASE_URL` est lue au bundling par Expo (préfixe `EXPO_PUBLIC_`).
 * À défaut, on pointe sur le backend de production déployé via Dockploy.
 */
const DEFAULT_API_BASE_URL = 'https://zevent-api.lofgplv.fr';

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  const base = trimmed.length > 0 ? trimmed : DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

/** Intervalle de rafraîchissement aligné sur le `Cache-Control: max-age=15` de la source ZEvent. */
export const LIVE_REFETCH_INTERVAL_MS = 15_000;

/** Les donation goals bougent lentement : la synchro backend tourne toutes les 5 min. */
export const GOALS_REFETCH_INTERVAL_MS = 120_000;
