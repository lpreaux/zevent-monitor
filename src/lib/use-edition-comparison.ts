import { useMemo } from 'react';

import { useTimeseries2026, useZeventState } from '@/api/queries';
import type { TimeseriesResolution } from '@/api/types';
import { loadHistory2025, type History2025 } from '@/lib/history-2025';
import { buildEditionComparison, type EditionComparison } from '@/lib/stats-edition';
import type { RawPoint } from '@/lib/timeseries';

export interface EditionComparisonResult {
  comparison: EditionComparison;
  history: History2025;
  /** Viewers relevés en même temps que la courbe, dans le même ordre. */
  viewers2026: { t: number; viewers: number }[];
  /** Aucune des deux sources n'a répondu : il n'y a que 2025 à montrer. */
  noBackend: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => void;
}

/**
 * Le modèle de comparaison des éditions, branché sur les requêtes partagées.
 *
 * Chaque section de l'écran des statistiques l'appelle pour son compte : React Query
 * rend la même réponse à toutes — une seule requête réseau — et les sections restent
 * autonomes, chacune capable d'arriver quand elle est prête sans retenir les autres.
 */
export function useEditionComparison(
  resolution: TimeseriesResolution = '10m',
): EditionComparisonResult {
  const state = useZeventState();
  const series = useTimeseries2026(resolution);
  const history = useMemo(() => loadHistory2025(), []);

  const points = series.data?.points;
  const liveEur = state.data?.data.donationAmount.number ?? null;

  const raw2026 = useMemo<RawPoint[]>(
    () =>
      (points ?? []).map((point) => ({
        t: Date.parse(point.bucket),
        eur: Number(point.donation_cents) / 100,
      })),
    [points],
  );

  const viewers2026 = useMemo(
    () =>
      (points ?? []).map((point) => ({
        t: Date.parse(point.bucket),
        viewers: Number(point.viewers),
      })),
    [points],
  );

  const comparison = useMemo(
    () => buildEditionComparison(raw2026, history, liveEur),
    [raw2026, history, liveEur],
  );

  return {
    comparison,
    history,
    viewers2026,
    noBackend: !state.data && !series.data && (state.isError || series.isError),
    isLoading: !series.data && series.isLoading,
    isRefetching: state.isRefetching || series.isRefetching,
    refetch: () => {
      void state.refetch();
      void series.refetch();
    },
  };
}
