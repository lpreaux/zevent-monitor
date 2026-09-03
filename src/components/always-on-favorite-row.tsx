import { Image, Text, View } from 'react-native';

import type { Streamer } from '@/api/types';
import { formatCount, formatEuros } from '@/lib/format';

interface AlwaysOnFavoriteRowProps {
  streamer: Streamer;
  /** Tailles issues de `computeAlwaysOnLayout` pour rester lisible à distance. */
  valueFontSize: number;
  captionFontSize: number;
}

/**
 * Ligne de favori pour l'écran secondaire : lisible à distance, sans interaction
 * ni bordure claire (fond AMOLED noir, cf. PLAN.md §4 P1).
 */
export function AlwaysOnFavoriteRow({
  streamer,
  valueFontSize,
  captionFontSize,
}: AlwaysOnFavoriteRowProps) {
  const avatar = Math.round(valueFontSize * 1.15);

  return (
    <View className="flex-row items-center gap-3 py-1.5">
      <Image
        source={{ uri: streamer.profileUrl }}
        style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }}
        className="bg-gray-900"
      />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          {streamer.online ? (
            <View
              style={{ width: captionFontSize * 0.5, height: captionFontSize * 0.5 }}
              className="rounded-full bg-red-500"
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={{ fontSize: captionFontSize * 1.15 }}
            className="flex-1 font-semibold text-gray-200"
          >
            {streamer.display}
          </Text>
        </View>
        {streamer.online ? (
          <Text
            numberOfLines={1}
            style={{ fontSize: captionFontSize }}
            className="text-gray-500"
          >
            {formatCount(streamer.viewersAmount.number)} viewers
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: valueFontSize }} className="font-bold text-zevent-300">
        {formatEuros(streamer.donationAmount.number)}
      </Text>
    </View>
  );
}
