import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';

import type { Donation, DonationWindow, RecentDonationsResponse } from '@/api/donations';
import {
  donationFeedKey,
  useDonationFeed,
  useDonationStats,
  useLargestDonations,
  useTopDonors,
} from '@/api/queries';
import { AppHeader, type HeaderAction } from '@/components/app-header';
import { icons } from '@/lib/icons';
import { BarChart } from '@/components/bar-chart';
import { DonationLine, DONATION_LINE_INSET } from '@/components/donation-line';
import { DonorIdentity } from '@/components/donor-identity';
import { DonorRow } from '@/components/donor-row';
import { HorizontalBars, type HorizontalBar } from '@/components/horizontal-bars';
import { ListControls, useFloatingControls } from '@/components/list-controls';
import { Metric, MetricDivider } from '@/components/metric';
import { NewItemsPill } from '@/components/new-items-pill';
import { ObservedChip } from '@/components/observed-chip';
import { RowSeparator } from '@/components/row-separator';
import { ScreenShell } from '@/components/screen-shell';
import { EmptyState, ErrorState } from '@/components/screen-state';
import { SectionHeader } from '@/components/section-header';
import { SectionLink } from '@/components/section-link';
import { Segmented } from '@/components/segmented';
import { DonationsSkeleton } from '@/components/skeleton';
import { StackedBar } from '@/components/stacked-bar';
import { ToggleChip } from '@/components/toggle-chip';
import {
  buildDonationShareText,
  countryName,
  donationPulse,
  donorKey,
  flagEmoji,
  foldText,
  matchesDonation,
  percentOf,
  spanLabel,
} from '@/lib/donations';
import {
  formatCount,
  formatEuros,
  formatEurosCompact,
  formatPercent,
} from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useNow } from '@/lib/use-now';
import { BIG_DONATION_STEPS_CENTS, useDonationsPrefs } from '@/store/donations';
import { useFavoritesStore } from '@/store/favorites';

type Section = 'feed' | 'top' | 'analysis';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'feed', label: 'En direct' },
  { key: 'top', label: 'Classements' },
  { key: 'analysis', label: 'Analyse' },
];

const WINDOWS: { key: DonationWindow; label: string }[] = [
  { key: '1h', label: '1 h' },
  { key: '6h', label: '6 h' },
  { key: '24h', label: '24 h' },
  { key: 'all', label: 'Week-end' },
];

/** Fenêtre en toutes lettres, pour les phrases qui la citent. */
const WINDOW_LABELS: Record<DonationWindow, string> = {
  '1h': 'sur la dernière heure',
  '6h': 'sur les 6 dernières heures',
  '24h': 'sur les 24 dernières heures',
  all: 'depuis le début du week-end',
};

/** Une frappe rapide ne doit filtrer la liste qu'une fois. */
const SEARCH_DEBOUNCE_MS = 180;

/** Profondeur du classement chargé : le maximum servi par le backend, pour que la recherche porte loin. */
const TOP_DONORS_DEPTH = 100;

/** Places montrées avant dépliage : au-delà, le classement cesse d'être lisible d'un trait. */
const TOP_DONORS_VISIBLE = 25;

/** Défilement à partir duquel les nouveaux dons s'annoncent au lieu de s'insérer sous les yeux. */
const NEW_ITEMS_FROM = 220;

/** Fenêtre de mesure du rythme du feed. */
const PULSE_WINDOW_MS = 10 * 60_000;

/**
 * Respiration entre le bas de la barre de commandes et le contenu. La réserve laissée en
 * tête de liste vaut exactement la hauteur de la barre : sans ce supplément, la première
 * ligne vient se coller contre son filet.
 */
const CONTENT_GAP = 8;

function shareDonation(donation: Donation) {
  void Share.share({ message: buildDonationShareText(donation, donation.twitch) });
}

