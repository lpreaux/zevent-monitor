import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DonationWindow } from '@/api/donations';
import {
  useDonationStats,
  useLargestDonations,
  useRecentDonations,
  useTopDonors,
} from '@/api/queries';
import { DonationRow } from '@/components/donation-row';
import { BarChart } from '@/components/bar-chart';
import { HorizontalBars, type HorizontalBar } from '@/components/horizontal-bars';
import { ObservedNotice } from '@/components/observed-notice';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { StatTile } from '@/components/stat-tile';
import { countryName, flagEmoji, medalFor, percentOf } from '@/lib/donations';
import { formatCount, formatEuros, formatEurosCompact, formatRelativeTime } from '@/lib/format';
import { useFavoritesStore } from '@/store/favorites';

type Section = 'feed' | 'top' | 'analysis';
type FeedFilter = 'all' | 'favorites' | 'big' | 'comments';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'feed', label: 'En direct' },
  { key: 'top', label: 'Classements' },
  { key: 'analysis', label: 'Analyse' },
];

const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'favorites', label: 'Favoris' },
  { key: 'big', label: '≥ 100 €' },
  { key: 'comments', label: 'Messages' },
];

const WINDOWS: { key: DonationWindow; label: string }[] = [
  { key: '1h', label: '1 h' },
  { key: '6h', label: '6 h' },
  { key: '24h', label: '24 h' },
  { key: 'all', label: 'Week-end' },
];

const BIG_DONATION_CENTS = 10_000;

function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-base font-bold text-white">{children}</Text>
      {right}
    </View>
  );
}

function Banner({ message }: { message: string }) {
  return (
    <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <Text className="text-sm text-amber-200">{message}</Text>
    </View>
  );
}

/** Onglet « En direct » : feed des derniers dons, filtrable. */
function FeedSection({ favorites }: { favorites: readonly string[] }) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const params = useMemo(() => {
    switch (filter) {
      case 'favorites':
        return { limit: 60, twitch: favorites.length ? [...favorites] : ['__none__'] };
      case 'big':
        return { limit: 60, minCents: BIG_DONATION_CENTS };
      case 'comments':
        return { limit: 60, withComment: true };
      default:
        return { limit: 60 };
    }
  }, [filter, favorites]);

  const query = useRecentDonations(params);
  const onRefresh = useCallback(() => void query.refetch(), [query]);

  if (query.isLoading && !query.data) return <LoadingState label="Chargement des dons…" />;
  if (query.isError && !query.data) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Backend injoignable'}
        onRetry={onRefresh}
      />
    );
  }

  const donations = query.data?.donations ?? [];

  return (
    <FlatList
      data={donations}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <DonationRow
          donation={item}
          highlightCents={BIG_DONATION_CENTS}
          favorite={item.twitch ? favoriteSet.has(item.twitch) : false}
        />
      )}
      contentContainerClassName="gap-2 px-5 pb-10"
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
      }
      ListHeaderComponent={
        <View className="gap-3 pb-3">
          <Segmented options={FEED_FILTERS} value={filter} onChange={setFilter} />
          {query.isError ? <Banner message="Feed momentanément indisponible — derniers dons connus." /> : null}
          {filter === 'favorites' && favorites.length === 0 ? (
            <Text className="text-xs text-gray-500">
              Aucun favori : ajoutez des streamers depuis l’onglet Streamers pour filtrer leurs dons.
            </Text>
          ) : null}
          <ObservedNotice observed={query.data?.observed} prefix="Feed établi" />
        </View>
      }
      ListEmptyComponent={<EmptyState message="Aucun don observé pour ce filtre." />}
    />
  );
}

