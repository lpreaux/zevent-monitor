import { Fragment, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useZeventState } from '@/api/queries';
import {
  collapseThreshold,
  DEFAULT_CONTROLS_HEIGHTS,
  ListControls,
  type ControlsHeights,
} from '@/components/list-controls';
import { LiveStreamerRow } from '@/components/live-streamer-row';
import { OfflineStreamerRow } from '@/components/offline-streamer-row';
import { RowSeparator } from '@/components/row-separator';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { SectionTitle } from '@/components/section-title';
import { formatCount } from '@/lib/format';
import type { ScoredFavorite } from '@/lib/favorite-relevance';
import {
  compareLive,
  matchesStreamer,
  searchNeedle,
  STREAMER_SORT_HINTS,
} from '@/lib/streamer-sort';
import { useCompactOnScroll } from '@/lib/use-compact-on-scroll';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useRankedFavorites } from '@/lib/use-ranked-favorites';

type FavoritesSort = 'relevance' | 'donation' | 'viewers';

const SORTS: { key: FavoritesSort; label: string }[] = [
  { key: 'relevance', label: 'Pertinence' },
  { key: 'donation', label: 'Cagnotte' },
  { key: 'viewers', label: 'Viewers' },
];

const SORT_HINTS: Record<FavoritesSort, string> = {
  relevance:
    'Classés sur le direct, la progression récente, les shows du planning et vos habitudes.',
  donation: STREAMER_SORT_HINTS.donation,
  viewers: STREAMER_SORT_HINTS.viewers,
};

/** Même délai que sur la liste complète : les deux recherches doivent réagir pareil. */
const SEARCH_DEBOUNCE_MS = 180;

/** Le tri ne concerne que les lives : hors ligne, seule la cagnotte reste comparable. */
function sortLive(live: ScoredFavorite[], sort: FavoritesSort): ScoredFavorite[] {
  if (sort === 'relevance') return live;
  const compare = compareLive(sort);
  return [...live].sort((a, b) => compare(a.streamer, b.streamer));
}

/** Retour vers la liste complète, seul endroit où l'on ajoute et retire des favoris. */
function ManageButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/streamers')}
      accessibilityRole="button"
      className="mt-2 flex-row items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-2.5 active:opacity-60"
    >
      <Ionicons name="people-outline" size={14} color="#9ca3af" />
      <Text className="text-xs font-semibold text-gray-300">Gérer mes favoris</Text>
    </Pressable>
  );
}

/**
 * Liste complète des favoris, ouverte depuis l'accueil. Même vocabulaire visuel que la
 * liste générale — mêmes lignes, même en-tête de contrôles, mêmes intitulés de groupe —
 * mais sans coupure ni carte mise en avant, puisque le but est de tout voir d'un coup.
 */
export default function FavoritesScreen() {
  const { data, isError, error, refetch } = useZeventState();
  const { live, offline, known, saved, shows, pending } = useRankedFavorites();
  const [sort, setSort] = useState<FavoritesSort>('relevance');
  const [search, setSearch] = useState('');

  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const needle = searchNeedle(debounced);
  const [heights, setHeights] = useState<ControlsHeights>(DEFAULT_CONTROLS_HEIGHTS);
  const { compact, onScroll } = useCompactOnScroll(collapseThreshold(heights));

  const rows = useMemo(
    () => sortLive(live, sort).filter((item) => matchesStreamer(item.streamer, needle)),
    [live, sort, needle],
  );
  const offlineRows = useMemo(
    () => offline.filter((streamer) => matchesStreamer(streamer, needle)),
    [offline, needle],
  );

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

  if (saved === 0) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
        <ScrollView contentContainerClassName="gap-3 px-5 pb-10 pt-4">
          <EmptyState message="Aucun favori enregistré pour l’instant." />
          <ManageButton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <View className="flex-1">
        <ScrollView
          // La barre flottant par-dessus, c'est au contenu de commencer sous elle. Cette
          // réserve ne bouge jamais, même repliée : c'est tout l'intérêt du montage.
          contentContainerStyle={{
            gap: 12,
            paddingTop: heights.expanded,
            paddingHorizontal: 20,
            paddingBottom: 40,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#a78bfa"
              // Sans ce décalage, la roue de rafraîchissement tournerait derrière la barre.
              progressViewOffset={heights.expanded}
            />
          }
        >
          {rows.length === 0 && offlineRows.length === 0 ? (
            <EmptyState
              message={
                needle
                  ? `Aucun favori ne correspond à « ${search.trim()} ».`
                  : 'Vos favoris ne figurent pas dans la liste officielle actuelle.'
              }
            />
          ) : (
            <>
              {rows.length > 0 ? (
                <View>
                  <SectionTitle label="En direct" count={rows.length} />
                  {rows.map((item, index) => (
                    <Fragment key={item.streamer.twitch_id}>
                      {index > 0 ? <RowSeparator inset={50} /> : null}
                      <LiveStreamerRow
                        streamer={item.streamer}
                        deltaCents={item.deltaCents}
                        show={shows.get(item.streamer.twitch.toLowerCase())}
                      />
                    </Fragment>
                  ))}
                </View>
              ) : (
                <Text className="pt-2 text-sm text-gray-500">
                  Aucun favori en live pour le moment.
                </Text>
              )}

              {offlineRows.length > 0 ? (
                <View>
                  <SectionTitle label="Hors ligne" count={offlineRows.length} />
                  {offlineRows.map((streamer, index) => (
                    <Fragment key={streamer.twitch_id}>
                      {index > 0 ? <RowSeparator inset={32} /> : null}
                      <OfflineStreamerRow streamer={streamer} />
                    </Fragment>
                  ))}
                </View>
              ) : null}
            </>
          )}

          <ManageButton />
        </ScrollView>

        {/* Posée par-dessus, hors du flux : son repli ne redimensionne donc pas la liste. */}
        <View className="absolute left-0 right-0 top-0">
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher un favori"
            // Un seul favori en direct : il n'y a rien à classer, le rail disparaît.
            sorts={live.length > 1 ? SORTS : []}
            sort={sort}
            onSortChange={setSort}
            summary={{ live: rows.length, total: rows.length + offlineRows.length }}
            freshness={
              data ? { fetchedAt: data.source.fetchedAt, stale: data.source.stale } : undefined
            }
            hint={live.length > 1 ? SORT_HINTS[sort] : undefined}
            note={
              known < saved
                ? `${formatCount(saved - known)} favori(s) absent(s) de la liste officielle actuelle.`
                : undefined
            }
            compact={compact}
            onHeights={(next) =>
              setHeights((prev) => ({
                expanded: next.expanded || prev.expanded,
                collapsed: next.collapsed || prev.collapsed,
              }))
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
