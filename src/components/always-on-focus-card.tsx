import { Image, Text, View } from 'react-native';

import type { Streamer } from '@/api/types';
import type { GoalProgressSummary, PlanningFocus, StreamerStanding } from '@/lib/always-on-focus';
import { AnimatedEuros } from '@/components/animated-euros';
import { formatCount, formatEuros, formatPercent, formatRank } from '@/lib/format';
import { formatCountdown, formatParisRange } from '@/lib/planning';

interface AlwaysOnFocusCardProps {
  streamer: Streamer;
  standing: StreamerStanding;
  /** Prochain palier InGDoc, `null` si aucun n'est connu pour ce streamer. */
  goal: GoalProgressSummary | null;
  planning: PlanningFocus;
  /** Progression de la cagnotte perso sur la dernière heure, `null` si la courbe manque. */
  deltaEurPerHour: number | null;
  now: number;
  amountFontSize: number;
  deltaFontSize: number;
  statValueFontSize: number;
  captionFontSize: number;
  avatarSize: number;
}

/**
 * Streamer mis en avant sur l'écran secondaire : identité, activité, cagnotte
 * personnelle, rythme sur la dernière heure, prochain palier et show en cours.
 */
export function AlwaysOnFocusCard({
  streamer,
  standing,
  goal,
  planning,
  deltaEurPerHour,
  now,
  amountFontSize,
  deltaFontSize,
  statValueFontSize,
  captionFontSize,
  avatarSize,
}: AlwaysOnFocusCardProps) {
  const show = planning.current ?? planning.next;
  const showIsLive = planning.current != null;

  return (
    <View>
      <View className="flex-row items-center gap-3">
        <Image
          source={{ uri: streamer.profileUrl }}
          style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
          className="bg-gray-900"
        />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            {streamer.online ? (
              <View
                style={{ width: captionFontSize * 0.55, height: captionFontSize * 0.55 }}
                className="rounded-full bg-red-500"
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={{ fontSize: statValueFontSize * 1.15 }}
              className="flex-1 font-bold text-white"
            >
              {streamer.display}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: captionFontSize }} className="mt-0.5 text-gray-500">
            {streamer.online
              ? `${formatCount(streamer.viewersAmount.number)} viewers${streamer.game ? ` — ${streamer.game}` : ''}`
              : 'Hors ligne'}
          </Text>
        </View>
      </View>

      <Text
        style={{ fontSize: captionFontSize, marginTop: 10 }}
        className="uppercase tracking-widest text-zevent-400"
      >
        Cagnotte personnelle
      </Text>
      <AnimatedEuros
        value={streamer.donationAmount.number}
        style={{ fontSize: amountFontSize, marginTop: 2 }}
      />

      <Text style={{ fontSize: deltaFontSize * 0.8 }} className="font-semibold text-gray-400">
        {formatRank(standing.donationRank)}
        <Text className="font-normal text-gray-600">{` / ${standing.total}`}</Text>
        {standing.share != null ? (
          <Text className="font-normal text-gray-600">
            {`  •  ${formatPercent(standing.share)} de la cagnotte`}
          </Text>
        ) : null}
        {standing.viewersRank != null ? (
          <Text className="font-normal text-gray-600">
            {`  •  ${formatRank(standing.viewersRank)} en viewers`}
          </Text>
        ) : null}
      </Text>

      {deltaEurPerHour != null ? (
        <Text
          style={{ fontSize: deltaFontSize * 0.9 }}
          className={`font-semibold ${
            deltaEurPerHour >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {`${deltaEurPerHour >= 0 ? '+' : '−'}${formatEuros(Math.abs(deltaEurPerHour))} en 1 h`}
        </Text>
      ) : null}

      {goal ? (
        <View className="mt-3">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text
              numberOfLines={1}
              style={{ fontSize: captionFontSize }}
              className="flex-1 uppercase tracking-widest text-gray-600"
            >
              {`Palier ${goal.reachedCount + 1}/${goal.total} — ${goal.goal.label}`}
            </Text>
            <Text style={{ fontSize: captionFontSize }} className="text-gray-500">
              {`reste ${formatEuros(goal.remaining)}`}
            </Text>
          </View>
          <View
            style={{ height: Math.max(4, Math.round(captionFontSize * 0.4)) }}
            className="mt-1.5 overflow-hidden rounded-full bg-gray-900"
          >
            <View
              style={{ width: `${Math.round(goal.ratio * 100)}%` }}
              className="h-full rounded-full bg-zevent-500"
            />
          </View>
        </View>
      ) : null}

      {show ? (
        <View className="mt-3 flex-row items-center gap-2">
          <View
            style={{ width: captionFontSize * 0.5, height: captionFontSize * 0.5 }}
            className={`rounded-full ${showIsLive ? 'bg-red-500' : 'bg-gray-700'}`}
          />
          <Text numberOfLines={1} style={{ fontSize: captionFontSize }} className="flex-1 text-gray-400">
            {showIsLive ? 'En direct — ' : `${formatCountdown(show.startsAt, now) ?? 'À suivre'} — `}
            <Text className="font-semibold text-gray-300">{show.title}</Text>
            {` (${formatParisRange(show.startsAt, show.endsAt)})`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