/** Onglet « Classements » : top donateurs nominatifs et plus gros dons. */
function TopSection({ favorites }: { favorites: readonly string[] }) {
  const [window, setWindow] = useState<DonationWindow>('24h');
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const topQuery = useTopDonors(window, 20);
  const largestQuery = useLargestDonations(window, 10);

  const onRefresh = useCallback(() => {
    void topQuery.refetch();
    void largestQuery.refetch();
  }, [topQuery, largestQuery]);

  const loading = !topQuery.data && !largestQuery.data && (topQuery.isLoading || largestQuery.isLoading);
  if (loading) return <LoadingState label="Calcul des classements…" />;
  if (!topQuery.data && !largestQuery.data && (topQuery.isError || largestQuery.isError)) {
    return <ErrorState message="Backend injoignable" onRetry={onRefresh} />;
  }

  const donors = topQuery.data?.donors ?? [];
  const maxTotal = donors[0]?.totalCents ?? 0;

  return (
    <ScrollView
      contentContainerClassName="gap-6 px-5 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={topQuery.isRefetching || largestQuery.isRefetching}
          onRefresh={onRefresh}
          tintColor="#a78bfa"
        />
      }
    >
      <Segmented options={WINDOWS} value={window} onChange={setWindow} />

      <View className="gap-3">
        <Title>Top donateurs</Title>
        <Text className="text-xs text-gray-500">
          Cumul par nom affiché, dons anonymes exclus. Un même nom peut regrouper plusieurs personnes.
        </Text>
        {donors.length === 0 ? (
          <EmptyState message="Aucun don nominatif observé sur cette période." />
        ) : (
          <View className="gap-2">
            {donors.map((donor) => {
              const ratio = maxTotal > 0 ? donor.totalCents / maxTotal : 0;
              const medal = medalFor(donor.rank);
              return (
                <View
                  key={`${donor.rank}-${donor.donor}`}
                  className={`gap-1.5 rounded-2xl border p-3 ${
                    donor.rank <= 3 ? 'border-amber-500/30 bg-amber-500/5' : 'border-gray-800 bg-gray-900/50'
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="w-7 text-center text-sm font-bold text-gray-400">
                      {medal ?? donor.rank}
                    </Text>
                    <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={1}>
                      {donor.donor}
                    </Text>
                    <Text className="text-base font-bold text-zevent-300">
                      {formatEuros(donor.totalCents / 100)}
                    </Text>
                  </View>
                  <View className="ml-9 h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <View className="h-full rounded-full bg-zevent-500" style={{ width: `${ratio * 100}%` }} />
                  </View>
                  <Text className="ml-9 text-xs text-gray-500">
                    {donor.count} don{donor.count > 1 ? 's' : ''} · plus gros {formatEuros(donor.largestCents / 100)} ·
                    dernier {formatRelativeTime(donor.lastAt)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <ObservedNotice observed={topQuery.data?.observed} prefix="Classement établi" />
      </View>

      <View className="gap-3">
        <Title>Plus gros dons</Title>
        {largestQuery.data?.donations.length ? (
          largestQuery.data.donations.map((donation, index) => (
            <DonationRow
              key={donation.id}
              donation={donation}
              rank={index + 1}
              highlightCents={Number.POSITIVE_INFINITY}
              favorite={donation.twitch ? favoriteSet.has(donation.twitch) : false}
            />
          ))
        ) : (
          <EmptyState message="Aucun don observé sur cette période." />
        )}
      </View>
    </ScrollView>
  );
}

/** Onglet « Analyse » : distribution des montants, statistiques et pays. */
function AnalysisSection() {
  const [window, setWindow] = useState<DonationWindow>('all');
  const query = useDonationStats(window);
  const onRefresh = useCallback(() => void query.refetch(), [query]);

  if (query.isLoading && !query.data) return <LoadingState label="Analyse des dons…" />;
  if (query.isError && !query.data) {
    return <ErrorState message="Backend injoignable" onRetry={onRefresh} />;
  }

  const data = query.data;
  const summary = data?.summary;
  const totalCount = summary?.count ?? 0;

  const distributionBars = (data?.distribution ?? []).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    value: bucket.count,
    hint: `${percentOf(bucket.count, totalCount)} % des dons · ${formatEurosCompact(bucket.totalCents / 100)}`,
  }));

  const amountShareBars: HorizontalBar[] = (data?.distribution ?? [])
    .filter((bucket) => bucket.totalCents > 0)
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: bucket.totalCents,
      valueLabel: `${percentOf(bucket.totalCents, summary?.totalCents ?? 0)} %`,
      hint: `${formatEuros(bucket.totalCents / 100)} sur ${formatCount(bucket.count)} dons`,
    }));

  const known = (data?.countries ?? []).filter((c) => c.country !== null);
  const unknown = (data?.countries ?? []).find((c) => c.country === null);
  const countryBars: HorizontalBar[] = known.map((entry) => ({
    key: entry.country ?? '?',
    label: `${flagEmoji(entry.country)} ${countryName(entry.country)}`.trim(),
    value: entry.count,
    valueLabel: `${percentOf(entry.count, totalCount)} %`,
    hint: `${formatCount(entry.count)} dons · ${formatEurosCompact(entry.totalCents / 100)}`,
  }));

  return (
    <ScrollView
      contentContainerClassName="gap-6 px-5 pb-10"
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
      }
    >
      <Segmented options={WINDOWS} value={window} onChange={setWindow} />

      <View className="gap-3">
        <Title>Dons observés</Title>
        <View className="flex-row gap-3">
          <StatTile label="Dons" value={formatCount(totalCount)} hint={summary?.withComment ? `${formatCount(summary.withComment)} avec message` : undefined} />
          <StatTile label="Total observé" value={formatEurosCompact((summary?.totalCents ?? 0) / 100)} />
        </View>
        <View className="flex-row gap-3">
          <StatTile label="Don médian" value={summary?.medianCents != null ? formatEuros(summary.medianCents / 100) : '—'} />
          <StatTile label="Don moyen" value={summary?.meanCents != null ? formatEuros(summary.meanCents / 100) : '—'} />
        </View>
        <ObservedNotice
          observed={summary ? { count: summary.count, totalCents: summary.totalCents, firstAt: summary.firstAt, lastAt: summary.lastAt } : undefined}
          prefix="Analyse établie"
        />
      </View>

      <View className="gap-3">
        <Title>Distribution des montants</Title>
        <Text className="text-xs text-gray-500">Nombre de dons par tranche. Tapez une barre pour le détail.</Text>
        <BarChart bars={distributionBars} height={150} formatValue={(v) => `${formatCount(v)} dons`} />
      </View>

      <View className="gap-3">
        <Title>Part du total par tranche</Title>
        <HorizontalBars bars={amountShareBars} emptyMessage="Aucun don observé." />
      </View>

      <View className="gap-3">
        <Title>Pays des donateurs</Title>
        <HorizontalBars
          bars={countryBars}
          color="#f59e0b"
          emptyMessage="Pays inconnu pour les dons observés jusqu’ici."
        />
        {unknown ? (
          <Text className="text-xs text-gray-600">
            {formatCount(unknown.count)} dons sans pays renseigné (dons archivés avant la prise en compte du pays, ou non communiqué).
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function DonationsScreen() {
  const [section, setSection] = useState<Section>('feed');
  const favorites = useFavoritesStore((s) => s.favorites);

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <View className="px-5 pb-3 pt-4">
        <Segmented options={SECTIONS} value={section} onChange={setSection} />
      </View>
      {section === 'feed' ? (
        <FeedSection favorites={favorites} />
      ) : section === 'top' ? (
        <TopSection favorites={favorites} />
      ) : (
        <AnalysisSection />
      )}
    </SafeAreaView>
  );
}
