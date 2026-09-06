import { Text, View } from 'react-native';

import type { Goal } from '@/api/types';
import { formatEuros } from '@/lib/format';

interface GoalProgressProps {
  goal: Goal;
  /** Cagnotte personnelle officielle du streamer, en euros. */
  raisedEuros: number;
  /** Met en avant le prochain palier à franchir. */
  highlighted?: boolean;
}

/**
 * Barre de progression d'un donation goal. L'état atteint est recalculé localement
 * (cagnotte vs objectif) plutôt que de faire confiance au champ `reached` du snapshot.
 */
export function GoalProgress({ goal, raisedEuros, highlighted }: GoalProgressProps) {
  const targetEuros = goal.amountCents / 100;
  const ratio = targetEuros > 0 ? raisedEuros / targetEuros : 0;
  const reached = ratio >= 1;
  const pct = Math.max(0, Math.min(1, ratio));

  return (
    <View
      className={`rounded-2xl border p-4 ${
        highlighted ? 'border-zevent-500/60 bg-zevent-500/10' : 'border-gray-800 bg-gray-900/50'
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm font-medium text-white">{goal.label}</Text>
        <Text
          className={`text-sm font-semibold ${reached ? 'text-emerald-400' : 'text-gray-300'}`}
        >
          {formatEuros(targetEuros)}
        </Text>
      </View>

      <View className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800">
        <View
          className={`h-full rounded-full ${reached ? 'bg-emerald-500' : 'bg-zevent-500'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </View>

      <View className="mt-1.5 flex-row items-center justify-between gap-3">
        {/* Un pourcentage seul laisse le calcul à faire : c'est le montant qui manque qui
            dit s'il se joue ce soir ou pas du week-end. */}
        <Text className="shrink text-xs text-gray-500">
          {reached
            ? 'Palier atteint'
            : `${Math.round(pct * 100)} % · il manque ${formatEuros(targetEuros - raisedEuros)}`}
        </Text>
        {goal.category ? (
          <Text className="text-xs uppercase tracking-wider text-gray-600">{goal.category}</Text>
        ) : null}
      </View>
    </View>
  );
}
