import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { openTwitchStream } from '@/lib/links';
import {
  entryDurationMs,
  entryProgress,
  formatDuration,
  formatParisTime,
  LONG_RUN_MS,
} from '@/lib/planning';
import { broadcastLogin, type PlanningEntryItem } from '@/lib/planning-view';
import { ParticipantChip } from './participant-chips';
import { ReminderBell } from './reminder-bell';

/** Largeur de la colonne d'horaires : `18h00` sans jamais renvoyer à la ligne. */
const TIME_COLUMN = 44;

/** Amplitude de la barre de durée : elle ne cherche pas à mesurer, seulement à comparer. */
const BAR_MIN_HEIGHT = 10;
const BAR_MAX_HEIGHT = 42;

/**
 * Hauteur de la barre de durée d'une émission.
 *
 * Une échelle stricte est inutilisable ici : le planning va de dix minutes à neuf heures,
 * et à cette échelle une fermeture de boutique devient invisible à côté d'un stand ouvert
 * toute l'après-midi. La racine carrée tasse le haut de la plage — on voit toujours qu'une
 * émission est plus longue qu'une autre, sans que les courtes disparaissent.
 */
export function durationBarHeight(durationMs: number): number {
  const ratio = Math.min(Math.max(durationMs, 0) / LONG_RUN_MS, 1);
  return BAR_MIN_HEIGHT + (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT) * Math.sqrt(ratio);
}

interface PlanningRowProps {
  item: PlanningEntryItem;
  now: number;
  /** Logins présents dans l'état ZEvent : eux ouvrent la fiche interne plutôt que Twitch. */
  knownStreamers: Set<string>;
}

/**
 * Une émission dans le fil du programme.
 *
 * La ligne est repliée par défaut — sur un week-end entier, ce qu'on parcourt est une
 * suite d'horaires et de titres, pas vingt fiches. Le rail de gauche porte ce que le texte
 * ne donne pas d'un coup d'œil : où l'on en est dans la journée, et combien de temps dure
 * chaque créneau. Un appui déplie le reste sur place, sans quitter le fil.
 */
function PlanningRowComponent({ item, now, knownStreamers }: PlanningRowProps) {
  const [open, setOpen] = useState(false);
  const { entry, status } = item;
  const past = status === 'past';
  const live = status === 'live';

  const duration = entryDurationMs(entry);
  const barHeight = durationBarHeight(duration);
  const { ratio } = entryProgress(entry, now);
  const login = broadcastLogin(entry);

  const meta = [
    formatDuration(duration),
    item.parallel > 0 ? `${item.parallel + 1} en parallèle` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Animated.View layout={LinearTransition.duration(200)}>
      {/* La cloche est posée à côté du bouton de dépliage, jamais dedans : deux commandes
          imbriquées ne se distinguent ni au clavier ni pour un lecteur d'écran. */}
      <View className="flex-row items-start">
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${entry.title}, ${formatParisTime(entry.startsAt)}`}
          className="flex-1 flex-row gap-2.5 py-2.5 active:opacity-80"
        >
          <View style={{ width: TIME_COLUMN }} className="items-end">
            <Text
              className={`text-[13px] font-bold ${
                past ? 'text-gray-600' : live ? 'text-red-300' : 'text-gray-200'
              }`}
            >
              {formatParisTime(entry.startsAt)}
            </Text>
            {entry.endsAt ? (
              <Text className="text-[11px] text-gray-600">{formatParisTime(entry.endsAt)}</Text>
            ) : null}
          </View>

          {/* Rail du jour : un filet continu d'une émission à l'autre, sur lequel chaque
            créneau pose une barre à sa mesure. */}
          <View className="w-3 items-center">
            <View className="absolute inset-y-0 w-px bg-white/[0.07]" />
            <View
              style={{ height: barHeight }}
              className={`mt-1 w-1.5 overflow-hidden rounded-full ${
                past ? 'bg-white/10' : live ? 'bg-red-500/25' : 'bg-zevent-500/50'
              }`}
            >
              {live ? (
                <View
                  style={{ height: barHeight * ratio }}
                  className="w-full rounded-full bg-red-500"
                />
              ) : null}
            </View>
          </View>

          <View className="flex-1 gap-1">
            <View className="flex-row items-start gap-2">
              <Text
                numberOfLines={open ? undefined : 1}
                className={`flex-1 text-[15px] font-semibold ${past ? 'text-gray-500' : 'text-white'}`}
              >
                {entry.title}
              </Text>
              {live ? (
                <View className="mt-0.5 flex-row items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5">
                  <View className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-red-300">
                    En cours
                  </Text>
                </View>
              ) : null}
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#4b5563"
                style={{ marginTop: 2 }}
              />
            </View>

            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <Text className="text-[11px] text-gray-600">{meta.join(' · ')}</Text>
              {item.favorites.length > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="star" size={9} color="#c4b5fd" />
                  <Text className="text-[11px] font-semibold text-zevent-300">
                    {item.favorites.length === 1
                      ? item.favorites[0].name
                      : `${item.favorites.length} favoris`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View className="pl-2 pt-4">
          <ReminderBell entry={entry} now={now} size={16} />
        </View>
      </View>

      {/* Le détail est posé sous le bouton, pas dedans : il porte ses propres commandes,
          et les chips de participants comme le lien vers la chaîne doivent rester
          atteignables sans déclencher le repli. Il s'aligne sur la colonne du titre. */}
      {open ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          // Espacements posés en style : NativeWind ne les applique pas toujours à une
          // vue animée, et le détail se retrouvait alors collé au reste de la ligne.
          style={{ paddingLeft: TIME_COLUMN + 22, paddingBottom: 12, gap: 10 }}
        >
          {entry.description ? (
            <Text className="text-xs leading-5 text-gray-400">{entry.description}</Text>
          ) : null}

          {entry.participants.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {entry.participants.map((participant, index) => (
                <ParticipantChip
                  key={`${entry.id}:${participant.name}:${index}`}
                  participant={participant}
                  knownStreamers={knownStreamers}
                  favorite={item.favorites.includes(participant)}
                />
              ))}
            </View>
          ) : null}

          {login && !past ? (
            <Pressable
              onPress={() => void openTwitchStream(login)}
              accessibilityRole="button"
              accessibilityLabel={`Regarder ${login} sur Twitch`}
              className="flex-row items-center gap-1.5 self-start rounded-full border border-zevent-500/60 bg-zevent-500/15 px-3 py-1.5 active:opacity-70"
            >
              <Ionicons name="play" size={11} color="#c4b5fd" />
              <Text className="text-[11px] font-bold text-zevent-200">
                {live ? 'Regarder' : 'Ouvrir la chaîne'}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export const PlanningRow = memo(PlanningRowComponent);
