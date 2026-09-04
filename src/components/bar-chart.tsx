import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { niceCeil } from '@/lib/donations';

export interface Bar {
  key: string;
  /** Libellé sous la barre (affiché une fois sur `labelEvery`). */
  label: string;
  value: number;
  /** Ligne secondaire affichée dans l'infobulle. */
  hint?: string;
}

interface BarChartProps {
  bars: Bar[];
  height?: number;
  color?: string;
  /** Couleur de la barre la plus haute. */
  peakColor?: string;
  formatValue: (value: number) => string;
  /** N'afficher qu'un libellé sur N pour éviter le chevauchement. */
  labelEvery?: number;
  /** Nombre de lignes de repère horizontales. */
  gridLines?: number;
}

/**
 * Histogramme en `View` pures (pas de lib native, cf. `OverlayChart`). Un tap sur une barre
 * affiche sa valeur ; la barre la plus haute est mise en avant.
 */
export function BarChart({
  bars,
  height = 160,
  color = '#8b5cf6',
  peakColor = '#f59e0b',
  formatValue,
  labelEvery = 1,
  gridLines = 3,
}: BarChartProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const model = useMemo(() => {
    const max = bars.reduce((acc, bar) => Math.max(acc, bar.value), 0);
    const yMax = niceCeil(max);
    const peakKey = max > 0 ? bars.find((bar) => bar.value === max)?.key ?? null : null;
    return { yMax, peakKey, max };
  }, [bars]);

  const selectedBar = bars.find((bar) => bar.key === selected) ?? null;
  const gridValues = Array.from({ length: gridLines }, (_, i) => (model.yMax * (i + 1)) / gridLines);

  if (bars.length === 0) {
    return (
      <View style={{ height }} className="items-center justify-center rounded-xl bg-gray-900/40">
        <Text className="text-xs text-gray-500">Pas encore de données</Text>
      </View>
    );
  }

  return (
    <View>
      <View className="h-5 flex-row items-center justify-between">
        <Text className="text-xs text-gray-400" numberOfLines={1}>
          {selectedBar
            ? `${selectedBar.label} : ${formatValue(selectedBar.value)}${selectedBar.hint ? ` · ${selectedBar.hint}` : ''}`
            : model.peakKey
              ? `Pic : ${formatValue(model.max)}`
              : ''}
        </Text>
        <Text className="text-[10px] text-gray-600">max {formatValue(model.yMax)}</Text>
      </View>

      <View style={{ height }} className="overflow-hidden rounded-xl bg-gray-900/40">
        {gridValues.map((value) => (
          <View
            key={value}
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: (value / model.yMax) * height }}
            className="h-px bg-gray-800"
          />
        ))}
        <View className="absolute inset-0 flex-row items-end px-1">
          {bars.map((bar) => {
            const ratio = model.yMax > 0 ? Math.max(0, Math.min(1, bar.value / model.yMax)) : 0;
            const isPeak = bar.key === model.peakKey;
            const isSelected = bar.key === selected;
            return (
              <Pressable
                key={bar.key}
                onPress={() => setSelected((current) => (current === bar.key ? null : bar.key))}
                accessibilityRole="button"
                accessibilityLabel={`${bar.label} : ${formatValue(bar.value)}`}
                className="h-full flex-1 justify-end px-px"
              >
                <View
                  style={{
                    height: Math.max(ratio * height, bar.value > 0 ? 2 : 0),
                    backgroundColor: isPeak ? peakColor : color,
                    opacity: selected && !isSelected ? 0.45 : 1,
                  }}
                  className="rounded-t-sm"
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mt-1 flex-row px-1">
        {bars.map((bar, index) => (
          <View key={bar.key} className="flex-1 items-center">
            {index % labelEvery === 0 ? (
              <Text className="text-[9px] text-gray-500" numberOfLines={1}>
                {bar.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
