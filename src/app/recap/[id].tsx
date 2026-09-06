import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import {
  getRecapById,
  isRecapDayId,
  type Recap,
  type RecapDaySummary,
} from '@/api/recaps';
import { AppHeader } from '@/components/app-header';
import { BarChart } from '@/components/bar-chart';
import { DisclosureButton } from '@/components/disclosure-button';
import { ObservedChip } from '@/components/observed-chip';
import { RecapComparisonPanel } from '@/components/recap-comparison-panel';
import { RecapFavorites } from '@/components/recap-favorites';
import { RecapHero } from '@/components/recap-hero';
import { RecapTimeline } from '@/components/recap-timeline';
import { RecapShareSheet } from '@/components/recap-share-sheet';
import { RowSeparator } from '@/components/row-separator';
import { ScreenShell } from '@/components/screen-shell';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { formatCount, formatEuros, formatEurosCompact } from '@/lib/format';
import { buildRecapComparison } from '@/lib/recap-comparison';
import { coverageNotice, personalizeRecap } from '@/lib/recap-personalization';
import {
  buildRecapTimeline,
  dayToRecapCard,
  groupFavoriteActivity,
  normalizeGoalLabel,
  recapSubtitle,
  recapTitle,
  toRhythmBars,
} from '@/lib/recap-view';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { useRecapIdentity } from '@/lib/use-recap-identity';
import { useFavoritesStore } from '@/store/favorites';
import { useRecapsReadStore } from '@/store/recaps-read';

/** Une journée en cours se complète au fil des relevés ; une journée close est figée. */
const IN_PROGRESS_REFETCH_MS = 60_000;

/**
 * Ce que chaque section montre à l'arrivée, le reste attendant un appui.
 *
 * Une journée de ZEvent produit neuf cents paliers, quatre cents directs et des dizaines
 * de moments marquants. Tout dérouler donnait une page de vingt écrans que personne ne
 * parcourt : on y cherche, on n'y lit pas. Les aperçus sont donc calibrés sur ce qu'on
 * embrasse d'un regard, et chaque section sait s'ouvrir.
 */
const PREVIEW = {
  timeline: 8,
  goals: 4,
  lives: 8,
  donors: 5,
  progressions: 5,
} as const;

/** Moments ajoutés à chaque dépliage du fil, plutôt que les quarante d'un coup. */
const TIMELINE_STEP = 12;

const hourMinute = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * Bloc de données : un titre, des lignes, éventuellement une note de provenance.
 *
 * L'écran ne connaît que deux formes, et la différence porte un sens. Ce qui s'énumère —
 * donateurs, goals, lives — vit dans un cadre : le cadre dit où la liste commence et où
 * elle s'arrête. Ce qui se lit d'un trait — la courbe du rythme, le fil de la période —
 * reste posé sur le fond sous un simple titre, parce qu'un encadré autour d'un récit ne
 * fait que le rétrécir. Sept cartes identiques à la suite ne structuraient rien.
 */
function Panel({ title, count, hint, accent, footer, children }: {
  title: string;
  /** Total de la série, affiché à droite du titre plutôt que noyé dans une phrase. */
  count?: number;
  hint?: string;
  accent?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View
      className={`gap-3 rounded-2xl border p-4 ${
        accent ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10 bg-surface'
      }`}
    >
      <View className="gap-0.5">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="shrink text-base font-bold text-white">{title}</Text>
          {count !== undefined ? (
            <Text className="text-[11px] font-semibold text-gray-400">{formatCount(count)}</Text>
          ) : null}
        </View>
        {hint ? <Text className="text-[11px] text-gray-400">{hint}</Text> : null}
      </View>
      {children}
      {footer}
    </View>
  );
}

/**
 * Lignes d'un panneau, séparées par un filet.
 *
 * Une liste espacée par du vide oblige à mesurer les intervalles pour savoir où finit une
 * entrée et où commence la suivante — un pseudo suivi d'un libellé de goal sur deux lignes
 * devenait un bloc de texte continu. Le filet tranche la question sans ajouter de cadre.
 */
