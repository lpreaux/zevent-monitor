import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { usePlanning } from '@/api/queries';
import type { PlanningEntry } from '@/api/types';
import {
  currentAndUpcoming,
  entryStatus,
  formatCountdown,
  formatParisRange,
  formatParisTime,
} from '@/lib/planning';
import { useNow } from '@/lib/use-now';

/** Cadence de rotation du bandeau réduit : assez lent pour finir de lire un titre. */
const ROTATION_MS = 4_500;

/** Durée du roulement d'un titre au suivant : assez longue pour se lire comme un mouvement. */
const ROLL_MS = 480;

/** Hauteur de la fenêtre du bandeau réduit : elle rogne le titre qui entre et celui qui sort. */
const ROW_HEIGHT = 17;

/** Mode confort : deux émissions visibles à la fois, puisées dans les six prochaines. */
const COMFORT_VISIBLE = 2;
const COMFORT_POOL = 6;
const COMFORT_ROW_HEIGHT = 26;

/** Pastille de statut : rouge à l'antenne, violette pour ce qui arrive. */
function StatusDot({ live }: { live: boolean }) {
  return <View className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-red-500' : 'bg-zevent-400'}`} />;
}

interface Highlights {
  /** Entrées retenues pour l'affichage, tronquées à `limit`. */
  entries: PlanningEntry[];
  /** Nombre total d'émissions en cours ou à venir, avant troncature. */
  total: number;
  now: number;
}

/**
 * Entrées à mettre en avant, réévaluées au rythme de l'horloge partagée : une émission
 * qui démarre bascule d'elle-même en « en cours » sans attendre un refetch du planning.
 */
function useHighlights(limit: number): Highlights {
  const { entries } = usePlanning();
  const now = useNow(30_000);
  const all = useMemo(
    () => currentAndUpcoming(entries, now, entries.length),
    [entries, now],
  );
  return {
    entries: useMemo(() => all.slice(0, limit), [all, limit]),
    total: all.length,
    now,
  };
}

/**
 * Index de tête d'une fenêtre glissante, qui avance d'un cran à cadence fixe. Reste à
 * zéro tant qu'il n'y a pas plus d'entrées que de places : rien à faire tourner.
 */
function useRotation(count: number, visible: number): number {
  const [start, setStart] = useState(0);

  useEffect(() => {
    if (count <= visible) return;
    const timer = setInterval(() => setStart((i) => (i + 1) % count), ROTATION_MS);
    return () => clearInterval(timer);
  }, [count, visible]);

  return count > visible ? start % count : 0;
}

function useOpenPlanning(): () => void {
  const router = useRouter();
  return () => router.push('/(tabs)/planning' as never);
}

/**
 * Bandeau du mode réduit : une ligne de plus sous les chiffres, séparée par un filet.
 * L'étiquette de gauche reste fixe — elle décrit l'état du bandeau, pas l'entrée courante —
 * et seuls les titres roulent vers le haut, à la manière d'un bandeau d'antenne. Un appui
 * ouvre le planning.
 */
