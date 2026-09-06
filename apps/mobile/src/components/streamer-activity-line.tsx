import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { StreamerActivity } from '@/lib/streamer-activity';

/** Un show annoncé au planning mérite d'être remarqué ; un jeu reste une info de contexte. */
const TONE = {
  planning: { text: 'text-amber-200/90', icon: '#fcd34d' },
  game: { text: 'text-gray-400', icon: '#9ca3af' },
  live: { text: 'text-gray-400', icon: '#9ca3af' },
  offline: { text: 'text-gray-600', icon: '#4b5563' },
} as const;

interface StreamerActivityLineProps {
  activity: StreamerActivity;
  size?: number;
}

/** Ce que fait le streamer, en une ligne : icône + libellé, tronqué sans jamais passer à la ligne. */
export function StreamerActivityLine({ activity, size = 12 }: StreamerActivityLineProps) {
  const tone = TONE[activity.kind];

  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={activity.icon} size={size} color={tone.icon} />
      <Text numberOfLines={1} style={{ fontSize: size }} className={`flex-1 ${tone.text}`}>
        {activity.label}
      </Text>
    </View>
  );
}
