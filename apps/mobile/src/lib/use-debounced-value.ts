import { useEffect, useState } from 'react';

/**
 * Valeur retardée. La liste complète des streamers se retrie à chaque caractère tapé :
 * sans ce délai, la frappe attend le tri au lieu de l'inverse.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
