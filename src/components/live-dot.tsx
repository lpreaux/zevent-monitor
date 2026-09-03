import { Text, View } from 'react-native';

/** Pastille « LIVE » / « Hors ligne » pour les cartes et lignes de streamers. */
export function LiveDot({ online }: { online: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-2 w-2 rounded-full ${online ? 'bg-red-500' : 'bg-gray-600'}`} />
      <Text
        className={`text-xs font-semibold uppercase tracking-wider ${
          online ? 'text-red-400' : 'text-gray-500'
        }`}
      >
        {online ? 'Live' : 'Hors ligne'}
      </Text>
    </View>
  );
}
