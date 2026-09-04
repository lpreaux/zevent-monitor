import { useMemo } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useStreamerDonations,
  useStreamerGoals,
  useStreamerSeries,
  useTimeseries2026,
  useZeventState,
} from '@/api/queries';
import { AnimatedEuros } from '@/components/animated-euros';
import { DonationRow } from '@/components/donation-row';
import { GoalProgress } from '@/components/goal-progress';
import { LiveDot } from '@/components/live-dot';
import { ObservedNotice } from '@/components/observed-notice';
import { OverlayChart } from '@/components/overlay-chart';
import { EmptyState, LoadingState } from '@/components/screen-state';
import { FavoriteButton } from '@/components/favorite-button';
import { StatTile } from '@/components/stat-tile';
import { niceCeil } from '@/lib/donations';
import { formatCount, formatEuros, formatEurosCompact, formatRelativeTime, twitchLinks } from '@/lib/format';
import { toElapsedSeries, type RawPoint } from '@/lib/timeseries';

async function openTwitch(login: string) {
  const { app, web } = twitchLinks(login);
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web);
  }
}

/** Courbe de la cagnotte perso, alignée sur le T+0 de la collecte globale. */
function StreamerCurve({ twitch, currentEur }: { twitch: string; currentEur: number }) {
  const globalQuery = useTimeseries2026('10m');
  const seriesQuery = useStreamerSeries([twitch]);

  const chart = useMemo(() => {
    const raw: RawPoint[] = (globalQuery.data?.points ?? []).map((point) => ({
      t: Date.parse(point.bucket),
      eur: Number(point.donation_cents) / 100,
    }));
    const origin = toElapsedSeries(raw).originAt;
    const points = (seriesQuery.data?.streamers[twitch.toLowerCase()] ?? [])
      .map((point) => ({
        minutes: origin === null ? 0 : (Date.parse(point.bucket) - origin) / 60_000,
        eur: point.eur,
      }))
      .filter((point) => point.minutes >= 0);
    const maxMinutes = Math.max(60, points.at(-1)?.minutes ?? 0);
    const yMax = niceCeil(Math.max(currentEur, ...points.map((p) => p.eur)));
    const step = maxMinutes > 48 * 60 ? 12 : maxMinutes > 12 * 60 ? 6 : 2;
    const xTicks: { minutes: number; label: string }[] = [];
    for (let hour = 0; hour * 60 <= maxMinutes; hour += step) xTicks.push({ minutes: hour * 60, label: `${hour} h` });
    return { points, maxMinutes, yMax, xTicks };
  }, [globalQuery.data, seriesQuery.data, twitch, currentEur]);

  if (seriesQuery.isError && !seriesQuery.data) return null;
  if (chart.points.length < 2) {
    return (
      <Text className="text-xs text-gray-500">
        La courbe apparaîtra dès que le backend aura collecté quelques points pour ce streamer.
      </Text>
    );
  }

  return (
    <OverlayChart
      series={[{ id: twitch, label: twitch, color: '#8b5cf6', points: chart.points }]}
      maxMinutes={chart.maxMinutes}
      yMax={chart.yMax}
      referenceLines={[0.5, 1].map((ratio) => ({ value: chart.yMax * ratio, label: formatEurosCompact(chart.yMax * ratio) }))}
      xTicks={chart.xTicks}
      height={140}
    />
  );
}

/** Dons observés pour ce streamer : synthèse, plus gros dons et derniers messages. */
function StreamerDonations({ twitch }: { twitch: string }) {
  const query = useStreamerDonations(twitch);
  const data = query.data;

  if (query.isError && !data) {
    return <Text className="text-xs text-amber-200">Dons indisponibles : backend injoignable.</Text>;
  }
  if (!data) return <Text className="text-xs text-gray-500">Chargement des dons…</Text>;

  const { summary } = data;
  const seen = new Set<string>();
  const highlighted = [...data.largest.slice(0, 3), ...data.recent].filter((donation) => {
    if (seen.has(donation.id)) return false;
    seen.add(donation.id);
    return true;
  });

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <StatTile label="Dons observés" value={formatCount(summary.count)} hint={summary.withComment ? `${formatCount(summary.withComment)} avec message` : undefined} />
        <StatTile label="Don moyen" value={summary.meanCents != null ? formatEuros(summary.meanCents / 100) : '—'} hint={summary.medianCents != null ? `médian ${formatEuros(summary.medianCents / 100)}` : undefined} />
      </View>
      <View className="flex-row gap-3">
        <StatTile label="Plus gros don" value={summary.maxCents != null ? formatEuros(summary.maxCents / 100) : '—'} hint={data.largest[0] ? data.largest[0].donor : undefined} />
        <StatTile label="Total observé" value={formatEurosCompact(summary.totalCents / 100)} hint="via le feed Streamlabs" />
      </View>
      {highlighted.length === 0 ? (
        <EmptyState message="Aucun don observé pour ce streamer." />
      ) : (
        highlighted.slice(0, 12).map((donation) => (
          <DonationRow key={donation.id} donation={donation} hideStreamer highlightCents={10_000} />
        ))
      )}
      <ObservedNotice
        observed={{ count: summary.count, totalCents: summary.totalCents, firstAt: summary.firstAt, lastAt: summary.lastAt }}
        prefix="Synthèse établie"
      />
    </View>
  );
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

        {streamer ? (
          <View className="mt-2 gap-3">
            <Text className="text-base font-bold text-white">Courbe de la cagnotte</Text>
            <StreamerCurve twitch={streamer.twitch} currentEur={raisedEuros} />
          </View>
        ) : null}

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

        <View className="mt-2 gap-3">
          <Text className="text-base font-bold text-white">Dons reçus</Text>
          <StreamerDonations twitch={twitch} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
