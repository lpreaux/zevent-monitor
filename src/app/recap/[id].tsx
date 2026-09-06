import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { getRecap } from '@/api/recaps';
import { Metric, MetricDivider } from '@/components/metric';
import { coverageNotice, personalizeRecap } from '@/lib/recap-personalization';
import { useRecapIdentity } from '@/lib/use-recap-identity';
import { useFavoritesStore } from '@/store/favorites';

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const hourMinute = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' });

/** Au-delà, une liste brute devient illisible sur mobile. */
const MAX_ROWS = 12;

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint?: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <View
      className={`gap-3 rounded-2xl border p-4 ${
        accent ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 bg-gray-900'
      }`}
    >
      <View className="gap-0.5">
        <Text className="text-lg font-bold text-white">{title}</Text>
        {hint ? <Text className="text-xs text-gray-400">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function StreamerRow({
  display,
  detail,
  value,
  onPress,
}: {
  display: string;
  detail?: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 active:opacity-70">
      <View className="flex-1">
        <Text className="text-sm text-gray-200">{display}</Text>
        {detail ? <Text className="text-xs text-gray-500">{detail}</Text> : null}
      </View>
      {value ? <Text className="text-sm font-bold text-zevent-300">{value}</Text> : null}
      <Ionicons name="chevron-forward" size={14} color="#4b5563" />
    </Pressable>
  );
}

export default function RecapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const recapId = id ?? '';
  const { identity, error: identityError } = useRecapIdentity();
  const favorites = useFavoritesStore((s) => s.favorites);
  const query = useQuery({
    queryKey: ['recap', recapId, identity?.installationId],
    queryFn: () => getRecap(identity!, recapId),
    enabled: Boolean(identity) && /^\d+$/.test(recapId),
  });
  const recap = query.data;

  if (!recap) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-950 p-6">
        {query.isLoading && !identityError ? (
          <ActivityIndicator color="#a78bfa" />
        ) : (
          <Text className="text-center text-red-300">
            {identityError ??
              (query.error instanceof Error ? query.error.message : 'Récap introuvable')}
          </Text>
        )}
      </View>
    );
  }

  const { summary, counts, highlights, bigDonations, goalsReached, liveStarts } = recap.content;
  const personal = personalizeRecap(recap.content, favorites);
  const notice = coverageNotice(recap);
  const openStreamer = (twitch: string) => router.push(`/streamer/${twitch}` as never);

  return (
    <ScrollView className="flex-1 bg-gray-950" contentContainerClassName="gap-4 p-4 pb-12">
      <View className="gap-2">
        <Text className="text-xs uppercase tracking-wider text-gray-500">
          Collecté sur la période
        </Text>
        <Text className="text-4xl font-black text-white">
          +{euros.format(summary.raisedCents / 100)}
        </Text>
        <Text className="text-sm text-gray-400">
          du {dateTime.format(new Date(recap.periodStart))} au{' '}
          {dateTime.format(new Date(recap.periodEnd))}
        </Text>
      </View>

      {notice ? (
        <View className="flex-row gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
          <Ionicons name="warning-outline" size={16} color="#fbbf24" />
          <Text className="flex-1 text-xs text-amber-200">{notice}</Text>
        </View>
      ) : null}

      <View className="flex-row items-start">
        <Metric
          label="Cagnotte"
          value={summary.endCents === null ? '—' : euros.format(summary.endCents / 100)}
          hint={
            summary.startCents === null
              ? 'à la fin de la période'
              : `depuis ${euros.format(summary.startCents / 100)}`
          }
        />
        <MetricDivider />
        <Metric label="Pic viewers" value={summary.peakViewers.toLocaleString('fr-FR')} />
      </View>
      <View className="flex-row items-start">
        <Metric label="Goals atteints" value={String(counts.goalsReached)} />
        <MetricDivider />
        <Metric label="Lives lancés" value={String(counts.liveStarts)} />
      </View>

      {personal.hasFavoriteContent ? (
        <Section
          title="Vos favoris"
          hint="Extrait du récap limité aux streamers que vous suivez."
          accent
        >
          {personal.favoriteProgressions.map((item) => (
            <StreamerRow
              key={`progress-${item.twitch}`}
              display={item.display}
              detail="progression sur la période"
              value={`+${euros.format(item.raisedCents / 100)}`}
              onPress={() => openStreamer(item.twitch)}
            />
          ))}
          {personal.favoriteGoals.map((item, index) => (
            <StreamerRow
              key={`goal-${item.twitch}-${index}`}
              display={item.display}
              detail={`goal atteint · ${item.label}`}
              onPress={() => openStreamer(item.twitch)}
            />
          ))}
          {personal.favoriteLiveStarts.map((item) => (
            <StreamerRow
              key={`live-${item.twitch}`}
              display={item.display}
              detail={`live lancé à ${hourMinute.format(new Date(item.occurredAt))}`}
              onPress={() => openStreamer(item.twitch)}
            />
          ))}
          {personal.favoriteDonations.map((item, index) => (
            <StreamerRow
              key={`donation-${item.occurredAt}-${index}`}
              display={item.donor}
              detail={`gros don pour ${item.twitch}`}
              value={euros.format(item.amountCents / 100)}
              onPress={() => openStreamer(item.twitch ?? '')}
            />
          ))}
        </Section>
      ) : favorites.length === 0 ? (
        <View className="flex-row items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <Ionicons name="star-outline" size={16} color="#9ca3af" />
          <Text className="flex-1 text-xs text-gray-400">
            Ajoutez des favoris depuis l’onglet Streamers : leurs progressions et paliers
            apparaîtront en tête de vos récaps.
          </Text>
        </View>
      ) : null}

      {highlights.length > 0 ? (
        <Section title="À retenir">
          {highlights.map((text, index) => (
            <Text key={index} className="text-sm leading-5 text-gray-300">
              • {text}
            </Text>
          ))}
        </Section>
      ) : null}

      {personal.otherProgressions.length > 0 ? (
        <Section title={favorites.length > 0 ? 'Ailleurs sur l’événement' : 'Top progressions'}>
          {personal.otherProgressions.map((item, index) => (
            <StreamerRow
              key={item.twitch}
              display={`${index + 1}. ${item.display}`}
              value={`+${euros.format(item.raisedCents / 100)}`}
              onPress={() => openStreamer(item.twitch)}
            />
          ))}
        </Section>
      ) : null}

      {bigDonations.length > 0 ? (
        <Section
          title="Gros dons détectés"
          hint={counts.bigDonations > bigDonations.length ? `${counts.bigDonations} au total` : undefined}
        >
          {bigDonations.slice(0, MAX_ROWS).map((item, index) => (
            <View key={`${item.occurredAt}-${index}`} className="flex-row justify-between gap-3">
              <Text className="flex-1 text-sm text-gray-300" numberOfLines={1}>
                {item.donor}
                {item.twitch ? ` → ${item.twitch}` : ''}
              </Text>
              <Text className="text-sm font-bold text-emerald-300">
                {euros.format(item.amountCents / 100)}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}

      {goalsReached.length > 0 ? (
        <Section title="Donation goals">
          {goalsReached.slice(0, MAX_ROWS).map((item, index) => (
            <Text key={`${item.occurredAt}-${index}`} className="text-sm text-gray-300">
              <Text className="font-bold text-white">{item.display}</Text> — {item.label}
            </Text>
          ))}
          {goalsReached.length > MAX_ROWS ? (
            <Text className="text-xs text-gray-500">
              + {goalsReached.length - MAX_ROWS} autres
            </Text>
          ) : null}
        </Section>
      ) : null}

      {liveStarts.length > 0 ? (
        <Section title="Nouveaux lives">
          <Text className="text-sm leading-5 text-gray-300">
            {liveStarts
              .slice(0, MAX_ROWS)
              .map((item) => item.display)
              .join(' · ')}
          </Text>
          {liveStarts.length > MAX_ROWS ? (
            <Text className="text-xs text-gray-500">+ {liveStarts.length - MAX_ROWS} autres</Text>
          ) : null}
        </Section>
      ) : null}
    </ScrollView>
  );
}
