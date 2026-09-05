import { memo } from 'react';
import { Pressable, Text } from 'react-native';
import { Link } from 'expo-router';

import type { Streamer } from '@/api/types';
import { formatEuros } from '@/lib/format';
import { StreamerAvatar } from './streamer-avatar';

/**
 * Favori hors ligne : une seule ligne, en nuances de gris, sans action ni pastille.
 * Rien n'y bouge tant que le streamer n'est pas revenu — autant que ça se voie.
 */
function FavoriteOfflineRowComponent({ streamer }: { streamer: Streamer }) {
  return (
    <Link href={{ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Détails de ${streamer.display}, hors ligne`}
        className="flex-row items-center gap-2.5 py-2 active:opacity-60"
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
  );
}

export const FavoriteOfflineRow = memo(FavoriteOfflineRowComponent);