function Rows({ items }: { items: readonly ReactNode[] }) {
  return (
    <View className="-my-2">
      {items.map((item, index) => (
        <View key={index}>
          {index > 0 ? <RowSeparator /> : null}
          <View className="py-2.5">{item}</View>
        </View>
      ))}
    </View>
  );
}

function StreamerRow({ display, detail, value, onPress }: {
  display: string;
  detail?: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 active:opacity-70">
      <View className="flex-1">
        <Text className="text-sm text-gray-200">{display}</Text>
        {detail ? <Text className="text-[11px] text-gray-400">{detail}</Text> : null}
      </View>
      {value ? <Text className="text-sm font-bold text-zevent-300">{value}</Text> : null}
      <Ionicons name="chevron-forward" size={14} color="#4b5563" />
    </Pressable>
  );
}

/**
 * Un récap en entier.
 *
 * L'écran suit l'ordre dans lequel on veut savoir : combien, à quel rythme, puis ce qui
 * s'est passé et dans quel ordre, et enfin le détail par streamer. Le fil chronologique est
 * au centre — c'est lui qui raconte la période, là où les inventaires ne font que la
 * décrire.
 */
export default function RecapDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const recapId = id ?? '';
  const isDay = isRecapDayId(recapId);
  const { identity, error: identityError } = useRecapIdentity();
  const favorites = useFavoritesStore((s) => s.favorites);
  const markRead = useRecapsReadStore((s) => s.markRead);
  const [shareOpen, setShareOpen] = useState(false);
  /** Le fil réduit aux moments qui concernent les streamers suivis. */
  const [threadFavoritesOnly, setThreadFavoritesOnly] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [livesOpen, setLivesOpen] = useState(false);
  const [donorsOpen, setDonorsOpen] = useState(false);
  /** Moments du fil actuellement dépliés : il s'ouvre par paliers, pas d'un bloc. */
  const [threadShown, setThreadShown] = useState<number>(PREVIEW.timeline);
  // Les courbes des deux éditions ne servent qu'à situer une journée : la requête est
  // partagée avec l'écran des statistiques, React Query n'ira pas la chercher deux fois.
  const editions = useEditionComparison('10m');

  const query = useQuery({
    queryKey: ['recap', recapId, isDay ? 'public' : identity?.installationId],
    queryFn: () => getRecapById(identity, recapId),
    enabled: recapId.length > 0 && (isDay || Boolean(identity)),
    // Le rafraîchissement se décide sur la réponse : rien ne dit avant de l'avoir lue si
    // la journée demandée est encore en cours.
    refetchInterval: (query) => (query.state.data?.inProgress ? IN_PROGRESS_REFETCH_MS : false),
  });
  const recap = query.data;

  /**
   * Voisins du récap courant, pris dans les listes déjà chargées par l'onglet. On ne va
   * rien rechercher pour cela : arriver ici par une notification, sans ces listes en
   * cache, retire simplement les flèches.
   */
  const neighbours = useMemo(() => {
    if (!recap) return { previous: null, next: null };
    const siblings = isDay
      ? (queryClient.getQueryData<{ days: RecapDaySummary[] }>(['recap-days'])?.days ?? []).map(
          dayToRecapCard,
        )
      : (queryClient.getQueryData<{ recaps: Recap[] }>([
          'recaps',
          identity?.installationId,
        ])?.recaps ?? []);
    const ordered = [...siblings].sort(
      (a, b) => Date.parse(a.periodEnd) - Date.parse(b.periodEnd),
    );
    const index = ordered.findIndex((item) => item.id === recap.id);
    if (index < 0) return { previous: null, next: null };
    return { previous: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null };
  }, [recap, isDay, queryClient, identity]);

  if (!recap) {
    const message =
      identityError ??
      (query.error instanceof Error ? query.error.message : null) ??
      (query.isLoading ? null : 'Récap introuvable');
    return message ? (
      <ErrorState message={message} onRetry={() => void query.refetch()} />
    ) : (
      <LoadingState label="Ouverture du récap…" />
    );
  }

  // `highlights` reste produit par le serveur mais n'est plus affiché ici : il ne faisait
  // que redire le cumul, la cagnotte, la meilleure heure et les goals, tous déjà à l'écran.
  // Il sert encore là où le récap sort de son contexte : carte de partage et notification.
  const { summary, counts, bigDonations, goalsReached, liveStarts } = recap.content;
  const personal = personalizeRecap(recap.content, favorites);
  const digests = groupFavoriteActivity(recap.content, favorites);
  const timeline = buildRecapTimeline(recap.content, favorites);
  const favoriteMoments = timeline.items.filter((item) => item.favorite).length;
  const threadItems = threadFavoritesOnly
    ? timeline.items.filter((item) => item.favorite)
    : timeline.items;
  const notice = coverageNotice(recap);
  const bars = toRhythmBars(recap.content.series?.points ?? []);
  // Seules les journées se comparent à 2025 : une plage manuelle de six heures n'a pas
  // d'équivalent identifiable dans l'édition précédente.
  const comparison = buildRecapComparison(
    recap,
    isDay
      ? { points: editions.history.points, originAt2026: editions.comparison.originAt2026 }
      : null,
  );
  const observed = recap.content.observedDonations;
  const openStreamer = (twitch: string) => router.push(`/streamer/${twitch}` as never);
  const goTo = (target: Recap) => {
    markRead(target.id);
    router.replace(`/recap/${target.id}` as never);
  };

  return (
    <ScreenShell
      header={
        <AppHeader
          title={recapTitle(recap)}
          subtitle={recapSubtitle(recap)}
          compact
          liveSummary={false}
          alwaysOn={false}
          onBack={() => router.back()}
          actions={[
            { icon: 'share-outline', label: 'Partager ce récap', onPress: () => setShareOpen(true) },
          ]}
        />
      }
    >
      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-12">
        <RecapHero
          raisedCents={summary.raisedCents}
          endCents={summary.endCents}
          shareOfTotal={summary.shareOfTotal}
          peakViewers={summary.peakViewers}
          bestHour={recap.content.bestHour}
        />

        {notice ? (
          <View className="flex-row gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
            <Ionicons name="warning-outline" size={16} color="#fbbf24" />
            <Text className="flex-1 text-xs text-amber-200">{notice}</Text>
          </View>
        ) : null}

        <RecapComparisonPanel
          comparison={comparison}
          {...(recap.title ? { label2025: `${recap.title} 2025` } : {})}
        />

        {bars.length > 1 ? (
          <View className="gap-3">
            <SectionHeader title="Le rythme" hint="Ce que chaque tranche de la période a rapporté." />
            <BarChart bars={bars} formatValue={formatEurosCompact} labelEvery={4} height={140} />
          </View>
        ) : null}

        {digests.length > 0 ? (
          <Panel
            title="Vos favoris"
            count={digests.length}
            hint="Ce que la période contient sur les streamers suivis."
            accent
          >
            <RecapFavorites digests={digests} onOpenStreamer={openStreamer} />
          </Panel>
        ) : favorites.length === 0 ? (
          <View className="flex-row items-center gap-2 rounded-2xl border border-white/10 bg-surface p-4">
            <Ionicons name="star-outline" size={16} color="#9ca3af" />
            <Text className="flex-1 text-xs text-gray-400">
              Ajoutez des favoris depuis l’onglet Streamers : leurs progressions et paliers
              apparaîtront en tête de vos récaps.
            </Text>
          </View>
        ) : null}

        {timeline.items.length > 0 ? (
          <View className="gap-3">
            <SectionHeader
              title="Le fil de la période"
              hint={
                threadFavoritesOnly
                  ? 'Réduit aux moments qui concernent vos favoris.'
                  : 'Les moments marquants, dans l’ordre où ils sont arrivés.'
              }
            />
            {favoriteMoments > 0 ? (
              <Segmented
                options={[
                  { key: 'all', label: `Tout (${timeline.items.length})` },
                  { key: 'favorites', label: `Mes favoris (${favoriteMoments})` },
                ]}
                value={threadFavoritesOnly ? 'favorites' : 'all'}
                onChange={(key) => setThreadFavoritesOnly(key === 'favorites')}
              />
            ) : null}

            <RecapTimeline
              items={threadItems.slice(0, threadShown)}
              onOpenStreamer={openStreamer}
            />

            {threadItems.length > threadShown ? (
              <DisclosureButton
                expanded={false}
                onPress={() => setThreadShown((current) => current + TIMELINE_STEP)}
                label={`${threadItems.length - threadShown} moments de plus`}
              />
            ) : threadShown > PREVIEW.timeline ? (
              <DisclosureButton
                expanded
                onPress={() => setThreadShown(PREVIEW.timeline)}
                label="Réduire le fil"
              />
            ) : null}

            {timeline.hidden > 0 && threadItems.length <= threadShown && !threadFavoritesOnly ? (
              <Text className="text-[11px] text-gray-500">
                {timeline.hidden} moments plus discrets n’ont pas été retenus sur cette période.
              </Text>
            ) : null}
          </View>
        ) : null}

        {personal.otherProgressions.length > 0 ? (
          <Panel title={favorites.length > 0 ? 'Ailleurs sur l’événement' : 'Top progressions'}>
            <Rows
              items={personal.otherProgressions.slice(0, PREVIEW.progressions).map((item, index) => (
                <StreamerRow
                  key={item.twitch}
                  display={`${index + 1}. ${item.display}`}
                  value={`+${formatEuros(item.raisedCents / 100)}`}
                  onPress={() => openStreamer(item.twitch)}
                />
              ))}
            />
          </Panel>
        ) : null}

        {observed && observed.topDonors.length > 0 ? (
          <Panel
            title="Top donateurs"
            footer={
              <ObservedChip
                observed={{ count: observed.count, totalCents: observed.totalCents, firstAt: null, lastAt: null }}
                subject="Ce classement"
              />
            }
          >
            <Rows
              items={(donorsOpen ? observed.topDonors : observed.topDonors.slice(0, PREVIEW.donors)).map((item, index) => (
                <View key={`${item.donor}-${index}`} className="flex-row items-center gap-3">
                  <Text className="w-4 text-[11px] font-bold text-gray-400">{index + 1}</Text>
                  <Text numberOfLines={1} className="flex-1 text-sm text-gray-200">
                    {item.donor}
                  </Text>
                  {item.count > 1 ? (
                    <Text className="text-[11px] text-gray-400">{item.count} dons</Text>
                  ) : null}
                  <Text className="text-sm font-bold text-emerald-300">
                    {formatEuros(item.amountCents / 100)}
                  </Text>
                </View>
              ))}
            />
            {observed.topDonors.length > PREVIEW.donors ? (
              <DisclosureButton
                expanded={donorsOpen}
                onPress={() => setDonorsOpen((current) => !current)}
                label={`${observed.topDonors.length - PREVIEW.donors} donateurs de plus`}
                expandedLabel="Réduire"
              />
            ) : null}
          </Panel>
        ) : null}

        {bigDonations.length > 0 && timeline.items.length === 0 ? (
          <Panel title="Gros dons détectés" count={counts.bigDonations}>
            <Rows
              items={bigDonations.slice(0, PREVIEW.donors).map((item, index) => (
                <View key={`${item.occurredAt}-${index}`} className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-sm text-gray-200">
                      {item.donor}
                    </Text>
                    {item.twitch ? (
                      <Text numberOfLines={1} className="text-[11px] text-gray-400">
                        pour {item.twitch}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-sm font-bold text-emerald-300">
                    {formatEuros(item.amountCents / 100)}
                  </Text>
                </View>
              ))}
            />
          </Panel>
        ) : null}

        {goalsReached.length > 0 ? (
          <Panel title="Donation goals" count={goalsReached.length}>
            <Rows
              items={(goalsOpen ? goalsReached : goalsReached.slice(0, PREVIEW.goals)).map((item, index) => (
                <Pressable
                  key={`${item.occurredAt}-${index}`}
                  onPress={() => openStreamer(item.twitch)}
                  accessibilityRole="button"
                  className="flex-row items-start gap-3 active:opacity-70"
                >
                  <View className="flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-sm font-semibold text-white">
                      {item.display}
                    </Text>
                    <Text numberOfLines={2} className="text-[12px] leading-4 text-gray-400">
                      {normalizeGoalLabel(item.label)}
                    </Text>
                  </View>
                  <Text className="text-[11px] text-gray-500">
                    {hourMinute.format(new Date(item.occurredAt))}
                  </Text>
                </Pressable>
              ))}
            />
            {goalsReached.length > PREVIEW.goals ? (
              <DisclosureButton
                expanded={goalsOpen}
                onPress={() => setGoalsOpen((current) => !current)}
                label={`${goalsReached.length - PREVIEW.goals} autres paliers`}
                expandedLabel="Réduire"
              />
            ) : null}
          </Panel>
        ) : null}

        {liveStarts.length > 0 ? (
          <Panel title="Nouveaux lives" count={liveStarts.length}>
            {/* Des pastilles, pas une phrase : douze pseudos collés par des points se
                lisent comme un paragraphe, où plus aucun nom ne se détache. */}
            <View className="flex-row flex-wrap gap-2">
              {(livesOpen ? liveStarts : liveStarts.slice(0, PREVIEW.lives)).map((item, index) => (
                <Pressable
                  key={`${item.twitch}-${index}`}
                  onPress={() => openStreamer(item.twitch)}
                  accessibilityRole="button"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 active:opacity-70"
                >
                  <Text className="text-[12px] font-medium text-gray-200">{item.display}</Text>
                </Pressable>
              ))}
            </View>
            {liveStarts.length > PREVIEW.lives ? (
              <DisclosureButton
                expanded={livesOpen}
                onPress={() => setLivesOpen((current) => !current)}
                label={`${liveStarts.length - PREVIEW.lives} autres directs`}
                expandedLabel="Réduire"
              />
            ) : null}
          </Panel>
        ) : null}

        {neighbours.previous || neighbours.next ? (
          <View className="flex-row gap-3 pt-2">
            {neighbours.previous ? (
              <Pressable
                onPress={() => goTo(neighbours.previous!)}
                accessibilityRole="button"
                className="flex-1 flex-row items-center gap-2 rounded-2xl border border-white/10 bg-surface p-3 active:opacity-70"
              >
                <Ionicons name="chevron-back" size={16} color="#9ca3af" />
                <Text numberOfLines={1} className="flex-1 text-xs text-gray-300">
                  {recapTitle(neighbours.previous)}
                </Text>
              </Pressable>
            ) : null}
            {neighbours.next ? (
              <Pressable
                onPress={() => goTo(neighbours.next!)}
                accessibilityRole="button"
                className="flex-1 flex-row items-center justify-end gap-2 rounded-2xl border border-white/10 bg-surface p-3 active:opacity-70"
              >
                <Text numberOfLines={1} className="flex-1 text-right text-xs text-gray-300">
                  {recapTitle(neighbours.next)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <RecapShareSheet visible={shareOpen} recap={recap} onClose={() => setShareOpen(false)} />
    </ScreenShell>
  );
}
