import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { useMomentum, useZeventState } from '@/api/queries';
import type { Streamer } from '@/api/types';
import { AnimatedEuros } from '@/components/animated-euros';
import { AppHeader, type HeaderAction } from '@/components/app-header';
import { ScreenShell } from '@/components/screen-shell';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { FavoriteOfflineRow } from '@/components/favorite-offline-row';
import { FavoriteStreamerCard } from '@/components/favorite-streamer-card';
import { MomentumRow } from '@/components/momentum-row';
import { Segmented } from '@/components/segmented';
import { SourceFreshness } from '@/components/source-freshness';
import { StatTile } from '@/components/stat-tile';
import { WebsiteModeBadge } from '@/components/website-mode-badge';
import { formatCount } from '@/lib/format';
import { useFavoritesStore } from '@/store/favorites';

type MomentumWindow = '10' | '60';

const MOMENTUM_OPTIONS: { key: MomentumWindow; label: string }[] = [
  { key: '10', label: '10 dernières min' },
  { key: '60', label: 'Dernière heure' },
];

/** Streamers dont la cagnotte a le plus progressé récemment : les moments forts du direct. */
function MomentumSection({ favorites }: { favorites: readonly string[] }) {
  const [window, setWindow] = useState<MomentumWindow>('10');
  const query = useMomentum(Number(window), 5);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const items = query.data?.streamers ?? [];

  return (
    <View className="mt-2 gap-3">
      <Text className="text-base font-bold text-white">Top du moment</Text>
      <Segmented options={MOMENTUM_OPTIONS} value={window} onChange={setWindow} />
      {query.isError && !query.data ? (
        <Text className="text-xs text-amber-200">Classement indisponible : backend injoignable.</Text>
      ) : items.length === 0 ? (
        <Text className="text-sm text-gray-500">
          {query.data && !query.data.complete
            ? 'La collecte ne couvre pas encore cette fenêtre.'
            : 'Aucune progression sur la fenêtre choisie.'}
        </Text>
      ) : (
        <View className="gap-2">
          {items.map((item, index) => (
            <MomentumRow
              key={item.twitch}
              item={item}
              position={index + 1}
              favorite={favoriteSet.has(item.twitch)}
            />
          ))}
        </View>
      )}
      {query.data && !query.data.complete && items.length > 0 ? (
        <Text className="text-xs text-gray-600">Fenêtre partiellement couverte par la collecte.</Text>
      ) : null}
    </View>
  );
}

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
  const router = useRouter();
  const { data, isError, error, refetch, isRefetching } = useZeventState();
  const favorites = useFavoritesStore((s) => s.favorites);

  const headerActions = useMemo<HeaderAction[]>(
    () => [
      {
        icon: 'share-social-outline',
        label: 'Partager la cagnotte',
        onPress: () => router.push('/share-card'),
      },
      {
        icon: 'notifications-outline',
        label: 'Réglages des notifications',
        onPress: () => router.push('/settings/notifications'),
      },
    ],
    [router],
  );

  /** Favoris scindés : les lives passent en cartes, les hors ligne en lignes discrètes. */
  const { liveFavorites, offlineFavorites } = useMemo(() => {
    if (!data) return { liveFavorites: [] as Streamer[], offlineFavorites: [] as Streamer[] };
    const set = new Set(favorites);
    const mine = data.data.live
      .filter((s) => set.has(s.twitch.toLowerCase()))
      .sort((a, b) => b.donationAmount.number - a.donationAmount.number);
    return {
      liveFavorites: mine.filter((s) => s.online),
      offlineFavorites: mine.filter((s) => !s.online),
    };
  }, [data, favorites]);
  const favoriteCount = liveFavorites.length + offlineFavorites.length;

  const onRefresh = useCallback(() => void refetch(), [refetch]);

  if (!data) {
    return (
      <ScreenShell
        header={
          <AppHeader
            title="ZEvent Monitor"
            subtitle="Édition 2026"
            actions={headerActions}
          />
        }
      >
        {isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Backend injoignable'}
            onRetry={onRefresh}
          />
        ) : (
          <LoadingState label="Connexion au backend…" />
        )}
      </ScreenShell>
    );
  }

  const state = data.data;
  const marquee = readMarquee(state.marquee);
  const liveCount = state.live.filter((s) => s.online).length;

  return (
    <ScreenShell
      header={
        <AppHeader
          title="ZEvent Monitor"
          subtitle={`Édition 2026 · ${formatCount(liveCount)} en live`}
          badge={<WebsiteModeBadge mode={state.websiteMode} />}
          actions={headerActions}
        />
      }
    >
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
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

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => void Linking.openURL(state.globalDonationUrl)}
            className="flex-1 items-center rounded-2xl bg-zevent-500 py-3.5 active:opacity-80"
          >
            <Text className="text-base font-bold text-white">Faire un don</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/always-on')}
            accessibilityRole="button"
            accessibilityLabel="Activer le mode AlwaysOn"
            className="flex-row items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3.5 active:opacity-70"
          >
            <Ionicons name="tv-outline" size={18} color="#c4b5fd" />
            <Text className="text-base font-bold text-zevent-200">AlwaysOn</Text>
          </Pressable>
        </View>

        <View className="mt-2 gap-3">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-base font-bold text-white">Mes favoris</Text>
            {favoriteCount > 0 ? (
              <Text className="text-xs text-gray-500">
                {formatCount(liveFavorites.length)} en live sur {formatCount(favoriteCount)}
              </Text>
            ) : null}
          </View>
          {favorites.length === 0 ? (
            <Text className="text-sm text-gray-500">
              Ajoutez des streamers en favori depuis l’onglet Streamers pour les suivre ici.
            </Text>
          ) : favoriteCount === 0 ? (
            <Text className="text-sm text-gray-500">
              Vos favoris ne figurent pas dans la liste officielle actuelle.
            </Text>
          ) : (
            <>
              {liveFavorites.length === 0 ? (
                <Text className="text-sm text-gray-500">Aucun favori en live pour le moment.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-3 pr-5"
                >
                  {liveFavorites.map((streamer) => (
                    <FavoriteStreamerCard key={streamer.twitch_id} streamer={streamer} />
                  ))}
                </ScrollView>
              )}

              {offlineFavorites.length > 0 ? (
                <View className="gap-1 rounded-2xl border border-gray-800/70 bg-gray-900/30 px-2 py-1.5">
                  {offlineFavorites.map((streamer) => (
                    <FavoriteOfflineRow key={streamer.twitch_id} streamer={streamer} />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>

        <MomentumSection favorites={favorites} />
      </ScrollView>
    </ScreenShell>
  );
}
