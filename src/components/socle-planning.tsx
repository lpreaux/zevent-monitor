import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { usePlanning } from '@/api/queries';
import type { PlanningEntry } from '@/api/types';
import {
  currentAndUpcoming,
  entryStatus,
  formatCountdown,
  formatParisTime,
} from '@/lib/planning';
import { useNow } from '@/lib/use-now';

/** Cadence de rotation : assez lente pour finir de lire un titre. */
const ROTATION_MS = 4_500;

/** Durée du roulement d'une ligne à la suivante : assez longue pour se lire comme un mouvement. */
const ROLL_MS = 480;

/** Deux émissions visibles à la fois, puisées dans les six prochaines. */
const VISIBLE = 2;
const POOL = 6;
const ROW_HEIGHT = 26;

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

/** Une émission du bloc : heure, titre, et statut ou compte à rebours. */
function HighlightRow({ entry, now }: { entry: PlanningEntry; now: number }) {
  const live = entryStatus(entry, now) === 'live';
  const countdown = formatCountdown(entry.startsAt, now);

  return (
    <View className="flex-row items-center gap-2" style={{ height: ROW_HEIGHT }}>
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
 * Ce qui passe et ce qui suit, dans le dépliage du socle : une fenêtre de deux émissions,
 * à plat et alignées en colonnes, qui glisse d'un cran à cadence fixe parmi les
 * prochaines. Le compteur de l'en-tête dit combien il y en a en tout — sans lui, deux
 * lignes figées laisseraient croire que le programme s'arrête là.
 *
 * L'ouverture du planning est passée en paramètre plutôt que prise sur le routeur : le
 * socle doit se replier en même temps qu'il navigue, et ce bloc n'a pas à savoir qu'il
 * vit dans quelque chose de dépliable.
 */
export function SoclePlanning({ onOpen }: { onOpen: () => void }) {
  const { entries, total, now } = useHighlights(POOL);
  const start = useRotation(entries.length, VISIBLE);

  if (entries.length === 0) return null;

  const visible = Math.min(VISIBLE, entries.length);
  const shown = Array.from({ length: visible }, (_, i) => entries[(start + i) % entries.length]);

  return (
    <View>
      <View className="h-px w-full bg-white/5" />
      <View className="mt-2.5 flex-row items-center justify-between">
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
          Au programme
          {total > visible ? <Text className="text-gray-600">{`  ·  ${total} à venir`}</Text> : null}
        </Text>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le planning"
          hitSlop={8}
          className="active:opacity-60"
        >
          <Text className="text-[11px] text-zevent-300">Tout le planning</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le planning"
        className="mt-1 overflow-hidden active:opacity-70"
        style={{ height: visible * ROW_HEIGHT }}
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