/** Tri des paramètres de route, qui portent la section et la fenêtre (donc les liens entrants). */
function readParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly { key: T }[],
  fallback: T,
): T {
  const key = Array.isArray(value) ? value[0] : value;
  return allowed.some((option) => option.key === key) ? (key as T) : fallback;
}

/* -------------------------------------------------------------------------- */
/* En direct                                                                   */
/* -------------------------------------------------------------------------- */

interface FeedSectionProps {
  favorites: readonly string[];
  /** Feed restreint à un streamer, depuis sa fiche. */
  streamer: string | null;
  onClearStreamer: () => void;
}

/**
 * Le feed des dons, seul endroit de l'app qui se lit comme un direct.
 *
 * Trois choses le distinguent d'une liste ordinaire : il s'allonge par le haut tout seul,
 * il se pagine par le bas sur un curseur serveur, et ses filtres se cumulent — « les
 * messages, au-dessus de 100 €, chez mes favoris » se pose d'un seul tenant.
 */
function FeedSection({ favorites, streamer, onClearStreamer }: FeedSectionProps) {
  const router = useRouter();
  const client = useQueryClient();
  const now = useNow(15_000);
  const listRef = useRef<FlatList<Donation>>(null);

  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [messagesOnly, setMessagesOnly] = useState(false);
  const [bigOnly, setBigOnly] = useState(false);
  const [search, setSearch] = useState('');
  const needle = foldText(useDebouncedValue(search, SEARCH_DEBOUNCE_MS));

  const thresholdCents = useDonationsPrefs((s) => s.thresholdCents);
  const setThresholdCents = useDonationsPrefs((s) => s.setThresholdCents);
  const donorName = useDonationsPrefs((s) => s.donorName);

  const controls = useFloatingControls();
  const [scrolled, setScrolled] = useState(false);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const mineKey = donorName ? donorKey(donorName) : null;

  const params = useMemo(() => {
    const logins = streamer
      ? [streamer]
      : favoritesOnly
        ? // Filtre demandé sans aucun favori : un login impossible vide la liste, plutôt
          // que de rendre tout le feed sous un filtre qui prétend le restreindre.
          favorites.length > 0
          ? [...favorites]
          : ['__none__']
        : undefined;
    return {
      twitch: logins,
      minCents: bigOnly ? thresholdCents : undefined,
      withComment: messagesOnly || undefined,
    };
  }, [streamer, favoritesOnly, favorites, bigOnly, thresholdCents, messagesOnly]);

  const query = useDonationFeed(params);
  const pages = query.data?.pages;

  const donations = useMemo(() => pages?.flatMap((page) => page.donations) ?? [], [pages]);
  const observed = pages?.[0]?.observed;
  const visible = useMemo(
    () => (needle ? donations.filter((donation) => matchesDonation(donation, needle)) : donations),
    [donations, needle],
  );

  // Rythme mesuré sur la seule tête du feed : charger l'historique allongerait la fenêtre
  // vers le passé, et le « par minute » ne parlerait plus du moment présent.
  const pulse = useMemo(
    () => donationPulse(pages?.[0]?.donations ?? [], now, PULSE_WINDOW_MS),
    [pages, now],
  );

  // Dons arrivés pendant qu'on lisait plus bas. La liste ne bouge pas sous les yeux : la
  // pastille les annonce, et le retour en tête les découvre.
  const newest = donations[0]?.id;
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const newCount = useMemo(() => {
    if (!scrolled || !anchor) return 0;
    const index = donations.findIndex((donation) => donation.id === anchor);
    return index > 0 ? index : 0;
  }, [donations, scrolled, anchor]);

  // Ne s'anime que ce qui n'a jamais été rendu : sans cette mémoire, chaque relève ferait
  // clignoter tout l'écran, et chaque pas de défilement ferait entrer des dons vieux d'une heure.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const donation of donations) seen.current.add(donation.id);
  }, [donations]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      controls.onScroll(event);
      const away = event.nativeEvent.contentOffset.y > NEW_ITEMS_FROM;
      if (away === scrolled) return;
      // On quitte le haut : la tête d'alors devient le repère à partir duquel compter.
      if (away) setAnchor(newest);
      setScrolled(away);
    },
    [controls, scrolled, newest],
  );

  const backToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setScrolled(false);
  }, []);

  // Rafraîchir, c'est revenir au direct : les pages d'historique sont relâchées, sans quoi
  // React Query les rejouerait toutes et recollerait mal deux fenêtres qui ont bougé.
  const onRefresh = useCallback(() => {
    client.setQueryData<InfiniteData<RecentDonationsResponse, string | undefined>>(
      donationFeedKey(params),
      (data) =>
        data && data.pages.length > 1
          ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
          : data,
    );
    void query.refetch();
  }, [client, params, query]);

  const filters = (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        {streamer ? (
          <ToggleChip
            label={streamer}
            active
            icon="person"
            onPress={onClearStreamer}
            onRemove={onClearStreamer}
            accessibilityLabel={`Dons reçus par ${streamer}`}
          />
        ) : null}
        <ToggleChip
          label="Messages"
          icon="chatbubble-ellipses-outline"
          active={messagesOnly}
          onPress={() => setMessagesOnly((current) => !current)}
        />
        {BIG_DONATION_STEPS_CENTS.map((cents) => {
          const active = bigOnly && thresholdCents === cents;
          return (
            <ToggleChip
              key={cents}
              label={`≥ ${formatEurosCompact(cents / 100)}`}
              active={active}
              // Le même geste choisit le seuil et l'applique : un seuil réglé sans être
              // appliqué serait un réglage invisible de plus.
              onPress={() => {
                setThresholdCents(cents);
                setBigOnly(!active);
              }}
            />
          );
        })}
      </View>

      {/* Ne s'affiche qu'un seuil posé : hors de ce moment-là, le raccourci ne répond à
          aucune question, et la cloche de la barre du haut mène déjà aux mêmes réglages. */}
      {bigOnly ? (
        <Pressable
          onPress={() => router.push('/settings/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les réglages des notifications de gros dons"
          hitSlop={8}
          className="flex-row items-center gap-1.5 self-start active:opacity-60"
        >
          <Ionicons name="notifications-outline" size={12} color="#c4b5fd" />
          <Text className="text-[11px] font-semibold text-zevent-300">
            M’alerter au-delà de {formatEurosCompact(thresholdCents / 100)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const summary = pulse
    ? `${formatCount(visible.length)} dons · ${pulse.perMinute.toFixed(1).replace('.', ',')}/min · ${formatEurosCompact(pulse.centsPerMinute / 100)}/min`
    : `${formatCount(visible.length)} dons affichés`;

  // Une liste vide se raconte d'une seule façon à la fois : ou bien elle charge, ou bien
  // la source est injoignable, ou bien le filtre ne trouve rien. Empiler les trois
  // messages, comme le faisait le montage précédent, ne dit plus lequel est le bon.
  const nothing = donations.length === 0;
  const failed = query.isError && nothing;
  const empty =
    query.isLoading || failed ? null : (
      <EmptyState
        message={
          needle
            ? `Aucun don ne correspond à « ${search.trim()} » dans ce qui est chargé.`
            : favoritesOnly && favorites.length === 0
              ? 'Aucun favori : ajoutez des streamers pour filtrer leurs dons.'
              : 'Aucun don observé pour ce filtre.'
        }
      />
    );

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: controls.paddingTop + CONTENT_GAP,
          paddingHorizontal: 18,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={12}
        windowSize={9}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={onRefresh}
            tintColor="#a78bfa"
            progressViewOffset={controls.paddingTop}
          />
        }
        ItemSeparatorComponent={() => <RowSeparator inset={DONATION_LINE_INSET} />}
        renderItem={({ item }) => (
          <Animated.View entering={seen.current.has(item.id) ? undefined : FadeIn.duration(280)}>
            <DonationLine
              donation={item}
              highlightCents={thresholdCents}
              favorite={item.twitch ? favoriteSet.has(item.twitch) : false}
              mine={mineKey !== null && donorKey(item.donor) === mineKey && !item.anonymous}
              messageFirst={messagesOnly}
              now={now}
              onShare={shareDonation}
            />
          </Animated.View>
        )}
        ListHeaderComponent={
          query.isLoading ? (
            <DonationsSkeleton />
          ) : failed ? (
            <View className="pt-8">
              <Text className="text-center text-sm text-gray-300">
                {query.error instanceof Error ? query.error.message : 'Backend injoignable'}
              </Text>
              <SectionLink label="Réessayer" onPress={onRefresh} />
            </View>
          ) : null
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          query.isLoading || failed ? null : (
            <View className="gap-3 pt-4">
              {query.isFetchingNextPage ? (
                <Text className="text-center text-[11px] text-gray-600">Chargement…</Text>
              ) : !query.hasNextPage && donations.length > 0 ? (
                <Text className="text-center text-[11px] text-gray-600">
                  Fin des dons observés.
                </Text>
              ) : null}
              <ObservedChip observed={observed} subject="Ce feed" />
            </View>
          )
        }
      />

      {/* Posée par-dessus, hors du flux : son repli ne redimensionne donc pas la liste. */}
      <View className="absolute left-0 right-0 top-0">
        <ListControls
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Nom d’un donateur, mot d’un message"
          toggle={
            streamer
              ? undefined
              : {
                  active: favoritesOnly,
                  onPress: () => setFavoritesOnly((current) => !current),
                  icon: 'star-outline',
                  activeIcon: 'star',
                  label: 'N’afficher que les dons de mes favoris',
                }
          }
          extra={filters}
          summary={summary}
          hint={
            messagesOnly
              ? 'Mur des messages : les commentaires passent devant, en entier.'
              : pulse
                ? `Rythme mesuré sur ${spanLabel(pulse.spanMs)} du feed affiché.`
                : undefined
          }
          note={
            needle
              ? 'La recherche porte sur les dons déjà chargés : descendez pour en charger davantage.'
              : undefined
          }
          compact={controls.compact}
          onHeights={controls.onHeights}
        />
      </View>

      {/* Sous la barre, jamais dessous : c'est une annonce, elle doit rester lisible. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, top: controls.paddingTop + 8 }}
      >
        <NewItemsPill count={newCount} onPress={backToTop} noun="nouveau don" />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Classements                                                                 */
/* -------------------------------------------------------------------------- */

function TopSection({
  favorites,
  windowKey,
  onWindowChange,
}: {
  favorites: readonly string[];
  windowKey: DonationWindow;
  onWindowChange: (key: DonationWindow) => void;
}) {
  const now = useNow();
  const controls = useFloatingControls();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const needle = foldText(useDebouncedValue(search, SEARCH_DEBOUNCE_MS));

  const donorName = useDonationsPrefs((s) => s.donorName);
  const mineKey = donorName ? donorKey(donorName) : null;
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const scope = favoritesOnly && favorites.length > 0 ? favorites : undefined;

  const topQuery = useTopDonors(windowKey, TOP_DONORS_DEPTH);
  const largestQuery = useLargestDonations(windowKey, 10, scope);
  // Le record ne dépend pas de la fenêtre choisie : c'est le repère fixe du week-end.
  const recordQuery = useLargestDonations('all', 1, scope);

  const onRefresh = useCallback(() => {
    void topQuery.refetch();
    void largestQuery.refetch();
    void recordQuery.refetch();
  }, [topQuery, largestQuery, recordQuery]);

  const donors = useMemo(() => topQuery.data?.donors ?? [], [topQuery.data]);
  const maxTotal = donors[0]?.totalCents ?? 0;
  const standing = useMemo(
    () => (mineKey ? (donors.find((donor) => donorKey(donor.donor) === mineKey) ?? null) : null),
    [donors, mineKey],
  );
  const matching = useMemo(
    () => (needle ? donors.filter((donor) => foldText(donor.donor).includes(needle)) : donors),
    [donors, needle],
  );
  const shown = needle || expanded ? matching : matching.slice(0, TOP_DONORS_VISIBLE);
  const record = recordQuery.data?.donations[0];

  const loading =
    !topQuery.data && !largestQuery.data && (topQuery.isLoading || largestQuery.isLoading);
  if (!topQuery.data && !largestQuery.data && (topQuery.isError || largestQuery.isError)) {
    return <ErrorState message="Backend injoignable" onRetry={onRefresh} />;
  }

  // Tant que rien n'est arrivé, la page ne montre que la forme de ce qui vient : des
  // sections vides annonceraient « aucun don » alors qu'on n'a encore rien demandé.
  if (loading) {
    return (
      <View className="flex-1">
        <View style={{ paddingTop: controls.paddingTop, paddingHorizontal: 18 }}>
          <DonationsSkeleton rows={6} />
        </View>
        <View className="absolute left-0 right-0 top-0">
          <ListControls
            sorts={WINDOWS}
            sort={windowKey}
            onSortChange={onWindowChange}
            summary="Chargement des classements…"
            compact={controls.compact}
            onHeights={controls.onHeights}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={{
          gap: 28,
          paddingTop: controls.paddingTop + CONTENT_GAP,
          paddingHorizontal: 18,
          paddingBottom: 40,
        }}
        onScroll={controls.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={topQuery.isRefetching || largestQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor="#a78bfa"
            progressViewOffset={controls.paddingTop}
          />
        }
      >
        {record ? (
          <View className="gap-2">
            <SectionHeader
              title="Record du week-end"
              hint={
                favoritesOnly
                  ? 'Le plus gros don observé chez vos favoris'
                  : 'Le plus gros don observé depuis le début'
              }
            />
            <View className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.07] px-2 py-1">
              <DonationLine
                donation={record}
                highlightCents={Number.POSITIVE_INFINITY}
                favorite={record.twitch ? favoriteSet.has(record.twitch) : false}
                mine={mineKey !== null && donorKey(record.donor) === mineKey && !record.anonymous}
                now={now}
                onShare={shareDonation}
              />
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <SectionHeader
            title="Top donateurs"
            hint={`Cumul par nom affiché ${WINDOW_LABELS[windowKey]}, dons anonymes exclus.`}
            accessory={
              donors.length > 0 ? (
                <Text className="text-xs text-gray-500">{formatCount(donors.length)} classés</Text>
              ) : null
            }
          />

          {shown.length === 0 ? (
            <EmptyState
              message={
                needle
                  ? `Aucun donateur ne correspond à « ${search.trim()} » dans les ${formatCount(TOP_DONORS_DEPTH)} premiers.`
                  : 'Aucun don nominatif observé sur cette période.'
              }
            />
          ) : (
            <View>
              {shown.map((donor, index) => (
                <View key={`${donor.rank}-${donor.donor}`}>
                  {index > 0 ? <RowSeparator inset={34} /> : null}
                  <DonorRow
                    donor={donor}
                    intensity={maxTotal > 0 ? donor.totalCents / maxTotal : 0}
                    lead={donor.rank <= 3}
                    mine={mineKey !== null && donorKey(donor.donor) === mineKey}
                    now={now}
                  />
                </View>
              ))}
            </View>
          )}

          {!needle && matching.length > TOP_DONORS_VISIBLE ? (
            <SectionLink
              label={
                expanded
                  ? 'Réduire le classement'
                  : `Voir les ${formatCount(matching.length - TOP_DONORS_VISIBLE)} suivants`
              }
              onPress={() => setExpanded((current) => !current)}
            />
          ) : null}

          <DonorIdentity
            standing={standing}
            depth={donors.length || TOP_DONORS_DEPTH}
            windowLabel={WINDOW_LABELS[windowKey]}
          />
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Plus gros dons"
            hint={`Les dix plus gros dons observés ${WINDOW_LABELS[windowKey]}${
              favoritesOnly ? ', chez vos favoris' : ''
            }.`}
          />
          {largestQuery.data?.donations.length ? (
            <View>
              {largestQuery.data.donations.map((donation, index) => (
                <View key={donation.id}>
                  {index > 0 ? <RowSeparator inset={DONATION_LINE_INSET} /> : null}
                  <DonationLine
                    donation={donation}
                    rank={index + 1}
                    highlightCents={Number.POSITIVE_INFINITY}
                    favorite={donation.twitch ? favoriteSet.has(donation.twitch) : false}
                    mine={
                      mineKey !== null && donorKey(donation.donor) === mineKey && !donation.anonymous
                    }
                    now={now}
                    onShare={shareDonation}
                  />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState message="Aucun don observé sur cette période." />
          )}
        </View>

        <ObservedChip observed={topQuery.data?.observed} subject="Ces classements" />
      </ScrollView>

      <View className="absolute left-0 right-0 top-0">
        <ListControls
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher un donateur"
          sorts={WINDOWS}
          sort={windowKey}
          onSortChange={onWindowChange}
          toggle={{
            active: favoritesOnly,
            onPress: () => setFavoritesOnly((current) => !current),
            icon: 'star-outline',
            activeIcon: 'star',
            label: 'Limiter les plus gros dons à mes favoris',
          }}
          summary={`${formatCount(shown.length)} donateurs affichés ${WINDOW_LABELS[windowKey]}`}
          hint={
            favoritesOnly
              ? 'Le filtre favoris porte sur les plus gros dons : un donateur, lui, n’appartient à aucun streamer.'
              : 'Un même nom peut regrouper plusieurs personnes.'
          }
          note={
            favoritesOnly && favorites.length === 0
              ? 'Aucun favori enregistré : le filtre reste sans effet.'
              : undefined
          }
          compact={controls.compact}
          onHeights={controls.onHeights}
        />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Analyse                                                                     */
/* -------------------------------------------------------------------------- */

function AnalysisSection({
  favorites,
  windowKey,
  onWindowChange,
}: {
  favorites: readonly string[];
  windowKey: DonationWindow;
  onWindowChange: (key: DonationWindow) => void;
}) {
  const controls = useFloatingControls();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const scope = favoritesOnly && favorites.length > 0 ? favorites : undefined;
  const query = useDonationStats(windowKey, scope);
  const onRefresh = useCallback(() => void query.refetch(), [query]);

  const data = query.data;
  const summary = data?.summary;
  const totalCount = summary?.count ?? 0;

  if (query.isError && !data) {
    return <ErrorState message="Backend injoignable" onRetry={onRefresh} />;
  }

  // Voir « 0 don, médiane — » pendant le chargement laisserait croire à une absence de
  // dons : tant que rien n'est arrivé, on ne montre que la forme de ce qui vient.
  if (!data) {
    return (
      <View className="flex-1">
        <View style={{ paddingTop: controls.paddingTop, paddingHorizontal: 18 }}>
          <DonationsSkeleton rows={6} />
        </View>
        <View className="absolute left-0 right-0 top-0">
          <ListControls
            sorts={WINDOWS}
            sort={windowKey}
            onSortChange={onWindowChange}
            summary="Analyse en cours…"
            compact={controls.compact}
            onHeights={controls.onHeights}
          />
        </View>
      </View>
    );
  }

  const distributionBars = (data?.distribution ?? []).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    value: bucket.count,
    hint: `${percentOf(bucket.count, totalCount)} % des dons · ${formatEurosCompact(bucket.totalCents / 100)}`,
  }));

  const shareSegments = (data?.distribution ?? [])
    .filter((bucket) => bucket.totalCents > 0)
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: bucket.totalCents,
      hint: `${formatEurosCompact(bucket.totalCents / 100)} · ${formatCount(bucket.count)} dons`,
    }));

  const known = (data?.countries ?? []).filter((entry) => entry.country !== null);
  const unknown = (data?.countries ?? []).find((entry) => entry.country === null);
  // Rapportées aux seuls dons dont le pays est connu : la grande majorité n'en porte pas,
  // et diviser par tout le monde écrasait chaque pays à « 0 % » sauf la France.
  const knownCount = known.reduce((sum, entry) => sum + entry.count, 0);
  const countryBars: HorizontalBar[] = known.map((entry) => ({
    key: entry.country ?? '?',
    label: `${flagEmoji(entry.country)} ${countryName(entry.country)}`.trim(),
    value: entry.count,
    valueLabel: `${percentOf(entry.count, knownCount)} %`,
    hint: `${formatCount(entry.count)} dons · ${formatEurosCompact(entry.totalCents / 100)}`,
  }));

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={{
          gap: 28,
          paddingTop: controls.paddingTop + CONTENT_GAP,
          paddingHorizontal: 18,
          paddingBottom: 40,
        }}
        onScroll={controls.onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={onRefresh}
            tintColor="#a78bfa"
            progressViewOffset={controls.paddingTop}
          />
        }
      >
        <View className="gap-4">
          <SectionHeader
            title="Dons observés"
            hint={`Feed Streamlabs ${WINDOW_LABELS[windowKey]}${favoritesOnly ? ', chez vos favoris' : ''}.`}
          />
          <View className="flex-row items-start">
            <Metric label="Dons" value={formatCount(totalCount)} size="lg" />
            <MetricDivider />
            <Metric
              label="Total observé"
              value={formatEurosCompact((summary?.totalCents ?? 0) / 100)}
              size="lg"
            />
          </View>
          <View className="flex-row items-start">
            <Metric
              label="Don médian"
              value={summary?.medianCents != null ? formatEuros(summary.medianCents / 100) : '—'}
              hint="la moitié donne moins"
            />
            <MetricDivider />
            <Metric
              label="Don moyen"
              value={summary?.meanCents != null ? formatEuros(summary.meanCents / 100) : '—'}
              hint={
                summary?.maxCents != null
                  ? `plus gros ${formatEurosCompact(summary.maxCents / 100)}`
                  : undefined
              }
            />
          </View>
          {summary && summary.withComment > 0 ? (
            <Text className="text-[13px] text-gray-400">
              {formatPercent(summary.withComment / Math.max(1, summary.count))} des dons portent un
              message, soit {formatCount(summary.withComment)} sur {formatCount(summary.count)}.
            </Text>
          ) : null}
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Distribution des montants"
            hint="Nombre de dons par tranche. Tapez une barre pour le détail."
          />
          <BarChart bars={distributionBars} height={150} formatValue={(v) => `${formatCount(v)} dons`} />
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Qui fait le total"
            hint="Part de la somme observée apportée par chaque tranche."
          />
          <StackedBar segments={shareSegments} emptyMessage="Aucun don observé." />
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Pays des donateurs"
            hint={
              knownCount > 0
                ? `Part des ${formatCount(knownCount)} dons dont le pays est connu.`
                : 'Part des dons dont le pays est connu.'
            }
          />
          <HorizontalBars
            bars={countryBars}
            color="#f59e0b"
            emptyMessage="Pays inconnu pour les dons observés jusqu’ici."
          />
          {unknown ? (
            <Text className="text-[11px] text-gray-600">
              {formatCount(unknown.count)} dons sans pays renseigné (dons archivés avant sa prise en
              compte, ou non communiqué) — soit {formatPercent(unknown.count / Math.max(1, totalCount))}{' '}
              du total observé, et ils ne comptent pas dans les parts ci-dessus.
            </Text>
          ) : null}
        </View>

        <ObservedChip
          observed={
            summary
              ? {
                  count: summary.count,
                  totalCents: summary.totalCents,
                  firstAt: summary.firstAt,
                  lastAt: summary.lastAt,
                }
              : undefined
          }
          subject="Cette analyse"
        />
      </ScrollView>

      <View className="absolute left-0 right-0 top-0">
        <ListControls
          sorts={WINDOWS}
          sort={windowKey}
          onSortChange={onWindowChange}
          toggle={{
            active: favoritesOnly,
            onPress: () => setFavoritesOnly((current) => !current),
            icon: 'star-outline',
            activeIcon: 'star',
            label: 'N’analyser que les dons de mes favoris',
          }}
          summary={`${formatCount(totalCount)} dons analysés ${WINDOW_LABELS[windowKey]}`}
          note={
            favoritesOnly && favorites.length === 0
              ? 'Aucun favori enregistré : le filtre reste sans effet.'
              : undefined
          }
          compact={controls.compact}
          onHeights={controls.onHeights}
        />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Onglet « Dons ». Trois lectures d'une même matière : le direct, les classements, puis
 * l'analyse froide.
 *
 * Section et fenêtre vivent dans les paramètres de la route plutôt qu'en état local :
 * l'onglet reste monté d'une visite à l'autre, un aller-retour ne perd donc plus la
 * fenêtre choisie, et une fiche de streamer peut ouvrir le feed déjà filtré sur lui.
 */
export default function DonationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; window?: string; twitch?: string }>();
  const favorites = useFavoritesStore((s) => s.favorites);

  const section = readParam(params.section, SECTIONS, 'feed');
  const windowKey = readParam(params.window, WINDOWS, '24h');
  // Le filtre est retiré en vidant le paramètre plutôt qu'en le supprimant : une chaîne
  // vide traverse la navigation de la même façon partout.
  const raw = Array.isArray(params.twitch) ? params.twitch[0] : params.twitch;
  const streamer = raw && raw.length > 0 ? raw : null;

  const setSection = useCallback(
    (key: Section) => router.setParams({ section: key }),
    [router],
  );
  const setWindow = useCallback(
    (key: DonationWindow) => router.setParams({ window: key }),
    [router],
  );

  // Chiffre d'ensemble, partagé par les trois sections : c'est la même requête que celle de
  // l'analyse sur le week-end, elle ne coûte donc rien de plus la plupart du temps.
  const overall = useDonationStats('all').data?.summary;

  const headerActions = useMemo<HeaderAction[]>(
    () => [
      {
        icon: icons.settings,
        label: 'Réglages',
        onPress: () => router.push('/settings' as never),
      },
    ],
    [router],
  );

  return (
    <ScreenShell
      header={
        <AppHeader
          title="Dons"
          subtitle={
            overall && overall.count > 0
              ? `${formatCount(overall.count)} dons observés · ${formatEurosCompact(overall.totalCents / 100)}`
              : 'Feed Streamlabs du ZEvent'
          }
          actions={headerActions}
        />
      }
    >
      <View className="px-5 pb-2 pt-3">
        <Segmented options={SECTIONS} value={section} onChange={setSection} />
      </View>

      {section === 'feed' ? (
        <FeedSection
          favorites={favorites}
          streamer={streamer}
          onClearStreamer={() => router.setParams({ twitch: '' })}
        />
      ) : section === 'top' ? (
        <TopSection favorites={favorites} windowKey={windowKey} onWindowChange={setWindow} />
      ) : (
        <AnalysisSection favorites={favorites} windowKey={windowKey} onWindowChange={setWindow} />
      )}
    </ScreenShell>
  );
}
