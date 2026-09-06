import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useMomentum, useZeventState } from '@/api/queries';
import type { Streamer } from '@/api/types';
import { AppHeader, useSettingsAction } from '@/components/app-header';
import { FavoriteButton } from '@/components/favorite-button';
import { ListControls, useFloatingControls } from '@/components/list-controls';
import { LiveStreamerRow } from '@/components/live-streamer-row';
import { OfflineStreamerRow } from '@/components/offline-streamer-row';
import { RowSeparator } from '@/components/row-separator';
import { ScreenShell } from '@/components/screen-shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { SectionTitle } from '@/components/section-title';
import { formatCount } from '@/lib/format';
import {
  groupStreamers,
  searchStreamers,
  STREAMER_SORTS,
  STREAMER_SORT_HINTS,
  type StreamerGroupKey,
  type StreamerSort,
} from '@/lib/streamer-sort';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useLiveShows } from '@/lib/use-live-shows';
import { MOMENTUM_LIMIT } from '@/lib/use-ranked-favorites';
import { useFavoritesStore } from '@/store/favorites';

/** Fenêtre du tri « en forme » : progression de la cagnotte sur la dernière heure. */
const MOMENTUM_WINDOW_MINUTES = 60;

/** Une frappe rapide ne doit déclencher qu'un seul retri de la liste complète. */
const SEARCH_DEBOUNCE_MS = 180;

/**
 * Hauteurs fixes des cases de la liste. Elles seules permettent de lui donner un
 * `getItemLayout`, donc de sauter n'importe où dans plusieurs centaines d'entrées sans
 * mesurer ce qu'on traverse. Réglées un cran au-dessus de leur contenu : chaque ligne se
 * centre dans sa case au lieu de la remplir au pixel près, ce qui laisse le texte
 * grandir un peu sans rien décaler.
 */
const LIVE_ROW_HEIGHT = 68;
const OFFLINE_ROW_HEIGHT = 44;
const GROUP_HEADER_HEIGHT = 36;

/** Le module de tri décide de la structure, l'écran des mots. */
const GROUP_TITLES: Record<StreamerGroupKey, string> = {
  live: 'En direct',
  ranked: 'En forme sur la dernière heure',
  rest: 'Les autres directs, par cagnotte',
  offline: 'Hors ligne',
};

/** Périmètre de la liste : tout le plateau, ou seulement les streamers suivis. */
type Scope = 'all' | 'favorites';

interface StreamerSection {
  key: StreamerGroupKey;
  title: string;
  /** Gabarit de ligne du groupe : c'est lui qui fixe la hauteur des cases. */
  variant: 'live' | 'offline';
  data: Streamer[];
}

/** Tri porté par l'URL, ou le tri par défaut si le paramètre est absent ou inconnu. */
function sortFromParams(value: string | string[] | undefined): StreamerSort {
  const key = Array.isArray(value) ? value[0] : value;
  return STREAMER_SORTS.some((option) => option.key === key) ? (key as StreamerSort) : 'donation';
}

/** Périmètre porté par l'URL, comme le tri : voir `scope` plus bas. */
function scopeFromParams(value: string | string[] | undefined): Scope {
  return (Array.isArray(value) ? value[0] : value) === 'favorites' ? 'favorites' : 'all';
}

/**
 * Case de hauteur fixe autour d'une ligne. Le filet y est posé en absolu : compté dans
 * le flux, il ferait dériver d'un pixel par ligne les positions calculées plus bas.
 */
