import { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

import type { Streamer } from '@/api/types';
import { formatCount, formatEuros } from '@/lib/format';
import { FavoriteButton } from './favorite-button';
import { LiveDot } from './live-dot';

function StreamerRowComponent({ streamer }: { streamer: Streamer }) {
  return (
    <Link
      href={{ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } }}
      asChild
    >
      <Pressable className="flex-row items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3 active:opacity-70">
        <Image
          source={{ uri: streamer.profileUrl }}
          className="h-12 w-12 rounded-full bg-gray-800"
        />
        <View className="flex-1">
          <Text className="text-base font-semibold text-white" numberOfLines={1}>
            {streamer.display}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {streamer.online ? streamer.game || 'En stream' : 'Hors ligne'}
          </Text>
          <View className="mt-1 flex-row items-center gap-3">
            <LiveDot online={streamer.online} />
            {streamer.online ? (
              <Text className="text-xs text-gray-400">
                {formatCount(streamer.viewersAmount.number)} viewers
              </Text>
            ) : null}
          </View>
        </View>
        <View className="items-end gap-1">
          <Text className="text-sm font-bold text-zevent-300">
            {formatEuros(streamer.donationAmount.number)}
          </Text>
          <FavoriteButton twitch={streamer.twitch} />
        </View>
      </Pressable>
    </Link>
  );
}

export const StreamerRow = memo(StreamerRowComponent);
