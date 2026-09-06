import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useZeventState } from '@/api/queries';
import { StreamerGoalsList } from '@/components/streamer-goals';
import { openDonationPage } from '@/lib/links';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

/**
 * Tous les donation goals d'un streamer.
 *
 * La fiche ne montre que le palier qui se joue : le reste — ce qui attend derrière et le
 * mur de ce qui est fait — vit ici, où l'on vient délibérément. Le bouton de don reste au
 * pied de la page : c'est la seule action qu'une liste de paliers appelle.
 */
export default function StreamerGoalsScreen() {
  const params = useLocalSearchParams<{ twitch: string }>();
  const twitch = typeof params.twitch === 'string' ? params.twitch : '';
  const login = twitch.toLowerCase();

  const { data, refetch } = useZeventState();
  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  const streamer = useMemo(
    () => data?.data.live.find((s) => s.twitch.toLowerCase() === login),
    [data, login],
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: streamer?.display ?? twitch }} />
      <ScrollView
        contentContainerClassName="gap-5 px-5 pb-12 pt-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
        <StreamerGoalsList
          twitch={twitch}
          raisedEuros={streamer?.donationAmount.number ?? 0}
        />

        {streamer ? (
          <Pressable
            onPress={() => void openDonationPage(streamer.donationUrl, streamer.twitch)}
            accessibilityRole="button"
            accessibilityLabel={`Faire un don à ${streamer.display}`}
            className="flex-row items-center justify-center gap-1.5 rounded-full bg-zevent-500 py-3 active:opacity-80"
          >
            <Ionicons name="heart" size={15} color="#ffffff" />
            <Text className="text-sm font-bold text-white">Faire un don</Text>
          </Pressable>
        ) : (
          <Text className="text-xs text-gray-600">
            Ce streamer ne figure pas dans la liste officielle : sa cagnotte est inconnue, les
            paliers ci-dessus ne peuvent pas être situés.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