function Slot({
  height,
  separated,
  inset,
  children,
}: {
  height: number;
  separated: boolean;
  inset: number;
  children: ReactNode;
}) {
  return (
    <View style={{ height }} className="justify-center">
      {separated ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
          <RowSeparator inset={inset} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Table des positions attendue par `SectionList`. La liste est aplatie en
 * [intitulé, …lignes, pied] pour chaque groupe, et l'index reçu porte sur cette suite :
 * il faut donc réserver une case aux intitulés et une aux pieds — ces derniers de
 * hauteur nulle, puisqu'on n'en rend pas.
 */
function measure(sections: StreamerSection[]): { length: number; offset: number }[] {
  const slots: { length: number; offset: number }[] = [];
  let offset = 0;
  const push = (length: number) => {
    slots.push({ length, offset });
    offset += length;
  };

  for (const section of sections) {
    push(GROUP_HEADER_HEIGHT);
    const height = section.variant === 'live' ? LIVE_ROW_HEIGHT : OFFLINE_ROW_HEIGHT;
    for (let index = 0; index < section.data.length; index += 1) push(height);
    push(0);
  }
  return slots;
}

export default function StreamersScreen() {
  const { data, isError, error, refetch } = useZeventState();
  const [search, setSearch] = useState('');
  const params = useLocalSearchParams<{ sort?: string; scope?: string }>();
  const router = useRouter();

  // Le tri vit dans les paramètres de la route, pas dans un état local : l'onglet reste
  // monté d'une visite à l'autre, et un lien qui demande un tri précis (« Tout le
  // classement », depuis l'accueil) s'impose alors sans avoir à resynchroniser quoi que ce soit.
  const sort = sortFromParams(params.sort);
  const setSort = useCallback((key: StreamerSort) => router.setParams({ sort: key }), [router]);

  // Le périmètre suit la même règle depuis que l'écran « Mes favoris » a disparu : c'est
  // lui qui rend `?scope=favorites` adressable, et donc cet onglet capable de recevoir le
  // lien que l'accueil envoyait à une seconde liste.
  const scope = scopeFromParams(params.scope);
  const setScope = useCallback(
    (next: Scope) => router.setParams({ scope: next === 'favorites' ? 'favorites' : '' }),
    [router],
  );

  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const needle = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const controls = useFloatingControls();

  const favorites = useFavoritesStore((s) => s.favorites);
  const shows = useLiveShows();
  const headerActions = useSettingsAction();

  // Toujours demandé, quel que soit le tri : la progression ne sert pas qu'à classer,
  // elle s'affiche sur chaque ligne en direct.
  const momentumQuery = useMomentum(MOMENTUM_WINDOW_MINUTES, MOMENTUM_LIMIT);
  const momentum = useMemo(
    () =>
      new Map(
        (momentumQuery.data?.streamers ?? []).map((item) => [
          item.twitch.toLowerCase(),
          item.deltaCents,
        ]),
      ),
    [momentumQuery.data],
  );

  const sections = useMemo<StreamerSection[]>(() => {
    if (!data) return [];
    const mine = new Set(favorites);
    const pool =
      scope === 'favorites'
        ? data.data.live.filter((streamer) => mine.has(streamer.twitch.toLowerCase()))
        : data.data.live;

    return groupStreamers(searchStreamers(pool, needle), sort, momentum).map((group) => ({
      key: group.key,
      title: GROUP_TITLES[group.key],
      variant: group.key === 'offline' ? ('offline' as const) : ('live' as const),
      data: group.data,
    }));
  }, [data, favorites, scope, needle, sort, momentum]);

  const slots = useMemo(() => measure(sections), [sections]);
  const shown = useMemo(
    () => sections.reduce((total, section) => total + section.data.length, 0),
    [sections],
  );
  const shownLive = useMemo(
    () =>
      sections
        .filter((section) => section.variant === 'live')
        .reduce((total, section) => total + section.data.length, 0),
    [sections],
  );

  const liveCount = data ? data.data.live.filter((s) => s.online).length : 0;
  const header = (
    <AppHeader
      title={scope === 'favorites' ? 'Mes favoris' : 'Streamers'}
      subtitle={
        data
          ? `${formatCount(liveCount)} en live · ${formatCount(data.data.live.length)} inscrits`
          : 'Liste officielle du ZEvent'
      }
      actions={headerActions}
    />
  );

  if (!data) {
    return (
      <ScreenShell header={header}>
        {isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Backend injoignable'}
            onRetry={onRefresh}
          />
        ) : (
          <LoadingState label="Chargement des streamers…" />
        )}
      </ScreenShell>
    );
  }

  return (
    <ScreenShell header={header}>
      <View className="flex-1">
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.twitch_id}
          // La barre flottant par-dessus, c'est au contenu de commencer sous elle. Cette
          // réserve ne bouge jamais, même repliée : c'est tout l'intérêt du montage.
          contentContainerStyle={{
            paddingTop: controls.paddingTop,
            paddingHorizontal: 20,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          // Les intitulés de groupe iraient se coller sous la barre, donc hors de vue.
          stickySectionHeadersEnabled={false}
          onScroll={controls.onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({
            ...(slots[index] ?? { length: 0, offset: 0 }),
            index,
          })}
          initialNumToRender={14}
          windowSize={9}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#a78bfa"
              // Sans ce décalage, la roue de rafraîchissement tournerait derrière la barre.
              progressViewOffset={controls.paddingTop}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={{ height: GROUP_HEADER_HEIGHT }} className="justify-end pb-1">
              <SectionTitle label={section.title} count={section.data.length} />
            </View>
          )}
          renderItem={({ item, index, section }) =>
            section.variant === 'live' ? (
              <Slot height={LIVE_ROW_HEIGHT} separated={index > 0} inset={50}>
                <LiveStreamerRow
                  streamer={item}
                  deltaCents={momentum.get(item.twitch.toLowerCase()) ?? 0}
                  show={shows.get(item.twitch.toLowerCase())}
                  // Sur la liste complète, le geste qui compte est de suivre quelqu'un :
                  // regarder un direct se fait depuis l'accueil ou la fiche.
                  trailing={<FavoriteButton twitch={item.twitch} size="md" />}
                />
              </Slot>
            ) : (
              <Slot height={OFFLINE_ROW_HEIGHT} separated={index > 0} inset={32}>
                <OfflineStreamerRow
                  streamer={item}
                  trailing={<FavoriteButton twitch={item.twitch} size="sm" />}
                />
              </Slot>
            )
          }
          ListEmptyComponent={
            <EmptyState
              message={
                search
                  ? `Aucun streamer ne correspond à « ${search.trim()} ».`
                  : scope === 'favorites'
                    ? 'Aucun favori pour l’instant : touchez une étoile pour suivre un streamer.'
                    : 'Aucun streamer.'
              }
            />
          }
        />

        {/* Posée par-dessus, hors du flux : son repli ne redimensionne donc pas la liste.
            Dans le flux, chaque bascule décalait le contenu et perturbait l'offset de
            défilement — au point que la liste se croyait par moments revenue en haut. */}
        <View className="absolute left-0 right-0 top-0">
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher un streamer"
            sorts={STREAMER_SORTS}
            sort={sort}
            onSortChange={setSort}
            toggle={{
              active: scope === 'favorites',
              onPress: () => setScope(scope === 'favorites' ? 'all' : 'favorites'),
              icon: 'star-outline',
              activeIcon: 'star',
              label: 'N’afficher que mes favoris',
            }}
            summary={`${formatCount(shownLive)} en live sur ${formatCount(shown)}`}
            freshness={{
              fetchedAt: data.source.fetchedAt,
              stale: data.source.stale,
            }}
            hint={STREAMER_SORT_HINTS[sort]}
            note={
              sort === 'momentum'
                ? `Le classement s’arrête aux ${formatCount(MOMENTUM_LIMIT)} premiers de la dernière heure : au-delà, la progression n’est pas connue.`
                : undefined
            }
            compact={controls.compact}
            onHeights={controls.onHeights}
          />
        </View>
      </View>
    </ScreenShell>
  );
}
