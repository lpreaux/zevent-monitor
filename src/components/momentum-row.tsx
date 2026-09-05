import { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { StreamerMomentum } from '@/api/donations';
import { rankChange } from '@/lib/donations';
import { formatEuros } from '@/lib/format';

interface MomentumRowProps {
  item: StreamerMomentum;
  position: number;
  favorite?: boolean;
}

/** Évolution du rang au classement par cagnotte : flèche verte/rouge ou tiret. */
function RankBadge({ item }: { item: StreamerMomentum }) {
  const change = rankChange(item);
  if (change === null) return <Text className="text-xs text-gray-600">#{item.rank}</Text>;
  if (change === 0) return <Text className="text-xs text-gray-500">#{item.rank} =</Text>;
  const up = change > 0;
  return (
    <View className="flex-row items-center gap-0.5">
      <Text className="text-xs text-gray-500">#{item.rank}</Text>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? '#34d399' : '#f87171'} />
      <Text className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {Math.abs(change)}
      </Text>
    </View>
  );
}

function MomentumRowComponent({ item, position, favorite }: MomentumRowProps) {
  return (
    <Link href={{ pathname: '/streamer/[twitch]', params: { twitch: item.twitch } }} asChild>
      <Pressable className="flex-row items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3 active:opacity-70">
        <Text className="w-5 text-center text-sm font-bold text-gray-500">{position}</Text>
        <Image source={{ uri: item.profileUrl }} className="h-10 w-10 rounded-full bg-gray-800" />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-white" numberOfLines={1}>
            {favorite ? '★ ' : ''}
            {item.display}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            {item.online ? <View className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
            <Text className="text-xs text-gray-500" numberOfLines={1}>
              {item.online ? item.game || 'En stream' : 'Hors ligne'}
            </Text>
          </View>
        </View>
        <View className="items-end gap-0.5">
          <Text className="text-sm font-bold text-emerald-400">
            +{formatEuros(item.deltaCents / 100)}
          </Text>
          <RankBadge item={item} />
        </View>
      </Pressable>
    </Link>
  );
}

export const MomentumRow = memo(MomentumRowComponent);
