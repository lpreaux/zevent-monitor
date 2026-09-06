import { Image, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { StreamerMomentum } from '@/api/donations';
import { rankChange } from '@/lib/donations';
import { formatEuros } from '@/lib/format';

interface AlwaysOnMoverRowProps {
  item: StreamerMomentum;
  position: number;
  /** Le streamer fait partie des favoris : on le signale d'une étoile. */
  favorite?: boolean;
  valueFontSize: number;
  captionFontSize: number;
}

/**
 * Streamer en progression pour l'écran secondaire : montant gagné sur la fenêtre et
 * mouvement au classement, sans interaction ni bordure claire (fond AMOLED noir).
 */
export function AlwaysOnMoverRow({
  item,
  position,
  favorite,
  valueFontSize,
  captionFontSize,
}: AlwaysOnMoverRowProps) {
  const avatar = Math.round(valueFontSize * 1.1);
  const change = rankChange(item);

  return (
    <View className="flex-row items-center gap-3 py-1.5">
      <Text
        style={{ fontSize: captionFontSize, width: captionFontSize * 1.4 }}
        className="text-center font-bold text-gray-600"
      >
        {position}
      </Text>
      <Image
        source={{ uri: item.profileUrl }}
        style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }}
        className="bg-gray-900"
      />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          {item.online ? (
            <View
              style={{ width: captionFontSize * 0.5, height: captionFontSize * 0.5 }}
              className="rounded-full bg-red-500"
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={{ fontSize: captionFontSize * 1.15 }}
            className="flex-1 font-semibold text-gray-200"
          >
            {favorite ? '★ ' : ''}
            {item.display}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text style={{ fontSize: captionFontSize }} className="text-gray-600">
            {`#${item.rank}`}
          </Text>
          {change != null && change !== 0 ? (
            <>
              <Ionicons
                name={change > 0 ? 'arrow-up' : 'arrow-down'}
                size={captionFontSize}
                color={change > 0 ? '#34d399' : '#f87171'}
              />
              <Text
                style={{ fontSize: captionFontSize }}
                className={`font-semibold ${change > 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {Math.abs(change)}
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <Text style={{ fontSize: valueFontSize }} className="font-bold text-emerald-400">
        {`+${formatEuros(item.deltaCents / 100)}`}
      </Text>
    </View>
  );
}
