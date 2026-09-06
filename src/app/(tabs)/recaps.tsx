import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';

import {
  deleteRecap,
  generateRecap,
  getRecapDays,
  getRecaps,
  type Recap,
  type RecapRequest,
} from '@/api/recaps';
import { AppHeader } from '@/components/app-header';
import { ListControls, useFloatingControls } from '@/components/list-controls';
import { RecapCard } from '@/components/recap-card';
import { RecapGeneratorSheet } from '@/components/recap-generator-sheet';
import { ScreenShell } from '@/components/screen-shell';
import { EmptyState } from '@/components/screen-state';
import { SectionHeader } from '@/components/section-header';
import { SkeletonBlock } from '@/components/skeleton';
import {
  dayToRecapCard,
  filterRecaps,
  RECAP_FILTERS,
  sortRecaps,
  type RecapFilter,
} from '@/lib/recap-view';
import { useRecapIdentity } from '@/lib/use-recap-identity';
import { useFavoritesStore } from '@/store/favorites';
import { useRecapsReadStore } from '@/store/recaps-read';

/** Les journées bougent au rythme de la collecte : une resynchro par minute suffit. */
const DAYS_REFETCH_MS = 60_000;

/** Respiration entre la barre de commandes flottante et la première carte. */
const CONTENT_GAP = 8;

type Section = { key: string; title: string; hint: string; data: Recap[] };

/** Attente dessinée à la forme des cartes : rien ne bouge quand elles prennent la place. */
function RecapsSkeleton() {
  return (
    <View accessibilityLabel="Chargement des récaps" className="gap-3 pt-2">
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          className="gap-3 rounded-2xl border border-white/10 bg-surface p-4"
        >
          <SkeletonBlock width="45%" height={14} />
          <SkeletonBlock width="30%" height={9} />
          <SkeletonBlock width="60%" height={24} />
          <SkeletonBlock width="80%" height={10} />
        </View>
      ))}
    </View>
  );
}

/**
 * Historique des récaps.
 *
 * L'écran s'ouvre sur ce qu'il y a à lire, jamais sur ce qu'il y a à régler : les journées
 * de l'événement d'abord — elles existent pour tout le monde et depuis vendredi, donc même
 * pour qui installe l'application dimanche midi — puis les récaps demandés depuis cet
 * appareil. Programmer des horaires est une opération qu'on fait une fois : elle a son
 * écran, atteint depuis la barre du haut.
 */
