import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { usePlanning, useZeventState } from '@/api/queries';
import type { PlanningEntry } from '@/api/types';
import { DisclosureButton } from '@/components/disclosure-button';
import { PlanningRow } from '@/components/planning-row';
import { SectionHeader } from '@/components/section-header';
import { SectionLink } from '@/components/section-link';
import { SectionTitle } from '@/components/section-title';
import { formatCount } from '@/lib/format';
import { entryStatus, isLongRun } from '@/lib/planning';
import type { PlanningEntryItem } from '@/lib/planning-view';
import { streamerSchedule } from '@/lib/streamer-profile';
import { useNow } from '@/lib/use-now';
import { useFavoritesStore } from '@/store/favorites';

/** Un créneau bascule à la minute, jamais à la seconde. */
const TICK_MS = 30_000;

/** Émissions à venir montrées d'emblée : au-delà, la fiche devient un programme. */
const UPCOMING_VISIBLE = 4;

/**
 * Habille une entrée pour `PlanningRow`. Le chevauchement n'est pas compté : il se mesure
 * sur le planning entier, et cette section n'en montre qu'un fil — annoncer « 3 en
 * parallèle » d'après trois lignes visibles serait faux.
 */
function toItem(entry: PlanningEntry, now: number, favorites: Set<string>): PlanningEntryItem {
  return {
    kind: 'entry',
    id: entry.id,
    entry,
    status: entryStatus(entry, now),
    parallel: 0,
    favorites: favorites.size
      ? entry.participants.filter((p) => p.twitch && favorites.has(p.twitch.toLowerCase()))
      : [],
    longRun: isLongRun(entry),
  };
}

interface StreamerScheduleProps {
  twitch: string;
}

/**
 * Section « Au programme » : les passages de ce streamer au planning communautaire.
 *
 * C'est la réponse à « quand est-ce qu'il repasse », que la fiche ne savait pas donner :
 * il fallait ouvrir l'onglet Planning et y chercher un nom au milieu du week-end. Les
 * lignes sont celles du fil du planning — mêmes horaires, même dépliage, même cloche de
 * rappel — pour qu'un rappel posé ici soit le même objet que là-bas.
 *
 * Elle vient avant la courbe : pendant le direct, « quand est-ce qu'il repasse » se
 * demande plus souvent que la forme d'une cagnotte.
 */
export function StreamerSchedule({ twitch }: StreamerScheduleProps) {
  const router = useRouter();
  const planning = usePlanning();
  const state = useZeventState();
  const favorites = useFavoritesStore((s) => s.favorites);
  const now = useNow(TICK_MS);
  const [showPast, setShowPast] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const knownStreamers = useMemo(
    () => new Set((state.data?.data.live ?? []).map((s) => s.twitch.toLowerCase())),
    [state.data],
  );

  const schedule = useMemo(
    () => streamerSchedule(planning.entries, twitch, now),
    [planning.entries, twitch, now],
  );

  const upcoming = showAllUpcoming
    ? schedule.upcoming
    : schedule.upcoming.slice(0, UPCOMING_VISIBLE);
  const hiddenUpcoming = schedule.upcoming.length - upcoming.length;
  const total = schedule.live.length + schedule.upcoming.length + schedule.past.length;

  // Le planning communautaire n'annonce pas tout le monde : sur la fiche de quelqu'un
  // qu'il ignore, la section n'a rien à dire et s'efface, plutôt que d'occuper un écran
  // à le dire.
  if (total === 0) return null;

  const row = (entry: PlanningEntry) => (
    <PlanningRow
      key={entry.id}
      item={toItem(entry, now, favoriteSet)}
      now={now}
      knownStreamers={knownStreamers}
    />
  );

  return (
    <View className="gap-3">
      <SectionHeader
        title="Au programme"
        hint={`${formatCount(total)} émission${total > 1 ? 's' : ''} ce week-end · horaires de Paris`}
      />

      {schedule.live.length > 0 ? (
        <View>
          <SectionTitle label="En ce moment" count={schedule.live.length} />
          {schedule.live.map(row)}
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View>
          <SectionTitle label="À venir" count={schedule.upcoming.length} />
          {upcoming.map(row)}
        </View>
      ) : schedule.live.length === 0 ? (
        <Text className="text-sm text-gray-500">
          Plus rien de programmé d’ici la fin du week-end.
        </Text>
      ) : null}

      {hiddenUpcoming > 0 ? (
        <DisclosureButton
          expanded={showAllUpcoming}
          onPress={() => setShowAllUpcoming((value) => !value)}
          label={`${formatCount(hiddenUpcoming)} émission${hiddenUpcoming > 1 ? 's' : ''} de plus`}
        />
      ) : null}

      {schedule.past.length > 0 ? (
        <DisclosureButton
          expanded={showPast}
          onPress={() => setShowPast((value) => !value)}
          label={`${formatCount(schedule.past.length)} émission${schedule.past.length > 1 ? 's' : ''} déjà passée${schedule.past.length > 1 ? 's' : ''}`}
          expandedLabel="Masquer les émissions passées"
        />
      ) : null}

      {showPast ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          {schedule.past.map(row)}
        </Animated.View>
      ) : null}

      <SectionLink
        label="Tout le planning du week-end"
        accessibilityLabel="Ouvrir l’onglet Planning"
        onPress={() => router.push('/(tabs)/planning')}
      />
    </View>
  );
}
