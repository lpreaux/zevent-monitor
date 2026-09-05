import { Text, View } from 'react-native';

export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  /** Ligne de détail affichée dans la légende. */
  hint?: string;
}

interface StackedBarProps {
  segments: StackedSegment[];
  colors?: readonly string[];
  emptyMessage?: string;
  /** Part en deçà de laquelle un segment n'est plus étiqueté dans la légende. */
  minLegendRatio?: number;
}

/**
 * Rampe des tranches de montant, du plus petit don au plus gros. Violet pour l'ordinaire,
 * ambre pour le haut de l'échelle : c'est déjà la couleur du « gros don » partout ailleurs
 * dans l'app, et une répartition se lit mieux quand elle nomme les mêmes choses que le reste.
 */
const RAMP = ['#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#fbbf24', '#f59e0b'] as const;

/**
 * Répartition d'un total en une seule barre de 100 %.
 *
 * Sept barres côte à côte demandent sept lectures et une comparaison mentale ; une barre
 * unique montre d'un coup qui pèse quoi. La légende reprend les parts en toutes lettres :
 * un segment fin ne se mesure pas à l'œil, il se lit.
 */
export function StackedBar({
  segments,
  colors = RAMP,
  emptyMessage = 'Pas encore de données',
  minLegendRatio = 0,
}: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  if (total <= 0) {
    return <Text className="py-3 text-center text-xs text-gray-500">{emptyMessage}</Text>;
  }

  const shown = segments
    .map((segment, index) => ({
      ...segment,
      ratio: Math.max(0, segment.value) / total,
      color: colors[index % colors.length] ?? '#8b5cf6',
    }))
    .filter((segment) => segment.ratio > 0);

  return (
    <View className="gap-3">
      <View className="h-3.5 flex-row overflow-hidden rounded-full bg-white/5">
        {shown.map((segment) => (
          <View
            key={segment.key}
            style={{ flexGrow: segment.ratio, backgroundColor: segment.color }}
          />
        ))}
      </View>

      <View className="gap-1.5">
        {shown
          .filter((segment) => segment.ratio >= minLegendRatio)
          .map((segment) => (
            <View key={segment.key} className="flex-row items-center gap-2">
              <View
                style={{ backgroundColor: segment.color }}
                className="h-2 w-2 rounded-full"
              />
              <Text className="shrink text-[13px] text-gray-300" numberOfLines={1}>
                {segment.label}
              </Text>
              <View className="flex-1" />
              {segment.hint ? (
                <Text className="text-[11px] text-gray-600">{segment.hint}</Text>
              ) : null}
              <Text className="w-12 text-right text-[13px] font-semibold text-white">
                {segment.ratio >= 0.01
                  ? `${Math.round(segment.ratio * 100)} %`
                  : `${(Math.round(segment.ratio * 1000) / 10).toString().replace('.', ',')} %`}
              </Text>
            </View>
          ))}
      </View>
    </View>
  );
}
