import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { formatEuros } from '@/lib/format';
import { formatComparisonRatio, FLAT_RATIO, type RecapComparison } from '@/lib/recap-comparison';
import { colors } from '@/theme';

/** Une référence et l'écart qui l'en sépare. */
function Line({ label, raisedCents, ratio }: { label: string; raisedCents: number; ratio: number }) {
  const flat = Math.abs(ratio) < FLAT_RATIO;
  const up = ratio > 0;
  const tone = flat ? '#9ca3af' : up ? '#6ee7b7' : '#fca5a5';

  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm text-gray-200">
          {label}
        </Text>
        <Text className="text-[11px] text-gray-400">{formatEuros(raisedCents / 100)}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {flat ? null : (
          <Ionicons name={up ? 'trending-up' : 'trending-down'} size={14} color={tone} />
        )}
        <Text style={{ color: tone }} className="text-sm font-bold">
          {formatComparisonRatio(ratio)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Ce à quoi se rapporte le cumul de la période.
 *
 * L'écart est dit en pourcentage plutôt qu'en euros : ce qu'on veut savoir est si la
 * collecte tient le rythme, pas de combien d'euros deux journées diffèrent. La référence
 * reste écrite en dessous, pour qui veut le chiffre.
 */
export function RecapComparisonPanel({ comparison }: { comparison: RecapComparison }) {
  const { previous, edition2025 } = comparison;
  if (!previous && !edition2025) return null;

  return (
    <View className="gap-3 rounded-2xl border border-white/10 bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="git-compare-outline" size={15} color={colors.brandSoft} />
        <Text className="text-base font-bold text-white">Par rapport à</Text>
      </View>

      {previous ? (
        <Line label={previous.title} raisedCents={previous.raisedCents} ratio={previous.ratio} />
      ) : null}
      {edition2025 ? (
        <Line
          label="La même tranche en 2025"
          raisedCents={edition2025.raisedCents}
          ratio={edition2025.ratio}
        />
      ) : null}

      {edition2025 ? (
        <Text className="text-[11px] leading-4 text-gray-500">
          2025 est alignée sur le temps écoulé depuis l’ouverture, pas sur la date : les deux
          éditions n’ont pas commencé le même jour ni à la même heure.
        </Text>
      ) : null}
    </View>
  );
}
