import { Text, View } from 'react-native';

import type { WebsiteMode } from '@/api/types';

const LABELS: Record<WebsiteMode, { text: string; bg: string; fg: string }> = {
  offline: { text: 'En attente', bg: 'bg-gray-700/60', fg: 'text-gray-200' },
  concert: { text: 'Concert d’ouverture', bg: 'bg-amber-500/20', fg: 'text-amber-300' },
  online: { text: 'En direct', bg: 'bg-emerald-500/20', fg: 'text-emerald-300' },
};

export function WebsiteModeBadge({ mode }: { mode: WebsiteMode }) {
  const entry = LABELS[mode] ?? LABELS.offline;
  return (
    <View className={`self-start rounded-full px-3 py-1 ${entry.bg}`}>
      <Text className={`text-xs font-semibold uppercase tracking-wider ${entry.fg}`}>
        {entry.text}
      </Text>
    </View>
  );
}
