import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, SectionList, Text, View } from 'react-native';

import { usePlanning, useZeventState } from '@/api/queries';
import type { PlanningEntry } from '@/api/types';
import { AppHeader } from '@/components/app-header';
import { ScreenShell } from '@/components/screen-shell';
import { PlanningEntryCard } from '@/components/planning-entry-card';
import { EmptyState, LoadingState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { SourceFreshness } from '@/components/source-freshness';
import { entryStatus, focusIndex, groupPlanningByDay } from '@/lib/planning';

/** Le planning vient des InGDocs : on le crédite et on garde un lien vers leur site. */
const INGDOC_URL = 'https://zevent.gdoc.fr/';

type Filter = 'upcoming' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'À venir' },
  { key: 'all', label: 'Tout' },
];

/** Les statuts (en cours / passé) se recalculent à la minute, sans refetch réseau. */
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function PlanningScreen() {
  const planning = usePlanning();
  const state = useZeventState();
  const now = useMinuteTick();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const listRef = useRef<SectionList<PlanningEntry>>(null);
  const scrolledRef = useRef(false);

  const knownStreamers = useMemo(
    () => new Set((state.data?.data.live ?? []).map((streamer) => streamer.twitch.toLowerCase())),
    [state.data],
  );

  const visibleEntries = useMemo(() => {
    if (filter === 'all') return planning.entries;
    return planning.entries.filter((entry) => entryStatus(entry, now) !== 'past');
  }, [planning.entries, filter, now]);

  const sections = useMemo(
    () =>
      groupPlanningByDay(visibleEntries).map((day) => ({
        key: day.key,
        title: day.label,
        data: day.entries,
      })),
    [visibleEntries],
  );

  // Ouverture sur le moment présent : une seule fois, quand le planning complet est affiché.
  useEffect(() => {
    if (scrolledRef.current || filter !== 'all' || sections.length === 0) return;
    const target = focusIndex(visibleEntries, now);
    let remaining = target;
    for (const [sectionIndex, section] of sections.entries()) {
      if (remaining < section.data.length) {
        scrolledRef.current = true;
        try {
          listRef.current?.scrollToLocation({ sectionIndex, itemIndex: remaining, animated: true });
        } catch {
          scrolledRef.current = false;
        }
        return;
      }
      remaining -= section.data.length;
    }
  }, [sections, visibleEntries, filter, now]);

  const onRefresh = useCallback(() => planning.refetch(), [planning]);

  const header = <AppHeader title="Planning" subtitle="Horaires en heure de Paris" />;

  if (planning.isLoading && planning.entries.length === 0) {
    return (
      <ScreenShell header={header}>
        <LoadingState label="Chargement du planning…" />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell header={header}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshing={planning.isRefetching}
        onRefresh={onRefresh}
        contentContainerClassName="gap-2 px-5 pb-10 pt-4"
        onScrollToIndexFailed={() => {
          scrolledRef.current = false;
        }}
        renderItem={({ item }) => (
          <PlanningEntryCard
            entry={item}
            status={entryStatus(item, now)}
            now={now}
            knownStreamers={knownStreamers}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View className="bg-gray-950 pb-2 pt-3">
            <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {section.title}
            </Text>
          </View>
        )}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <Segmented options={FILTERS} value={filter} onChange={setFilter} />
            <SourceFreshness
              fetchedAt={planning.fetchedAt}
              stale={planning.stale}
              label="planning"
            />
            <Text className="text-xs text-gray-500">
              Planning compilé par les InGDocs (non officiel) — susceptible de changer en direct.
            </Text>
            {planning.origin === 'bundled' ? (
              <Text className="text-xs text-amber-400">
                Planning embarqué dans l’application : le backend n’a pas encore fourni de
                version à jour.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            message={
              filter === 'upcoming'
                ? 'Plus rien de programmé : bascule sur « Tout » pour revoir le week-end.'
                : "Aucun événement au planning pour l'instant."
            }
          />
        }
        ListFooterComponent={
          <Pressable
            onPress={() => void Linking.openURL(INGDOC_URL)}
            className="mt-4 items-center rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-3 active:opacity-70"
          >
            <Text className="text-xs text-gray-400">Voir le planning complet sur zevent.gdoc.fr</Text>
          </Pressable>
        }
      />
    </ScreenShell>
  );
}
