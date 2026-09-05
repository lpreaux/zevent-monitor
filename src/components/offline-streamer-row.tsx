import { memo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

import type { Streamer } from '@/api/types';
import { formatEuros } from '@/lib/format';
import { StreamerAvatar } from './streamer-avatar';

interface OfflineStreamerRowProps {
  streamer: Streamer;
  /** Action de fin de ligne, quand l'écran en propose une malgré l'absence de direct. */
  trailing?: ReactNode;
}

/**
 * Streamer hors ligne : une seule ligne, en nuances de gris, sans pastille. Rien n'y
 * bouge tant qu'il n'est pas revenu — autant que ça se voie. C'est ce contraste avec
 * `LiveStreamerRow` qui laisse une liste de plusieurs centaines d'entrées rester lisible.
 */
function OfflineStreamerRowComponent({ streamer, trailing }: OfflineStreamerRowProps) {
  return (
    <View className="flex-row items-center gap-2 py-2">
      <Link href={{ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } }} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Détails de ${streamer.display}, hors ligne`}
          className="flex-1 flex-row items-center gap-2.5 active:opacity-60"
        >
          <StreamerAvatar uri={streamer.profileUrl} size={22} dim />
          <Text numberOfLines={1} className="flex-1 text-[13px] text-gray-400">
            {streamer.display}
          </Text>
          <Text className="text-[13px] text-gray-500">
            {formatEuros(streamer.donationAmount.number)}
          </Text>
        </Pressable>
      </Link>

      {trailing}
    </View>
  );
}

export const OfflineStreamerRow = memo(OfflineStreamerRowComponent);
