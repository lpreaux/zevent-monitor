import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useZeventState } from '@/api/queries';
import { StreamerGoalsList } from '@/components/streamer-goals';
import { Button } from '@/components/ui/button';
import { icons } from '@/lib/icons';
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
          <Button
            block
            size="lg"
            icon={icons.donate}
            label="Faire un don"
            accessibilityLabel={`Faire un don à ${streamer.display}`}
            onPress={() => void openDonationPage(streamer.donationUrl, streamer.twitch)}
          />
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
