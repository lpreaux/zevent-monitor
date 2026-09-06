import { useCallback, useMemo, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMomentum, useStreamerGoals, useZeventState } from '@/api/queries';
import { LoadingState } from '@/components/screen-state';
import { ShareActions } from '@/components/share-actions';
import { StreamerShareCard } from '@/components/streamer-share-card';
import { buildStreamerShareText, splitGoals, streamerStanding } from '@/lib/streamer-profile';
import { useShareCapture } from '@/lib/use-share-capture';
import { FAVORITES_MOMENTUM_WINDOW_MINUTES, MOMENTUM_LIMIT } from '@/lib/use-ranked-favorites';

/**
 * Carte « ce streamer à l'instant T », à publier. Même mécanique que la carte de la
 * cagnotte globale — capture PNG, repli texte — mais sur un seul streamer, avec la place
 * qu'il occupe au classement et le palier qu'il vise.
 */
export default function StreamerShareScreen() {
  const params = useLocalSearchParams<{ twitch: string }>();
  const twitch = typeof params.twitch === 'string' ? params.twitch : '';
  const login = twitch.toLowerCase();

  const { data, isError } = useZeventState();
  const cardRef = useRef<View>(null);
  const momentum = useMomentum(FAVORITES_MOMENTUM_WINDOW_MINUTES, MOMENTUM_LIMIT);

  const streamer = useMemo(
    () => data?.data.live.find((s) => s.twitch.toLowerCase() === login),
    [data, login],
  );

  const standing = useMemo(
    () =>
      data && streamer
        ? streamerStanding(data.data.live, streamer, data.data.donationAmount.number)
        : null,
    [data, streamer],
  );

  const goals = useStreamerGoals(twitch);
  const nextGoal = useMemo(() => {
    const next = splitGoals(goals.goals, streamer?.donationAmount.number ?? 0).next;
    return next ? { goal: next.goal, remaining: next.remaining } : null;
  }, [goals.goals, streamer]);

  const deltaCents = useMemo(
    () =>
      momentum.data?.streamers.find((item) => item.twitch.toLowerCase() === login)?.deltaCents ?? 0,
    [momentum.data, login],
  );

  const buildText = useCallback(
    () =>
      streamer
        ? buildStreamerShareText(streamer, standing, {
            delta:
              deltaCents > 0
                ? { eur: deltaCents / 100, windowMinutes: FAVORITES_MOMENTUM_WINDOW_MINUTES }
                : null,
            nextGoal: nextGoal
              ? { label: nextGoal.goal.label, remaining: nextGoal.remaining }
              : null,
          })
        : null,
    [streamer, standing, deltaCents, nextGoal],
  );

  const share = useShareCapture(cardRef, buildText, 'Partager la fiche du streamer');

  if (!streamer || !standing) {
    return isError ? (
      <View className="flex-1 items-center justify-center bg-gray-950 px-6">
        <Text className="text-center text-sm text-gray-400">
          Backend injoignable : impossible de composer la carte.
        </Text>
      </View>
    ) : data ? (
      <View className="flex-1 items-center justify-center bg-gray-950 px-6">
        <Text className="text-center text-sm text-gray-400">
          {`« ${twitch} » ne figure pas dans la liste officielle : il n’y a pas de cagnotte à partager.`}
        </Text>
      </View>
    ) : (
      <LoadingState label="Composition de la carte…" />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: streamer.display }} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4">
        <StreamerShareCard
          ref={cardRef}
          streamer={streamer}
          standing={standing}
          deltaCents={deltaCents}
          windowMinutes={FAVORITES_MOMENTUM_WINDOW_MINUTES}
          nextGoal={nextGoal}
          capturedAt={data?.sampledAt ?? new Date().toISOString()}
        />

        <ShareActions share={share} />

        <Text className="text-xs text-gray-600">
          La carte reprend l’état officiel zevent.fr au moment de l’ouverture de cet écran. Les
          paliers viennent de la source communautaire InGDoc / EvenMoreStats.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
