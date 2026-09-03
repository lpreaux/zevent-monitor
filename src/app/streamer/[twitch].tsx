import { useMemo } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStreamerGoals, useZeventState } from '@/api/queries';
import { AnimatedEuros } from '@/components/animated-euros';
import { GoalProgress } from '@/components/goal-progress';
import { LiveDot } from '@/components/live-dot';
import { EmptyState, LoadingState } from '@/components/screen-state';
import { FavoriteButton } from '@/components/favorite-button';
import { formatCount, formatRelativeTime, twitchLinks } from '@/lib/format';

async function openTwitch(login: string) {
  const { app, web } = twitchLinks(login);
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web);
  }
}

export default function StreamerDetailScreen() {
  const params = useLocalSearchParams<{ twitch: string }>();
  const twitch = typeof params.twitch === 'string' ? params.twitch : '';
  const { data, isLoading } = useZeventState();
  const goalsResult = useStreamerGoals(twitch);

  const streamer = useMemo(() => {
    if (!data) return undefined;
    const login = twitch.toLowerCase();
    return data.data.live.find((s) => s.twitch.toLowerCase() === login);
  }, [data, twitch]);

  const raisedEuros = streamer?.donationAmount.number ?? 0;
  const highlightId = useMemo(() => {
    const next = goalsResult.goals.find((g) => raisedEuros < g.amountCents / 100);
    return next?.id;
  }, [goalsResult.goals, raisedEuros]);

  if (isLoading && !data) return <LoadingState />;

  const title = streamer?.display ?? twitch;

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: title }} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-12 pt-4">
        <View className="flex-row items-center gap-4">
          {streamer ? (
            <Image
              source={{ uri: streamer.profileUrl }}
              className="h-16 w-16 rounded-full bg-gray-800"
            />
          ) : null}
          <View className="flex-1">
            <Text className="text-2xl font-bold text-white">{title}</Text>
            <View className="mt-1 flex-row items-center gap-3">
              <LiveDot online={Boolean(streamer?.online)} />
              {streamer?.online ? (
                <Text className="text-xs text-gray-400">
                  {formatCount(streamer.viewersAmount.number)} viewers
                </Text>
              ) : null}
            </View>
          </View>
          <FavoriteButton twitch={twitch} size={26} />
        </View>

        {streamer ? (
          <>
            <View className="rounded-3xl border border-zevent-500/40 bg-zevent-500/10 p-5">
              <Text className="text-sm text-gray-300">Cagnotte personnelle</Text>
              <AnimatedEuros
                value={streamer.donationAmount.number}
                style={{ marginTop: 6, fontSize: 34 }}
              />
              {streamer.game ? (
                <Text className="mt-2 text-xs text-gray-400">{streamer.game}</Text>
              ) : null}
            </View>

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => void openTwitch(streamer.twitch)}
                className="flex-1 items-center rounded-2xl bg-zevent-500 py-3.5 active:opacity-80"
              >
                <Text className="text-sm font-bold text-white">Regarder sur Twitch</Text>
              </Pressable>
              <Pressable
                onPress={() => void Linking.openURL(streamer.donationUrl)}
                className="flex-1 items-center rounded-2xl border border-zevent-500 py-3.5 active:opacity-80"
              >
                <Text className="text-sm font-bold text-zevent-200">Faire un don</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <Text className="text-sm text-gray-400">
              Ce streamer n’apparaît pas dans l’état officiel actuel. La progression des paliers
              n’est pas disponible.
            </Text>
          </View>
        )}

        <View className="mt-2 gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-white">Donation goals</Text>
            <Text className="text-xs text-gray-500">
              {goalsResult.origin === 'live'
                ? goalsResult.stale
                  ? 'Snapshot en repli'
                  : `MAJ ${formatRelativeTime(goalsResult.fetchedAt)}`
                : 'Copie embarquée'}
            </Text>
          </View>

          {goalsResult.goals.length === 0 ? (
            <EmptyState message="Pas de donation goals connus pour ce streamer." />
          ) : (
            goalsResult.goals.map((goal) => (
              <GoalProgress
                key={String(goal.id)}
                goal={goal}
                raisedEuros={raisedEuros}
                highlighted={goal.id === highlightId}
              />
            ))
          )}

          <Text className="mt-1 text-xs text-gray-600">
            Paliers : InGDoc / EvenMoreStats — source communautaire non officielle.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
