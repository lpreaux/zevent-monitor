import { useEffect, useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMomentum, useStreamerSeries, useZeventState } from '@/api/queries';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { StreamerCurve } from '@/components/streamer-curve';
import { StreamerDonations } from '@/components/streamer-donations';
import { StreamerNextGoal } from '@/components/streamer-goals';
import { StreamerHero } from '@/components/streamer-hero';
import { StreamerSchedule } from '@/components/streamer-schedule';
import { Button } from '@/components/ui/button';
import { icons } from '@/lib/icons';
import { openTwitchStream } from '@/lib/links';
import { lastOnlineAt, streamerStanding } from '@/lib/streamer-profile';
import { useLiveShows } from '@/lib/use-live-shows';
import { useNow } from '@/lib/use-now';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { FAVORITES_MOMENTUM_WINDOW_MINUTES, MOMENTUM_LIMIT } from '@/lib/use-ranked-favorites';
import { noteStreamerInteraction } from '@/store/streamer-affinity';

/** Les libellés relatifs de la fiche se comptent en minutes, jamais en secondes. */
const CLOCK_MS = 60_000;

/**
 * Streamer absent de l'état officiel : lien mort du planning, changement de pseudo,
 * désinscription. On le dit sans faire disparaître le reste — le backend peut très bien
 * avoir archivé ses dons et ses paliers sous ce login.
 */
function UnknownStreamer({ twitch }: { twitch: string }) {
  return (
    <View className="gap-3 rounded-3xl border border-white/10 bg-surface-raised p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="help-circle-outline" size={16} color="#9ca3af" />
        <Text className="flex-1 text-sm text-gray-300">
          {`« ${twitch} » ne figure pas dans la liste officielle du ZEvent : ni cagnotte, ni classement, ni direct à afficher.`}
        </Text>
      </View>
      <Button
        block
        size="sm"
        variant="secondary"
        icon={icons.channel}
        label="Ouvrir la chaîne"
        accessibilityLabel={`Ouvrir la chaîne ${twitch} sur Twitch`}
        onPress={() => void openTwitchStream(twitch)}
      />
    </View>
  );
}

/**
 * Fiche d'un streamer : sa tête, sa courbe, ses paliers, ses passages au planning et ses
 * dons. L'écran n'est qu'un assemblage — chaque section porte ses propres requêtes et
 * son propre vide, ce qui lui permet d'arriver quand elle est prête sans retenir le
 * reste de la page.
 */
export default function StreamerDetailScreen() {
  const params = useLocalSearchParams<{ twitch: string }>();
  const twitch = typeof params.twitch === 'string' ? params.twitch : '';
  const login = twitch.toLowerCase();

  const { data, isLoading, isError, error, refetch } = useZeventState();
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const shows = useLiveShows();
  const now = useNow(CLOCK_MS);

  // Même fenêtre que le classement de pertinence des favoris : une seule requête partagée
  // par toute l'application.
  const momentum = useMomentum(FAVORITES_MOMENTUM_WINDOW_MINUTES, MOMENTUM_LIMIT);

  // Consulter une fiche est un signal d'intérêt : il remonte le streamer dans les favoris
  // de l'accueil.
  useEffect(() => {
    if (twitch) noteStreamerInteraction(twitch, 'detail');
  }, [twitch]);

  const streamer = useMemo(
    () => data?.data.live.find((s) => s.twitch.toLowerCase() === login),
    [data, login],
  );

  // La courbe ne sert ici qu'à dater le dernier direct : inutile de la demander tant que
  // le streamer est à l'antenne — la requête reste alors désactivée.
  const offlineSeries = useStreamerSeries(streamer && !streamer.online ? [login] : [], '10m');
  const lastOnline = useMemo(
    () => lastOnlineAt(offlineSeries.data?.streamers[login] ?? []),
    [offlineSeries.data, login],
  );

  const standing = useMemo(
    () =>
      data && streamer
        ? streamerStanding(data.data.live, streamer, data.data.donationAmount.number)
        : null,
    [data, streamer],
  );

  const deltaCents = useMemo(
    () =>
      momentum.data?.streamers.find((item) => item.twitch.toLowerCase() === login)?.deltaCents ?? 0,
    [momentum.data, login],
  );

  if (!data) {
    return isError ? (
      <ErrorState
        message={error instanceof Error ? error.message : 'Backend injoignable'}
        onRetry={onRefresh}
      />
    ) : (
      <LoadingState label={isLoading ? 'Chargement de la fiche…' : 'Chargement…'} />
    );
  }

  const title = streamer?.display ?? twitch;

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: title }} />
      <ScrollView
        // Sections espacées franchement : c'est le vide entre elles, plus qu'un encadré,
        // qui découpe une page faite de listes.
        contentContainerClassName="gap-7 px-5 pb-12 pt-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
        {/* Le palier en cours prolonge la carte d'identité — c'est la suite de la phrase
            que commence la cagnotte — et reste donc collé à elle, à l'écart du rythme
            large qui sépare les sections suivantes. */}
        <View className="gap-3">
          {streamer && standing ? (
            <StreamerHero
              streamer={streamer}
              show={shows.get(login)}
              deltaCents={deltaCents}
              windowMinutes={FAVORITES_MOMENTUM_WINDOW_MINUTES}
              standing={standing}
              lastOnline={lastOnline}
              now={now}
            />
          ) : (
            <UnknownStreamer twitch={twitch} />
          )}

          <StreamerNextGoal twitch={twitch} raisedEuros={streamer?.donationAmount.number ?? 0} />
        </View>

        {/* Ce qu'il fait avant ce qu'il a levé : pendant le direct, « quand est-ce qu'il
            repasse » se demande plus souvent que la forme de sa courbe. */}
        {streamer ? <StreamerSchedule twitch={streamer.twitch} /> : null}

        {streamer ? (
          <StreamerCurve
            twitch={streamer.twitch}
            display={streamer.display}
            currentEur={streamer.donationAmount.number}
          />
        ) : null}

        <StreamerDonations twitch={twitch} />
      </ScrollView>
    </SafeAreaView>
  );
}
