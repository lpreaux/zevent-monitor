import { Image, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import type { Streamer } from '@/api/types';
import { formatCount, formatEuros } from '@/lib/format';
import { openDonationPage, openTwitchStream } from '@/lib/links';
import { LiveDot } from './live-dot';

/**
 * Carte d'un favori en live sur le dashboard : cagnotte perso, viewers, jeu, et
 * raccourcis directs vers le stream et la page de don. Le corps de la carte mène
 * au détail du streamer.
 */
export function FavoriteStreamerCard({ streamer }: { streamer: Streamer }) {
  const router = useRouter();

  return (
    <View className="w-52 rounded-2xl border border-gray-800 bg-gray-900/60 p-3">
      <Pressable
        onPress={() =>
          router.push({ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Détails de ${streamer.display}`}
        className="active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Image
            source={{ uri: streamer.profileUrl }}
            className="h-9 w-9 rounded-full bg-gray-800"
          />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-white" numberOfLines={1}>
              {streamer.display}
            </Text>
            <LiveDot online={streamer.online} compact />
          </View>
        </View>
        <Text className="mt-2 text-lg font-bold text-zevent-300">
          {formatEuros(streamer.donationAmount.number)}
        </Text>
        <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>
          {formatCount(streamer.viewersAmount.number)} viewers
          {streamer.game ? ` · ${streamer.game}` : ''}
        </Text>
      </Pressable>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={() => void openTwitchStream(streamer.twitch)}
          accessibilityRole="button"
          accessibilityLabel={`Regarder ${streamer.display} sur Twitch`}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-zevent-500 py-2 active:opacity-80"
        >
          <Ionicons name="play" size={13} color="#ffffff" />
          <Text className="text-xs font-bold text-white">Regarder</Text>
        </Pressable>
        <Pressable
          onPress={() => void openDonationPage(streamer.donationUrl)}
          accessibilityRole="button"
          accessibilityLabel={`Faire un don à ${streamer.display}`}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-zevent-500 py-2 active:opacity-80"
        >
          <Ionicons name="heart" size={13} color="#c4b5fd" />
          <Text className="text-xs font-bold text-zevent-200">Don</Text>
        </Pressable>
      </View>
    </View>
  );
}
