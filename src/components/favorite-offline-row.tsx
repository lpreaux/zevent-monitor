import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

import type { Streamer } from '@/api/types';
import { formatEuros } from '@/lib/format';
import { LiveDot } from './live-dot';

/**
 * Ligne discrète pour un favori hors ligne sur le dashboard : nom, cagnotte et
 * indicateur hors ligne réduit. Seul accès proposé : le détail du streamer.
 */
export function FavoriteOfflineRow({ streamer }: { streamer: Streamer }) {
  return (
    <Link
      href={{ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } }}
      asChild
    >
      <Pressable className="flex-row items-center gap-3 rounded-xl px-1 py-2 active:opacity-70">
        <Image
          source={{ uri: streamer.profileUrl }}
          className="h-8 w-8 rounded-full bg-gray-800 opacity-70"
        />
        <View className="flex-1">
          <Text className="text-sm font-medium text-gray-300" numberOfLines={1}>
            {streamer.display}
          </Text>
          <LiveDot online={false} compact />
        </View>
        <Text className="text-sm font-semibold text-zevent-300/80">
          {formatEuros(streamer.donationAmount.number)}
        </Text>
      </Pressable>
    </Link>
  );
}