export default function RecapsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { identity, error: identityError } = useRecapIdentity();
  const favorites = useFavoritesStore((s) => s.favorites);
  const readIds = useRecapsReadStore((s) => s.read);
  const markRead = useRecapsReadStore((s) => s.markRead);
  const controls = useFloatingControls();

  const [filter, setFilter] = useState<RecapFilter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  const days = useQuery({
    queryKey: ['recap-days'],
    queryFn: getRecapDays,
    refetchInterval: DAYS_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
  const recaps = useQuery({
    queryKey: ['recaps', identity?.installationId],
    queryFn: () => getRecaps(identity!),
    enabled: Boolean(identity),
  });

  const generate = useMutation({
    mutationFn: (request: RecapRequest) =>
      generateRecap(identity!, request, Crypto.randomUUID()),
    onSuccess: async (recap) => {
      setSheetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['recaps', identity?.installationId] });
      markRead(recap.id);
      router.push(`/recap/${recap.id}` as never);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRecap(identity!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recaps', identity?.installationId] }),
  });

  const dayCards = useMemo(
    () => (days.data?.days ?? []).map(dayToRecapCard),
    [days.data],
  );
  /** Les points de courbe ne voyagent pas dans la carte : ils viennent de l'aperçu. */
  const dayPoints = useMemo(
    () => new Map((days.data?.days ?? []).map((day) => [day.id, day.preview.points])),
    [days.data],
  );

  const sections = useMemo<Section[]>(() => {
    // Aucun récap personnel n'est de type `day` : le filtre « Journées » les écarte seul.
    const personal = filterRecaps(sortRecaps(recaps.data?.recaps ?? []), filter);
    const list: Section[] = [];
    if (filter === 'all' || filter === 'day') {
      list.push({
        key: 'days',
        title: 'Le week-end',
        hint: 'Chaque journée court de 9 h à 9 h, heure de Paris. Accessible à tous, depuis le début.',
        data: [...dayCards].reverse(),
      });
    }
    if (filter !== 'day') {
      list.push({
        key: 'personal',
        title: 'Vos récaps',
        hint: 'Générés sur cet appareil, aux horaires programmés ou à la demande.',
        data: personal,
      });
    }
    return list.filter((section) => section.data.length > 0);
  }, [dayCards, recaps.data, filter]);

  const total = sections.reduce((count, section) => count + section.data.length, 0);
  const unread = useMemo(() => {
    const known = new Set(readIds);
    return sections.reduce(
      (count, section) => count + section.data.filter((recap) => !known.has(recap.id)).length,
      0,
    );
  }, [sections, readIds]);

  const collected = useMemo(() => {
    const list = days.data?.days ?? [];
    const first = list[0];
    const last = list[list.length - 1];
    return first && last ? { start: first.periodStart, end: last.periodEnd } : null;
  }, [days.data]);

  const loading = days.isLoading || (Boolean(identity) && recaps.isLoading);
  const message =
    identityError ??
    (days.error instanceof Error && !days.data ? days.error.message : null) ??
    (recaps.error instanceof Error && !recaps.data ? recaps.error.message : null);

  const open = (recap: Recap) => {
    markRead(recap.id);
    router.push(`/recap/${recap.id}` as never);
  };

  const confirmDelete = (recap: Recap) =>
    Alert.alert(
      'Supprimer ce récap ?',
      'Il disparaît de cet appareil. Les journées de l’événement, elles, restent disponibles.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => remove.mutate(recap.id) },
      ],
    );

  return (
    <ScreenShell
      header={
        <AppHeader
          title="Récaps"
          subtitle="Le week-end, période par période"
          actions={[
            {
              icon: 'options-outline',
              label: 'Réglages des récaps',
              onPress: () => router.push('/settings/recaps' as never),
            },
          ]}
        />
      }
    >
      <View className="flex-1">
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: controls.paddingTop + CONTENT_GAP,
            paddingHorizontal: 18,
            paddingBottom: 96,
          }}
          onScroll={controls.onScroll}
          scrollEventThrottle={16}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={days.isRefetching || recaps.isRefetching}
              onRefresh={() => {
                void days.refetch();
                void recaps.refetch();
              }}
              tintColor="#a78bfa"
              progressViewOffset={controls.paddingTop}
            />
          }
          renderSectionHeader={({ section }) => (
            <View className="pb-2 pt-4">
              <SectionHeader title={section.title} hint={section.hint} />
            </View>
          )}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <RecapCard
              recap={item}
              favorites={favorites}
              points={
                dayPoints.get(item.id) ?? item.content.series?.points.map((point) => point.cents)
              }
              read={readIds.includes(item.id)}
              onPress={() => open(item)}
              {...(item.kind === 'manual' ? { onLongPress: () => confirmDelete(item) } : {})}
            />
          )}
          ListHeaderComponent={
            loading ? (
              <RecapsSkeleton />
            ) : message ? (
              <Text className="rounded-2xl bg-red-950 p-3 text-sm text-red-300">{message}</Text>
            ) : null
          }
          ListEmptyComponent={
            loading || message ? null : (
              <EmptyState
                message={
                  filter === 'manual'
                    ? 'Aucun récap créé à la main. Le bouton « Nouveau récap » couvre la période de votre choix.'
                    : filter === 'scheduled'
                      ? 'Aucun récap programmé. Ajoutez un horaire dans les réglages pour en recevoir automatiquement.'
                      : 'Les récaps arriveront dès que la collecte aura de quoi raconter le week-end.'
                }
              />
            )
          }
        />

        {/* Posée par-dessus, hors du flux : son repli ne redimensionne donc pas la liste. */}
        <View className="absolute left-0 right-0 top-0">
          <ListControls
            sorts={RECAP_FILTERS}
            sort={filter}
            onSortChange={setFilter}
            summary={
              total === 0
                ? 'Aucun récap'
                : `${total} récap${total > 1 ? 's' : ''}${unread > 0 ? ` · ${unread} non lu${unread > 1 ? 's' : ''}` : ''}`
            }
            hint="Les moments importants d’une période, calculés sans IA et mis en avant selon vos favoris."
            note={days.data?.cached || recaps.data?.cached ? 'Copie hors ligne' : undefined}
            compact={controls.compact}
            onHeights={controls.onHeights}
          />
        </View>

        <Pressable
          onPress={() => setSheetOpen(true)}
          disabled={!identity}
          accessibilityRole="button"
          accessibilityLabel="Créer un récap"
          className={`absolute bottom-6 right-5 flex-row items-center gap-2 rounded-full bg-zevent-500 py-3.5 pl-4 pr-5 active:opacity-80 ${
            identity ? '' : 'opacity-50'
          }`}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-sm font-bold text-white">Nouveau récap</Text>
        </Pressable>
      </View>

      <RecapGeneratorSheet
        visible={sheetOpen}
        window={collected}
        pending={generate.isPending}
        error={generate.error instanceof Error ? generate.error.message : null}
        onCancel={() => setSheetOpen(false)}
        onSubmit={(request) => generate.mutate(request)}
      />
    </ScreenShell>
  );
}
