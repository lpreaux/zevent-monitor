import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

import type { Streamer } from '@/api/types';
import { formatCount, formatEuros } from '@/lib/format';
import { LiveDot } from './live-dot';

/** Carte compacte d'un favori sur le dashboard : cagnotte perso, live, jeu, viewers. */
export function FavoriteStreamerCard({ streamer }: { streamer: Streamer }) {
  return (
    <Link
      href={{ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } }}
      asChild
    >
      <Pressable className="w-44 rounded-2xl border border-gray-800 bg-gray-900/60 p-3 active:opacity-70">
        <View className="flex-row items-center gap-2">
          <Image
            source={{ uri: streamer.profileUrl }}
            className="h-9 w-9 rounded-full bg-gray-800"
          />
          <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={1}>
            {streamer.display}
          </Text>
        </View>
        <Text className="mt-2 text-lg font-bold text-zevent-300">
          {formatEuros(streamer.donationAmount.number)}
        </Text>
        <View className="mt-1 flex-row items-center justify-between">
          <LiveDot online={streamer.online} />
          {streamer.online ? (
            <Text className="text-xs text-gray-400">
              {formatCount(streamer.viewersAmount.number)}
            </Text>
          ) : null}
        </View>
        <Text className="mt-1 text-xs text-gray-500" numberOfLines={1}>
          {streamer.online ? streamer.game || 'En stream' : 'Hors ligne'}
        </Text>
      </Pressable>
    </Link>
  );
}
