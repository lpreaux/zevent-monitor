import { Text, View } from 'react-native';

import { formatEuros, formatEurosCompact } from '@/lib/format';
import { formatEta, milestoneEtaMinutes, nextMilestone } from '@/lib/milestones';

interface AlwaysOnMilestoneProps {
  /** Cagnotte globale courante, en euros. */
  amountEuros: number;
  /** Rythme observé sur la dernière heure, `null` si la courbe manque. */
  eurPerHour: number | null;
  captionFontSize: number;
  valueFontSize: number;
}

/**
 * Progression vers le prochain palier rond, avec estimation d'arrivée au rythme de la
 * dernière heure. L'estimation est explicitement annoncée comme telle (docs/plans/2026-mobile-app.md §4 P1).
 */
export function AlwaysOnMilestone({
  amountEuros,
  eurPerHour,
  captionFontSize,
  valueFontSize,
}: AlwaysOnMilestoneProps) {
  const milestone = nextMilestone(amountEuros);
  if (!milestone) return null;

  const eta = formatEta(milestoneEtaMinutes(milestone.remaining, eurPerHour));

  return (
    <View>
      <View className="flex-row items-baseline justify-between gap-3">
        <Text
          style={{ fontSize: captionFontSize }}
          className="uppercase tracking-widest text-gray-600"
        >
          Prochain palier
        </Text>
        <Text style={{ fontSize: captionFontSize }} className="text-gray-500">
          {eta ? `${eta} — estimation` : 'rythme inconnu'}
        </Text>
      </View>

      <View
        style={{ height: Math.max(4, Math.round(captionFontSize * 0.4)) }}
        className="mt-1.5 overflow-hidden rounded-full bg-gray-900"
      >
        <View
          style={{ width: `${Math.round(milestone.ratio * 100)}%` }}
          className="h-full rounded-full bg-zevent-500"
        />
      </View>

      <Text style={{ fontSize: valueFontSize * 0.62 }} className="mt-1 font-semibold text-gray-400">
        {formatEurosCompact(milestone.target)}
        <Text className="font-normal text-gray-600">{` — reste ${formatEuros(milestone.remaining)}`}</Text>
      </Text>
    </View>
  );
}
