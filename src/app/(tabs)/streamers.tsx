import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';

import { sortStreamers, useMomentum, useZeventState, type StreamerSort } from '@/api/queries';
import { AppHeader } from '@/components/app-header';
import { ScreenShell } from '@/components/screen-shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { SourceFreshness } from '@/components/source-freshness';
import { StreamerRow } from '@/components/streamer-row';
import { formatCount } from '@/lib/format';

const SORTS: { key: StreamerSort; label: string }[] = [
  { key: 'donation', label: 'Cagnotte' },
  { key: 'viewers', label: 'Viewers' },
  { key: 'live', label: 'En live' },
  { key: 'momentum', label: 'En forme' },
];

/** Fenêtre du tri « en forme » : progression de la cagnotte sur la dernière heure. */
const MOMENTUM_WINDOW_MINUTES = 60;

export default function StreamersScreen() {
  const { data, isError, error, refetch, isRefetching } = useZeventState();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<StreamerSort>('donation');

  const onRefresh = useCallback(() => void refetch(), [refetch]);

  const momentumQuery = useMomentum(MOMENTUM_WINDOW_MINUTES, 50);
  const momentum = useMemo(
    () => new Map((momentumQuery.data?.streamers ?? []).map((item) => [item.twitch, item.deltaCents])),
    [momentumQuery.data],
  );

  const streamers = useMemo(
    () => (data ? sortStreamers(data.data.live, sort, search, momentum) : []),
    [data, sort, search, momentum],
  );

  const liveCount = data ? data.data.live.filter((s) => s.online).length : 0;
  const header = (
    <AppHeader
      title="Streamers"
      subtitle={
        data
          ? `${formatCount(liveCount)} en live · ${formatCount(data.data.live.length)} inscrits`
          : 'Liste officielle du ZEvent'
      }
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
      <FlatList
        data={streamers}
        keyExtractor={(item) => item.twitch_id}
        renderItem={({ item }) => <StreamerRow streamer={item} />}
        contentContainerClassName="gap-2 px-5 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#a78bfa" />
        }
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un streamer"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-base text-white"
            />
            <Segmented options={SORTS} value={sort} onChange={setSort} />
            <SourceFreshness fetchedAt={data.source.fetchedAt} stale={data.source.stale} />
            {sort === 'momentum' ? (
              <Text className="text-xs text-gray-500">
                Classés par progression de la cagnotte sur la dernière heure (50 premiers), puis par cagnotte.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            message={search ? 'Aucun streamer ne correspond à cette recherche.' : 'Aucun streamer.'}
          />
        }
      />
    </ScreenShell>
  );
}
