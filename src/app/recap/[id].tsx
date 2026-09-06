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
import { RecapTimeline } from '@/components/recap-timeline';
import { RecapShareSheet } from '@/components/recap-share-sheet';
import { ScreenShell } from '@/components/screen-shell';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { SectionHeader } from '@/components/section-header';
import { StatTile } from '@/components/stat-tile';
import { formatCount, formatEuros, formatEurosCompact, formatPercent } from '@/lib/format';
import { coverageNotice, personalizeRecap } from '@/lib/recap-personalization';
import {
  buildRecapTimeline,
  dayToRecapCard,
  recapSubtitle,
  recapTitle,
  toRhythmBars,
} from '@/lib/recap-view';
import { useRecapIdentity } from '@/lib/use-recap-identity';
import { useFavoritesStore } from '@/store/favorites';
import { useRecapsReadStore } from '@/store/recaps-read';

/** Une journée en cours se complète au fil des relevés ; une journée close est figée. */
const IN_PROGRESS_REFETCH_MS = 60_000;

/** Au-delà, une liste brute devient illisible sur mobile. */
const MAX_ROWS = 12;

const hourMinute = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function Section({ title, hint, accent, children }: {
  title: string;
  hint?: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <View
      className={`gap-3 rounded-2xl border p-4 ${
        accent ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10 bg-surface'
      }`}
    >
      <View className="gap-0.5">
        <Text className="text-base font-bold text-white">{title}</Text>
        {hint ? <Text className="text-[11px] text-gray-500">{hint}</Text> : null}
      </View>
      {children}
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
        {detail ? <Text className="text-[11px] text-gray-500">{detail}</Text> : null}
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

  const { summary, counts, highlights, bigDonations, goalsReached, liveStarts } = recap.content;
  const personal = personalizeRecap(recap.content, favorites);
  const timeline = buildRecapTimeline(recap.content, favorites);
  const notice = coverageNotice(recap);
  const bars = toRhythmBars(recap.content.series?.points ?? []);
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
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wider text-gray-500">
            Collecté sur la période
          </Text>
          <Text className="text-4xl font-black text-white">
            +{formatEuros(summary.raisedCents / 100)}
          </Text>
          {summary.shareOfTotal ? (
            <Text className="text-sm text-gray-400">
              soit {formatPercent(summary.shareOfTotal)} de la cagnotte atteinte
            </Text>
          ) : null}
        </View>

        {notice ? (
          <View className="flex-row gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
            <Ionicons name="warning-outline" size={16} color="#fbbf24" />
            <Text className="flex-1 text-xs text-amber-200">{notice}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <StatTile
            label="Cagnotte"
            value={summary.endCents === null ? '—' : formatEuros(summary.endCents / 100)}
            hint={
              summary.startCents === null
                ? 'à la fin de la période'
                : `depuis ${formatEuros(summary.startCents / 100)}`
            }
          />
          <StatTile label="Pic viewers" value={formatCount(summary.peakViewers)} />
        </View>
        <View className="flex-row gap-3">
          <StatTile
            label="Meilleure heure"
            value={
              recap.content.bestHour
                ? hourMinute.format(new Date(recap.content.bestHour.start))
                : '—'
            }
            {...(recap.content.bestHour
              ? { hint: `+${formatEuros(recap.content.bestHour.raisedCents / 100)}` }
              : {})}
          />
          <StatTile label="Goals atteints" value={String(counts.goalsReached)} />
        </View>

        {bars.length > 1 ? (
          <Section title="Le rythme" hint="Ce que chaque tranche a rapporté.">
            <BarChart bars={bars} formatValue={formatEurosCompact} labelEvery={4} height={140} />
          </Section>
        ) : null}

        {personal.hasFavoriteContent ? (
          <Section title="Vos favoris" hint="Ce que la période contient sur les streamers suivis." accent>
            {personal.favoriteProgressions.map((item) => (
              <StreamerRow
                key={`progress-${item.twitch}`}
                display={item.display}
                detail="progression sur la période"
                value={`+${formatEuros(item.raisedCents / 100)}`}
                onPress={() => openStreamer(item.twitch)}
              />
            ))}
            {personal.favoriteGoals.map((item, index) => (
              <StreamerRow
                key={`goal-${item.twitch}-${index}`}
                display={item.display}
                detail={`goal atteint · ${item.label}`}
                onPress={() => openStreamer(item.twitch)}
              />
            ))}
            {personal.favoriteLiveStarts.map((item) => (
              <StreamerRow
                key={`live-${item.twitch}`}
                display={item.display}
                detail={`live lancé à ${hourMinute.format(new Date(item.occurredAt))}`}
                onPress={() => openStreamer(item.twitch)}
              />
            ))}
          </Section>
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
              hint="Les moments marquants, dans l’ordre où ils sont arrivés."
            />
            <RecapTimeline
              items={timeline.items}
              hidden={timeline.hidden}
              onOpenStreamer={openStreamer}
            />
          </View>
        ) : null}

        {highlights.length > 0 ? (
          <Section title="À retenir">
            {highlights.map((text, index) => (
              <Text key={index} className="text-sm leading-5 text-gray-300">
                • {text}
              </Text>
            ))}
          </Section>
        ) : null}

        {personal.otherProgressions.length > 0 ? (
          <Section title={favorites.length > 0 ? 'Ailleurs sur l’événement' : 'Top progressions'}>
            {personal.otherProgressions.map((item, index) => (
              <StreamerRow
                key={item.twitch}
                display={`${index + 1}. ${item.display}`}
                value={`+${formatEuros(item.raisedCents / 100)}`}
                onPress={() => openStreamer(item.twitch)}
              />
            ))}
          </Section>
        ) : null}

        {observed && observed.topDonors.length > 0 ? (
          <Section
            title="Top donateurs"
            hint={`D’après ${formatCount(observed.count)} dons vus passer dans le feed — un plancher, pas le compte réel.`}
          >
            {observed.topDonors.slice(0, MAX_ROWS).map((item, index) => (
              <View key={`${item.donor}-${index}`} className="flex-row items-center gap-3">
                <Text className="w-5 text-[11px] font-bold text-gray-600">{index + 1}</Text>
                <Text numberOfLines={1} className="flex-1 text-sm text-gray-200">
                  {item.donor}
                </Text>
                {item.count > 1 ? (
                  <Text className="text-[11px] text-gray-500">{item.count} dons</Text>
                ) : null}
                <Text className="text-sm font-bold text-emerald-300">
                  {formatEuros(item.amountCents / 100)}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {bigDonations.length > 0 && timeline.items.length === 0 ? (
          <Section
            title="Gros dons détectés"
            hint={counts.bigDonations > bigDonations.length ? `${counts.bigDonations} au total` : undefined}
          >
            {bigDonations.slice(0, MAX_ROWS).map((item, index) => (
              <View key={`${item.occurredAt}-${index}`} className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-gray-300" numberOfLines={1}>
                  {item.donor}
                  {item.twitch ? ` → ${item.twitch}` : ''}
                </Text>
                <Text className="text-sm font-bold text-emerald-300">
                  {formatEuros(item.amountCents / 100)}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {goalsReached.length > 0 ? (
          <Section title="Donation goals">
            {goalsReached.slice(0, MAX_ROWS).map((item, index) => (
              <Text key={`${item.occurredAt}-${index}`} className="text-sm text-gray-300">
                <Text className="font-bold text-white">{item.display}</Text> — {item.label}
              </Text>
            ))}
            {goalsReached.length > MAX_ROWS ? (
              <Text className="text-[11px] text-gray-500">
                + {goalsReached.length - MAX_ROWS} autres
              </Text>
            ) : null}
          </Section>
        ) : null}

        {liveStarts.length > 0 ? (
          <Section title="Nouveaux lives" hint={`${liveStarts.length} sur la période`}>
            <Text className="text-sm leading-5 text-gray-300">
              {liveStarts.slice(0, MAX_ROWS).map((item) => item.display).join(' · ')}
            </Text>
            {liveStarts.length > MAX_ROWS ? (
              <Text className="text-[11px] text-gray-500">
                + {liveStarts.length - MAX_ROWS} autres
              </Text>
            ) : null}
          </Section>
        ) : null}

        {neighbours.previous || neighbours.next ? (
          <View className="flex-row gap-3 pt-2">
            {neighbours.previous ? (
              <Pressable
                onPress={() => goTo(neighbours.previous!)}
                accessibilityRole="button"
                className="flex-1 flex-row items-center gap-2 rounded-2xl border border-white/10 bg-surface p-3 active:opacity-70"
              >
                <Ionicons name="chevron-back" size={16} color="#c4b5fd" />
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
                <Ionicons name="chevron-forward" size={16} color="#c4b5fd" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <RecapShareSheet visible={shareOpen} recap={recap} onClose={() => setShareOpen(false)} />
    </ScreenShell>
  );
}
