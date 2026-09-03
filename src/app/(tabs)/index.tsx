import { useCallback, useMemo } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useZeventState } from '@/api/queries';
import type { Streamer } from '@/api/types';
import { AnimatedEuros } from '@/components/animated-euros';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { FavoriteStreamerCard } from '@/components/favorite-streamer-card';
import { SourceFreshness } from '@/components/source-freshness';
import { StatTile } from '@/components/stat-tile';
import { WebsiteModeBadge } from '@/components/website-mode-badge';
import { formatCount } from '@/lib/format';
import { useFavoritesStore } from '@/store/favorites';

function readMarquee(marquee: unknown): string | null {
  if (typeof marquee === 'string') return marquee.trim() || null;
  if (marquee && typeof marquee === 'object') {
    const record = marquee as Record<string, unknown>;
    const text = record.text ?? record.message ?? record.label;
    if (typeof text === 'string') return text.trim() || null;
  }
  return null;
}

export default function DashboardScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useZeventState();
  const favorites = useFavoritesStore((s) => s.favorites);

  const favoriteStreamers = useMemo<Streamer[]>(() => {
    if (!data) return [];
    const set = new Set(favorites);
    return data.data.live.filter((s) => set.has(s.twitch.toLowerCase()));
  }, [data, favorites]);

  const onRefresh = useCallback(() => void refetch(), [refetch]);

  if (isLoading && !data) return <LoadingState label="Connexion au backend…" />;
  if (isError && !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Backend injoignable'}
        onRetry={onRefresh}
      />
    );
  }
  if (!data) return <LoadingState />;

  const state = data.data;
  const marquee = readMarquee(state.marquee);
  const liveCount = state.live.filter((s) => s.online).length;

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold uppercase tracking-widest text-zevent-400">
            ZEvent Monitor 2026
          </Text>
          <WebsiteModeBadge mode={state.websiteMode} />
        </View>

        {marquee ? (
          <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <Text className="text-sm text-amber-200">{marquee}</Text>
          </View>
        ) : null}

        <View className="rounded-3xl border border-zevent-500/40 bg-zevent-500/10 p-5">
          <Text className="text-sm text-gray-300">Cagnotte globale</Text>
          <AnimatedEuros value={state.donationAmount.number} style={{ marginTop: 6 }} />
          <View className="mt-3">
            <SourceFreshness fetchedAt={data.source.fetchedAt} stale={data.source.stale} />
          </View>
        </View>

        <View className="flex-row gap-3">
          <StatTile
            label="Viewers cumulés"
            value={formatCount(state.viewersCount.number)}
          />
          <StatTile
            label="Streamers en live"
            value={formatCount(liveCount)}
            hint={`${state.live.length} inscrits`}
          />
        </View>

        <Pressable
          onPress={() => void Linking.openURL(state.globalDonationUrl)}
          className="items-center rounded-2xl bg-zevent-500 py-3.5 active:opacity-80"
        >
          <Text className="text-base font-bold text-white">Faire un don</Text>
        </Pressable>

        <View className="mt-2 gap-3">
          <Text className="text-base font-bold text-white">Mes favoris</Text>
          {favorites.length === 0 ? (
            <Text className="text-sm text-gray-500">
              Ajoutez des streamers en favori depuis l’onglet Streamers pour les suivre ici.
            </Text>
          ) : favoriteStreamers.length === 0 ? (
            <Text className="text-sm text-gray-500">
              Vos favoris ne figurent pas dans la liste officielle actuelle.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 pr-5"
            >
              {favoriteStreamers.map((streamer) => (
                <FavoriteStreamerCard key={streamer.twitch_id} streamer={streamer} />
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
