import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Recap } from '@/api/recaps';
import { RecapSparkline } from '@/components/recap-sparkline';
import { formatCount, formatEuros } from '@/lib/format';
import { personalizeRecap } from '@/lib/recap-personalization';
import { recapSubtitle, recapTitle } from '@/lib/recap-view';

interface RecapCardProps {
  recap: Recap;
  favorites: readonly string[];
  /** Cagnotte au fil de la période : la vignette de rythme n'est dessinée qu'avec elle. */
  points?: readonly number[];
  read: boolean;
  onPress: () => void;
  /** Suppression proposée par appui long, sur les seuls récaps qu'on peut retirer. */
  onLongPress?: () => void;
  /**
   * Carte de tête du sommaire : largeur fixe, montant plus grand. C'est la même carte, à
   * une autre échelle — deux dessins distincts pour la même chose finissent par diverger.
   */
  featured?: boolean;
}

const KIND_LABEL: Record<Recap['kind'], string> = {
  day: 'Journée',
  scheduled: 'Programmé',
  manual: 'Manuel',
};

function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'brand' }) {
  return (
    <View
      className={`rounded-full px-2 py-0.5 ${
        tone === 'brand' ? 'bg-zevent-500/20' : 'bg-white/5'
      }`}
    >
      <Text
        className={`text-[10px] font-semibold ${
          tone === 'brand' ? 'text-zevent-200' : 'text-gray-400'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Une période de l'événement résumée en une carte : ce qu'elle a rapporté, à quel rythme,
 * et ce qu'elle contient qui concerne les streamers suivis.
 *
 * Le montant est ce qu'on vient chercher, il est donc traité comme le sujet ; le reste
 * l'accompagne sans lui disputer la place. La ligne des favoris ferme la carte parce que
 * c'est la seule chose qui change d'un lecteur à l'autre : la lire en dernier, c'est passer
 * du commun au personnel.
 */
export function RecapCard({
  recap,
  favorites,
  points,
  read,
  onPress,
  onLongPress,
  featured = false,
}: RecapCardProps) {
  const { summary, counts } = recap.content;
  const personal = personalizeRecap(recap.content, favorites);
  const partial = summary.coverage ? !summary.coverage.complete : false;
  const favoriteLine = personal.favoriteProgressions[0];

  return (
    <Pressable
      onPress={onPress}
      {...(onLongPress ? { onLongPress, delayLongPress: 400 } : {})}
      accessibilityRole="button"
      accessibilityLabel={`${recapTitle(recap)}, ${formatEuros(summary.raisedCents / 100)} collectés`}
      style={featured ? { width: 268 } : undefined}
      className="gap-3 rounded-2xl border border-white/10 bg-surface p-4 active:opacity-70"
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            {!read ? <View className="h-1.5 w-1.5 rounded-full bg-zevent-400" /> : null}
            <Text numberOfLines={1} className="flex-1 text-base font-bold text-white">
              {recapTitle(recap)}
            </Text>
          </View>
          <Text numberOfLines={1} className="text-[11px] text-gray-500">
            {recapSubtitle(recap)}
          </Text>
        </View>
        {recap.inProgress ? (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5">
            <View className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <Text className="text-[10px] font-semibold text-gray-300">En cours</Text>
          </View>
        ) : (
          <Tag label={KIND_LABEL[recap.kind]} tone={recap.kind === 'day' ? 'brand' : 'neutral'} />
        )}
      </View>

      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <Text className={`font-black text-white ${featured ? 'text-3xl' : 'text-2xl'}`}>
            +{formatEuros(summary.raisedCents / 100)}
          </Text>
          {summary.endCents !== null ? (
            <Text className="text-[11px] text-gray-500">
              cagnotte à {formatEuros(summary.endCents / 100)}
            </Text>
          ) : null}
        </View>
        {points && points.length > 1 ? (
          <View className="w-24">
            <RecapSparkline points={points} height={featured ? 38 : 30} />
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {counts.goalsReached > 0 ? (
          <Text className="text-[11px] text-gray-400">{counts.goalsReached} goals</Text>
        ) : null}
        {counts.bigDonations > 0 ? (
          <Text className="text-[11px] text-gray-400">{counts.bigDonations} gros dons</Text>
        ) : null}
        {counts.milestones > 0 ? (
          <Text className="text-[11px] text-gray-400">{counts.milestones} paliers</Text>
        ) : null}
        {summary.peakViewers > 0 ? (
          <Text className="text-[11px] text-gray-400">
            pic {formatCount(summary.peakViewers)}
          </Text>
        ) : null}
        {partial ? <Text className="text-[11px] text-amber-400">période partielle</Text> : null}
      </View>

      {personal.hasFavoriteContent ? (
        <View className="flex-row items-center gap-2 border-t border-white/5 pt-2.5">
          <Ionicons name="star" size={12} color="#fbbf24" />
          <Text numberOfLines={1} className="flex-1 text-[11px] text-amber-200">
            {favoriteLine
              ? `${favoriteLine.display} +${formatEuros(favoriteLine.raisedCents / 100)}`
              : `${personal.favoriteLiveStarts.length} favori(s) passé(s) en live`}
            {personal.favoriteGoals.length > 0 ? ` · ${personal.favoriteGoals.length} goal(s)` : ''}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
