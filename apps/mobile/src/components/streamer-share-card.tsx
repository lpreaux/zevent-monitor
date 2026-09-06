import { forwardRef } from 'react';
import { Image, Text, View } from 'react-native';

import type { Goal, Streamer } from '@/api/types';
import { parisClock } from '@/lib/donations';
import { formatCount, formatEuros, formatPercent, formatRank } from '@/lib/format';
import type { StreamerStanding } from '@/lib/streamer-profile';

interface StreamerShareCardProps {
  streamer: Streamer;
  standing: StreamerStanding;
  /** Progression sur la fenêtre courte (centimes), 0 si elle est inconnue. */
  deltaCents: number;
  windowMinutes: number;
  /** Prochain palier et ce qu'il en reste, `null` si la source n'en connaît pas. */
  nextGoal: { goal: Goal; remaining: number } | null;
  /** Instant représenté par la carte, en ISO. */
  capturedAt: string;
}

/** Chiffre encadré de la carte : elle est faite pour être lue en vignette, d'où les cadres. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white/5 p-3">
      <Text className="text-[11px] uppercase tracking-wider text-gray-400">{label}</Text>
      <Text numberOfLines={1} className="mt-0.5 text-xl font-bold text-white">
        {value}
      </Text>
      {hint ? <Text className="text-[11px] text-gray-500">{hint}</Text> : null}
    </View>
  );
}

/**
 * Carte « ce streamer à l'instant T », faite pour sortir de l'application en PNG.
 *
 * Elle ne reprend pas la fiche : une capture d'écran n'a ni courbe lisible ni liste de
 * dons: ce qui survit à la réduction en vignette, c'est un nom, un montant, une place et
 * un palier. Le fond est opaque et posé en style plutôt qu'en classe — la capture rend
 * hors de l'arbre de l'écran, où un fond transparent donnerait un PNG à trous.
 */
export const StreamerShareCard = forwardRef<View, StreamerShareCardProps>(
  function StreamerShareCard(
    { streamer, standing, deltaCents, windowMinutes, nextGoal, capturedAt },
    ref,
  ) {
    return (
      <View
        ref={ref}
        collapsable={false}
        style={{ backgroundColor: '#12082b' }}
        className="gap-5 rounded-3xl border border-zevent-500/40 p-6"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-widest text-zevent-300">
            ZEvent 2026
          </Text>
          <Text className="text-xs text-gray-400">{parisClock(capturedAt)} · Paris</Text>
        </View>

        <View className="flex-row items-center gap-3">
          <Image
            source={{ uri: streamer.profileUrl }}
            style={{ width: 56, height: 56, borderRadius: 28 }}
            className="bg-gray-800"
          />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-xl font-extrabold text-white">
              {streamer.display}
            </Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              {streamer.online ? <View className="h-2 w-2 rounded-full bg-red-500" /> : null}
              <Text numberOfLines={1} className="flex-1 text-xs text-gray-400">
                {streamer.online
                  ? `En direct${streamer.game ? ` · ${streamer.game}` : ''} · ${formatCount(streamer.viewersAmount.number)} viewers`
                  : 'Hors ligne'}
              </Text>
            </View>
          </View>
        </View>

        <View>
          <Text className="text-sm text-gray-300">Sa cagnotte</Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            className="mt-1 text-5xl font-extrabold text-white"
          >
            {formatEuros(streamer.donationAmount.number)}
          </Text>
          {deltaCents > 0 ? (
            <Text className="mt-1 text-base font-semibold text-emerald-400">
              {`+${formatEuros(deltaCents / 100)} sur les ${windowMinutes} dernières minutes`}
            </Text>
          ) : null}
        </View>

        <View className="flex-row gap-3">
          <Tile
            label="Classement"
            value={formatRank(standing.donationRank)}
            hint={`sur ${formatCount(standing.total)} streamers`}
          />
          <Tile
            label="Part du total"
            value={standing.share === null ? '—' : formatPercent(standing.share)}
            hint="de la cagnotte 2026"
          />
        </View>

        {nextGoal ? (
          <View className="gap-1 rounded-2xl bg-white/5 p-3">
            <Text className="text-[11px] uppercase tracking-wider text-gray-400">
              Prochain palier
            </Text>
            <Text numberOfLines={2} className="text-sm font-semibold text-white">
              {nextGoal.goal.label}
            </Text>
            <Text className="text-xs text-zevent-200">
              {`il manque ${formatEuros(nextGoal.remaining)}`}
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-center justify-between">
          <Text numberOfLines={1} className="flex-1 text-xs text-gray-400">
            {`twitch.tv/${streamer.twitch.toLowerCase()}`}
          </Text>
          <Text className="text-xs text-gray-600">ZEvent Monitor</Text>
        </View>
      </View>
    );
  },
);
