import { Text, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';

interface SourceFreshnessProps {
  fetchedAt: string | null | undefined;
  stale: boolean;
  /** Nom court de la source pour le message dégradé. */
  label?: string;
  /**
   * Version resserrée, pour un en-tête replié : seuls la pastille et l'âge subsistent.
   * « Données à jour » est de toute façon redondant avec le point vert — c'est la phrase
   * dont on peut se passer en premier quand la place manque.
   */
  compact?: boolean;
}

/** Ligne de fraîcheur des données + avertissement quand la source est en repli. */
export function SourceFreshness({
  fetchedAt,
  stale,
  label = 'ZEvent',
  compact = false,
}: SourceFreshnessProps) {
  const relative = formatRelativeTime(fetchedAt);

  return (
    <View className="flex-row items-center gap-2">
      <View
        className={`rounded-full ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${
          stale ? 'bg-amber-400' : 'bg-emerald-400'
        }`}
      />
      <Text className={compact ? 'text-[10px] text-gray-500' : 'text-xs text-gray-400'}>
        {compact
          ? stale
            ? `dernier état ${relative}`
            : relative
          : stale
            ? `Source ${label} indisponible — dernier état connu ${relative}`
            : `Données à jour • ${relative}`}
      </Text>
    </View>
  );
}
