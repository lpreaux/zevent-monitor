import { Fragment, useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useZeventState } from '@/api/queries';
import { FavoriteLiveRow } from '@/components/favorite-live-row';
import { FavoriteOfflineRow } from '@/components/favorite-offline-row';
import { RowSeparator } from '@/components/row-separator';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { SourceFreshness } from '@/components/source-freshness';
import { formatCount } from '@/lib/format';
import type { ScoredFavorite } from '@/lib/favorite-relevance';
import { useRankedFavorites } from '@/lib/use-ranked-favorites';

type FavoritesSort = 'relevance' | 'donation' | 'viewers';

const SORTS: { key: FavoritesSort; label: string }[] = [
  { key: 'relevance', label: 'Pertinence' },
  { key: 'donation', label: 'Cagnotte' },
  { key: 'viewers', label: 'Viewers' },
];

const SORT_HINTS: Record<FavoritesSort, string> = {
  relevance: 'Classés sur le direct, la progression récente, les shows du planning et vos habitudes.',
  donation: 'Classés par cagnotte personnelle.',
  viewers: 'Classés par audience Twitch du moment.',
};

/** Le tri ne concerne que les lives : hors ligne, seule la cagnotte reste comparable. */
function sortLive(live: ScoredFavorite[], sort: FavoritesSort): ScoredFavorite[] {
  if (sort === 'relevance') return live;
  const sorted = [...live];
  if (sort === 'viewers') {
    sorted.sort((a, b) => b.streamer.viewersAmount.number - a.streamer.viewersAmount.number);
  } else {
    sorted.sort((a, b) => b.streamer.donationAmount.number - a.streamer.donationAmount.number);
  }
  return sorted;
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <View className="flex-row items-baseline gap-2 pt-2">
      <Text className="text-[11px] font-semibold uppercase tracking-[1.2px] text-gray-500">
        {label}
      </Text>
      <Text className="text-[11px] text-gray-600">{formatCount(count)}</Text>
    </View>
  );
}

/**
 * Liste complète des favoris, ouverte depuis l'accueil. Même vocabulaire visuel qu'ici :
 * lignes denses pour les lives, one-liners gris pour les hors ligne — mais sans coupure
 * ni carte mise en avant, puisque le but est de tout voir d'un coup.
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const { data, isError, error, refetch, isRefetching } = useZeventState();
  const { live, offline, known, saved, shows, pending } = useRankedFavorites();
  const [sort, setSort] = useState<FavoritesSort>('relevance');

  const onRefresh = useCallback(() => void refetch(), [refetch]);
  const rows = useMemo(() => sortLive(live, sort), [live, sort]);

  if (pending) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
        {isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Backend injoignable'}
            onRetry={onRefresh}
          />
        ) : (
          <LoadingState label="Chargement de vos favoris…" />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView
        contentContainerClassName="gap-3 px-5 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
      >
        {saved === 0 ? (
          <EmptyState message="Aucun favori enregistré pour l’instant." />
        ) : (
          <>
            <View className="flex-row items-baseline justify-between">
              <Text className="text-sm text-gray-400">
                {formatCount(live.length)} en live sur {formatCount(known)}
              </Text>
              {data ? (
                <SourceFreshness fetchedAt={data.source.fetchedAt} stale={data.source.stale} />
              ) : null}
            </View>

            {live.length > 1 ? <Segmented options={SORTS} value={sort} onChange={setSort} /> : null}
            {live.length > 1 ? (
              <Text className="text-xs text-gray-600">{SORT_HINTS[sort]}</Text>
            ) : null}

            {rows.length > 0 ? (
              <View>
                <SectionTitle label="En direct" count={rows.length} />
                {rows.map((item, index) => (
                  <Fragment key={item.streamer.twitch_id}>
                    {index > 0 ? <RowSeparator inset={50} /> : null}
                    <FavoriteLiveRow
                      item={item}
                      show={shows.get(item.streamer.twitch.toLowerCase())}
                    />
                  </Fragment>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-gray-500">Aucun favori en live pour le moment.</Text>
            )}

            {offline.length > 0 ? (
              <View>
                <SectionTitle label="Hors ligne" count={offline.length} />
                {offline.map((streamer, index) => (
                  <Fragment key={streamer.twitch_id}>
                    {index > 0 ? <RowSeparator inset={32} /> : null}
                    <FavoriteOfflineRow streamer={streamer} />
                  </Fragment>
                ))}
              </View>
            ) : null}

            {known < saved ? (
              <Text className="pt-1 text-xs text-gray-600">
                {formatCount(saved - known)} favori(s) absent(s) de la liste officielle actuelle.
              </Text>
            ) : null}
          </>
        )}

        <Pressable
          onPress={() => router.push('/streamers')}
          accessibilityRole="button"
          className="mt-2 flex-row items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-2.5 active:opacity-60"
        >
          <Ionicons name="people-outline" size={14} color="#9ca3af" />
          <Text className="text-xs font-semibold text-gray-300">Gérer mes favoris</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
