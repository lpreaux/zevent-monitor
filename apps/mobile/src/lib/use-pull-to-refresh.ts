import { useCallback, useState } from 'react';

/**
 * Rafraîchissement manuel d'une liste.
 *
 * Le drapeau de refetch de React Query se lève aussi pour les relevés automatiques —
 * ici toutes les quinze secondes. Le brancher tel quel sur un `RefreshControl` fait
 * clignoter la roue en permanence, sans que personne n'ait rien demandé. Seul un geste
 * de traction doit l'allumer, et il ne s'éteint qu'une fois la requête revenue.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  return { refreshing, onRefresh };
}
