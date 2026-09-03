import { Text, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';

interface SourceFreshnessProps {
  fetchedAt: string | null | undefined;
  stale: boolean;
  /** Nom court de la source pour le message dégradé. */
  label?: string;
}

/** Ligne de fraîcheur des données + avertissement quand la source est en repli. */
export function SourceFreshness({ fetchedAt, stale, label = 'ZEvent' }: SourceFreshnessProps) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      <Text className="text-xs text-gray-400">
        {stale
          ? `Source ${label} indisponible — dernier état connu ${formatRelativeTime(fetchedAt)}`
          : `Données à jour • ${formatRelativeTime(fetchedAt)}`}
      </Text>
    </View>
  );
}
