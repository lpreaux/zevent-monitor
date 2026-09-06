import { useMemo } from 'react';
import { View } from 'react-native';

import { colors } from '@/theme';

interface RecapSparklineProps {
  /** Cagnotte au fil de la période, dans l'ordre. */
  points: readonly number[];
  height?: number;
  /** Barres dessinées au plus : au-delà, elles ne feraient plus qu'un aplat. */
  bars?: number;
}

/**
 * Vignette du rythme d'une période, en `View` pures comme le reste des graphes de l'app.
 *
 * Elle montre les écarts, pas les cumuls. Une cagnotte ne redescend jamais : tracée telle
 * quelle, sa courbe monte de gauche à droite quoi qu'il se soit passé, et deux journées
 * très différentes donnent la même image. Les écarts, eux, disent où la période a donné —
 * la soirée, le pic de minuit, le creux du petit matin — ce qu'on vient précisément
 * chercher sur une carte de récap.
 */
export function RecapSparkline({ points, height = 34, bars = 24 }: RecapSparklineProps) {
  const deltas = useMemo(() => {
    if (points.length < 2) return [];
    const raw = points.slice(1).map((value, index) => Math.max(0, value - points[index]!));
    if (raw.length <= bars) return raw;
    // Regroupe les tranches par paquets égaux : le rythme se somme, il ne s'échantillonne pas.
    const size = Math.ceil(raw.length / bars);
    return Array.from({ length: Math.ceil(raw.length / size) }, (_, index) =>
      raw.slice(index * size, (index + 1) * size).reduce((total, value) => total + value, 0),
    );
  }, [points, bars]);

  const max = deltas.reduce((peak, value) => Math.max(peak, value), 0);

  if (deltas.length === 0 || max === 0) {
    return <View style={{ height }} className="rounded-lg bg-white/5" />;
  }

  return (
    <View style={{ height }} className="flex-row items-end gap-px" accessibilityElementsHidden>
      {deltas.map((value, index) => (
        <View
          key={index}
          style={{
            height: Math.max(2, (value / max) * height),
            backgroundColor: value === max ? colors.brandSoft : colors.brand,
          }}
          className="flex-1 rounded-sm"
        />
      ))}
    </View>
  );
}
