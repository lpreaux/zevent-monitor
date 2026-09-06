import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { formatEuros } from '@/lib/format';
import type { RecapEventKind, RecapTimelineItem } from '@/lib/recap-view';
import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** À chaque nature de fait son icône : la colonne de gauche se lit sans lire les lignes. */
const ICONS: Record<RecapEventKind, IconName> = {
  milestone: 'flag',
  bigDonation: 'cash',
  goal: 'trophy',
  liveStart: 'radio',
};

const TONES: Record<RecapEventKind, string> = {
  milestone: colors.brandSoft,
  bigDonation: '#6ee7b7',
  goal: '#fbbf24',
  liveStart: '#f87171',
};

const clock = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

interface RecapTimelineProps {
  items: readonly RecapTimelineItem[];
  hidden: number;
  onOpenStreamer: (twitch: string) => void;
}

/**
 * Les faits de la période remis dans l'ordre, le long d'un fil.
 *
 * L'heure tient la colonne de gauche et le trait vertical relie les moments entre eux :
 * c'est ce qui transforme quatre inventaires — paliers, dons, goals, lives — en un
 * déroulé qu'on lit du début à la fin, où l'on voit qu'un gros don a suivi un palier et
 * non l'inverse.
 */
export function RecapTimeline({ items, hidden, onOpenStreamer }: RecapTimelineProps) {
  return (
    <View className="gap-0">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const body = (
          <View className="flex-row gap-3">
            <View className="w-11 pt-0.5">
              <Text className="text-[11px] font-semibold text-gray-400">
                {clock.format(new Date(item.at))}
              </Text>
            </View>

            <View className="items-center">
              <View
                className="h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: `${TONES[item.kind]}22` }}
              >
                <Ionicons name={ICONS[item.kind]} size={12} color={TONES[item.kind]} />
              </View>
              {/* Le trait s'arrête au dernier fait : rien ne suit, la période est finie. */}
              {last ? null : <View className="w-px flex-1 bg-white/10" />}
            </View>

            <View className={`flex-1 gap-0.5 ${last ? '' : 'pb-4'}`}>
              <View className="flex-row items-baseline gap-2">
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-sm ${item.favorite ? 'font-bold text-amber-100' : 'text-gray-200'}`}
                >
                  {item.title}
                </Text>
                {item.amountCents !== undefined ? (
                  <Text className="text-sm font-bold text-emerald-300">
                    {formatEuros(item.amountCents / 100)}
                  </Text>
                ) : null}
              </View>
              {item.detail ? (
                <Text numberOfLines={1} className="text-[11px] text-gray-400">
                  {item.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );

        return item.twitch ? (
          <Pressable
            key={item.key}
            onPress={() => onOpenStreamer(item.twitch!)}
            accessibilityRole="button"
            className="active:opacity-70"
          >
            {body}
          </Pressable>
        ) : (
          <View key={item.key}>{body}</View>
        );
      })}

      {hidden > 0 ? (
        <Text className="pl-[56px] pt-1 text-[11px] text-gray-400">
          + {hidden} autres faits sur la période
        </Text>
      ) : null}
    </View>
  );
}
