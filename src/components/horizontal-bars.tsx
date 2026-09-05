import { Text, View } from 'react-native';

export interface HorizontalBar {
  key: string;
  label: string;
  value: number;
  /** Texte affiché à droite (montant, pourcentage…). */
  valueLabel: string;
  /** Petite ligne sous le libellé. */
  hint?: string;
  color?: string;
}

interface HorizontalBarsProps {
  bars: HorizontalBar[];
  color?: string;
  emptyMessage?: string;
}

/** Barres horizontales proportionnelles au maximum : distribution, pays, tops. */
export function HorizontalBars({
  bars,
  color = '#8b5cf6',
  emptyMessage = 'Pas encore de données',
}: HorizontalBarsProps) {
  const max = bars.reduce((acc, bar) => Math.max(acc, bar.value), 0);

  if (bars.length === 0 || max <= 0) {
    return <Text className="py-3 text-center text-xs text-gray-500">{emptyMessage}</Text>;
  }

  return (
    <View className="gap-2.5">
      {bars.map((bar) => {
        const ratio = Math.max(0, Math.min(1, bar.value / max));
        return (
          <View key={bar.key} className="gap-1">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="flex-1 text-sm text-gray-200" numberOfLines={1}>
                {bar.label}
              </Text>
              <Text className="text-sm font-semibold text-white">{bar.valueLabel}</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-gray-800">
              <View
                style={{ width: `${ratio * 100}%`, backgroundColor: bar.color ?? color }}
                className="h-full rounded-full"
              />
            </View>
            {bar.hint ? <Text className="text-[10px] text-gray-500">{bar.hint}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
