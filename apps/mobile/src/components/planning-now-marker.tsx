import { forwardRef } from 'react';
import { Text, View } from 'react-native';

import { formatParisTime } from '@/lib/planning';

/**
 * Repère de l'instant présent dans le fil du programme, à la manière d'une ligne d'agenda.
 * Il donne au défilement un point absolu — au-dessus c'est passé, en dessous c'est à venir —
 * que ni les horaires ni l'estompage des émissions terminées ne remplacent vraiment.
 *
 * Il expose sa vue pour que l'écran puisse la mesurer : c'est ainsi qu'on y revient d'un
 * geste, la virtualisation ne sachant pas dire où il se trouve tant qu'on ne l'a pas
 * traversé.
 */
export const PlanningNowMarker = forwardRef<
  View,
  { now: number; onLayout?: () => void }
>(function PlanningNowMarker({ now, onLayout }, ref) {
  return (
    <View ref={ref} onLayout={onLayout} className="flex-row items-center gap-2 py-2.5">
      <Text className="w-11 text-right text-[11px] font-bold text-red-400">
        {formatParisTime(new Date(now).toISOString())}
      </Text>
      <View className="h-2 w-2 rounded-full bg-red-500" />
      <View className="h-px flex-1 bg-red-500/40" />
      <Text className="text-[10px] font-bold uppercase tracking-[1.2px] text-red-400">
        Maintenant
      </Text>
    </View>
  );
});
