import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { formatCount, formatEuros } from '@/lib/format';

export interface EditionRow {
  year: number;
  totalEur: number;
  streamers: number;
  /** Marque l'édition en cours (mise en avant, montant provisoire). */
  live?: boolean;
  note?: string;
}

function Cell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-sm text-gray-200 ${className}`}>{children}</Text>;
}

/** Tableau des totaux par édition + € par streamer. La ligne en cours est mise en avant. */
export function EditionsTable({ rows }: { rows: EditionRow[] }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-gray-800">
      <View className="flex-row bg-gray-900/80 px-3 py-2">
        <Text className="w-14 text-xs font-semibold uppercase tracking-wider text-gray-400">Éd.</Text>
        <Text className="flex-1 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
          Total
        </Text>
        <Text className="w-20 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
          Streamers
        </Text>
        <Text className="w-24 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
          € / str.
        </Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.year}
          className={`flex-row items-center px-3 py-2.5 ${
            index > 0 ? 'border-t border-gray-800' : ''
          } ${row.live ? 'bg-zevent-500/10' : ''}`}
        >
          <View className="w-14 flex-row items-center gap-1">
            <Cell className={row.live ? 'font-bold text-zevent-200' : 'font-semibold'}>
              {row.year}
            </Cell>
          </View>
          <Cell className="flex-1 text-right">
            {formatEuros(row.totalEur)}
            {row.live ? ' *' : ''}
          </Cell>
          <Cell className="w-20 text-right">{formatCount(row.streamers)}</Cell>
          <Cell className="w-24 text-right">
            {row.streamers > 0 ? formatEuros(row.totalEur / row.streamers) : '—'}
          </Cell>
        </View>
      ))}
    </View>
  );
}
