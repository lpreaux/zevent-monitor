import { AppState, type AppStateStatus, Platform } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

/**
 * Relaie l'état d'avant-plan de l'app à TanStack Query : combiné à
 * `refetchIntervalInBackground: false`, le polling se met en pause quand l'app
 * passe en arrière-plan et reprend au retour.
 */
export function setupAppStateFocus(): () => void {
  const onChange = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  };
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 10_000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: true,
      },
    },
  });
}
