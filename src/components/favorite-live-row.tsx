import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

import type { PlanningEntry } from '@/api/types';
import type { ScoredFavorite } from '@/lib/favorite-relevance';
import { formatCount, formatEuros } from '@/lib/format';
import { streamerActivity } from '@/lib/streamer-activity';
import { StreamerActivityLine } from './streamer-activity-line';
import { StreamerAvatar } from './streamer-avatar';
import { WatchButton } from './watch-button';

interface FavoriteLiveRowProps {
  item: ScoredFavorite;
  /** Show du planning en cours pour ce streamer, s'il y en a un. */
  show?: PlanningEntry;
}

/**
 * Favori en direct, en une ligne dense : anneau rouge en guise de pastille, activité
 * en cours, cagnotte et progression récente. Le corps mène au détail, le bouton de
 * droite lance le stream sans détour.
 */
function FavoriteLiveRowComponent({ item, show }: FavoriteLiveRowProps) {
  const { streamer, deltaCents } = item;
  const activity = streamerActivity(streamer, show);

  return (
    <View className="flex-row items-center gap-2 py-2.5">
      <Link
        href={{ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } }}
        asChild
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Détails de ${streamer.display}`}
          className="flex-1 flex-row items-center gap-3 active:opacity-60"
        >
          <StreamerAvatar uri={streamer.profileUrl} size={38} online />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-white">
              {streamer.display}
            </Text>
            <View className="mt-0.5">
              <StreamerActivityLine activity={activity} size={11} />
            </View>
          </View>
          <View className="items-end">
            <Text className="text-sm font-bold text-zevent-300">
              {formatEuros(streamer.donationAmount.number)}
            </Text>
            {deltaCents > 0 ? (
              <Text className="text-[11px] font-semibold text-emerald-400">
                +{formatEuros(deltaCents / 100)}
              </Text>
            ) : (
              <Text className="text-[11px] text-gray-600">
                {formatCount(streamer.viewersAmount.number)} viewers
              </Text>
            )}
          </View>
        </Pressable>
      </Link>

      <WatchButton twitch={streamer.twitch} display={streamer.display} />
    </View>
  );
}

export const FavoriteLiveRow = memo(FavoriteLiveRowComponent);
