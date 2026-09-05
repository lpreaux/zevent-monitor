import { useEffect, useState } from 'react';

/**
 * Horloge partagée qui avance par pas fixe : sert aux libellés relatifs (« il y a 2 min »)
 * pour qu'ils vieillissent sans attendre un refetch ni re-rendre à chaque seconde.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