export function PlanningTicker() {
  const { entries, now } = useHighlights(4);
  const openPlanning = useOpenPlanning();
  const index = useRotation(entries.length, 1);

  if (entries.length === 0) return null;

  const entry = entries[index];
  const live = entryStatus(entry, now) === 'live';
  const onAir = entries.some((item) => entryStatus(item, now) === 'live');
  const countdown = formatCountdown(entry.startsAt, now);

  return (
    <Pressable
      onPress={openPlanning}
      accessibilityRole="button"
      accessibilityLabel={`Planning : ${entry.title}. Ouvrir le planning`}
      className="mt-1.5 w-full active:opacity-70"
    >
      <View className="mx-5 h-px bg-white/5" />
      <View className="flex-row items-center gap-2 px-5 pt-1.5">
        <StatusDot live={onAir} />
        <Text
          className={`text-[10px] font-semibold uppercase tracking-[1.2px] ${onAir ? 'text-red-400' : 'text-gray-500'}`}
        >
          {onAir ? 'À l’antenne' : 'À suivre'}
        </Text>

        <View className="flex-1 overflow-hidden" style={{ height: ROW_HEIGHT }}>
          <Animated.View
            // La clé relance le roulement : l'ancien titre sort par le haut pendant que
            // le nouveau entre par le bas.
            key={entry.id}
            // Titre entrant pleinement opaque : c'est le mouvement qui doit se voir,
            // pas un fondu. `FadeInDown` part 25 px sous une fenêtre haute de 17, donc
            // le titre traverse tout le cadre au lieu d'apparaître sur place.
            entering={FadeInDown.duration(ROLL_MS).withInitialValues({ opacity: 1 })}
            exiting={FadeOutUp.duration(ROLL_MS)}
            className="absolute inset-x-0 top-0 flex-row items-center gap-2"
          >
            <Text className="text-[11px] font-semibold text-gray-400">
              {live ? formatParisRange(entry.startsAt, entry.endsAt) : formatParisTime(entry.startsAt)}
            </Text>
            <Text numberOfLines={1} className="flex-1 text-[11px] text-gray-300">
              {entry.title}
            </Text>
            {countdown ? <Text className="text-[11px] text-zevent-300">{countdown}</Text> : null}
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

/** Une émission du bloc confort : heure, titre, et statut ou compte à rebours. */
function HighlightRow({ entry, now }: { entry: PlanningEntry; now: number }) {
  const live = entryStatus(entry, now) === 'live';
  const countdown = formatCountdown(entry.startsAt, now);

  return (
    <View className="flex-row items-center gap-2" style={{ height: COMFORT_ROW_HEIGHT }}>
      <StatusDot live={live} />
      <Text className="w-12 text-[12px] font-semibold text-gray-400">
        {formatParisTime(entry.startsAt)}
      </Text>
      <Text numberOfLines={1} className="flex-1 text-[13px] text-gray-200">
        {entry.title}
      </Text>
      <Text className={`text-[11px] ${live ? 'font-semibold text-red-400' : 'text-zevent-300'}`}>
        {live ? 'En cours' : (countdown ?? '')}
      </Text>
    </View>
  );
}

/**
 * Bloc du mode confort : une fenêtre de deux émissions, à plat et alignées en colonnes,
 * qui glisse d'un cran à cadence fixe parmi les prochaines. Le compteur de l'en-tête dit
 * combien il y en a en tout — sans lui, deux lignes figées laisseraient croire que le
 * programme s'arrête là.
 */
export function PlanningHighlights() {
  const { entries, total, now } = useHighlights(COMFORT_POOL);
  const openPlanning = useOpenPlanning();
  const start = useRotation(entries.length, COMFORT_VISIBLE);

  if (entries.length === 0) return null;

  const visible = Math.min(COMFORT_VISIBLE, entries.length);
  const shown = Array.from({ length: visible }, (_, i) => entries[(start + i) % entries.length]);

  return (
    <View className="mt-3">
      <View className="h-px w-full bg-white/5" />
      <View className="mt-2.5 flex-row items-center justify-between">
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
          Au programme
          {total > visible ? <Text className="text-gray-600">{`  ·  ${total} à venir`}</Text> : null}
        </Text>
        <Pressable
          onPress={openPlanning}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le planning"
          hitSlop={8}
          className="active:opacity-60"
        >
          <Text className="text-[11px] text-zevent-300">Tout le planning</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={openPlanning}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le planning"
        className="mt-1 overflow-hidden active:opacity-70"
        style={{ height: visible * COMFORT_ROW_HEIGHT }}
      >
        {shown.map((entry) => (
          <Animated.View
            // La ligne du haut sort par le haut, celle du bas remonte via `layout`,
            // et la suivante entre par le bas : un tableau d'affichage qui tourne.
            key={entry.id}
            layout={LinearTransition.duration(ROLL_MS)}
            entering={FadeInDown.duration(ROLL_MS).withInitialValues({ opacity: 1 })}
            exiting={FadeOutUp.duration(ROLL_MS)}
          >
            <HighlightRow entry={entry} now={now} />
          </Animated.View>
        ))}
      </Pressable>
    </View>
  );
}
