import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sortStreamers, useMomentum, useZeventState, type StreamerSort } from '@/api/queries';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { SourceFreshness } from '@/components/source-freshness';
import { StreamerRow } from '@/components/streamer-row';

const SORTS: { key: StreamerSort; label: string }[] = [
  { key: 'donation', label: 'Cagnotte' },
  { key: 'viewers', label: 'Viewers' },
  { key: 'live', label: 'En live' },
  { key: 'momentum', label: 'En forme' },
];

/** Fenêtre du tri « en forme » : progression de la cagnotte sur la dernière heure. */
const MOMENTUM_WINDOW_MINUTES = 60;

export default function StreamersScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useZeventState();
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

  if (isLoading && !data) return <LoadingState label="Chargement des streamers…" />;
  if (isError && !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Backend injoignable'}
        onRetry={onRefresh}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
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
            <View className="flex-row gap-2">
              {SORTS.map((entry) => {
                const active = entry.key === sort;
                return (
                  <Pressable
                    key={entry.key}
                    onPress={() => setSort(entry.key)}
                    className={`flex-1 items-center rounded-full border py-2 ${
                      active
                        ? 'border-zevent-500 bg-zevent-500/20'
                        : 'border-gray-800 bg-gray-900'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active ? 'text-zevent-200' : 'text-gray-400'
                      }`}
                    >
                      {entry.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {data ? (
              <SourceFreshness fetchedAt={data.source.fetchedAt} stale={data.source.stale} />
            ) : null}
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
    </SafeAreaView>
  );
}
