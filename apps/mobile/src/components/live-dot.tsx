import { Text, View } from 'react-native';

interface LiveDotProps {
  online: boolean;
  /** Version discrète, pour les lignes secondaires (favoris hors ligne). */
  compact?: boolean;
}

/** Pastille « LIVE » / « Hors ligne » pour les cartes et lignes de streamers. */
export function LiveDot({ online, compact = false }: LiveDotProps) {
  return (
    <View className={`flex-row items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <View
        className={`rounded-full ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${
          online ? 'bg-red-500' : 'bg-gray-600'
        }`}
      />
      <Text
        className={`font-semibold uppercase tracking-wider ${compact ? 'text-[10px]' : 'text-xs'} ${
          online ? 'text-red-400' : 'text-gray-500'
        }`}
      >
        {online ? 'Live' : 'Hors ligne'}
      </Text>
    </View>
  );
}
