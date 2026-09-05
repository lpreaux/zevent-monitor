import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Observed } from '@/api/donations';
import { formatCount, formatRelativeTime } from '@/lib/format';

interface ObservedChipProps {
  observed: Observed | undefined;
  /** Ce qui est établi d'après ces dons (« Ce classement », « Cette analyse »). */
  subject?: string;
}

/**
 * Provenance des chiffres de dons, en une ligne dépliable.
 *
 * Le feed Streamlabs ne montre qu'une fenêtre de dons récents : tout ce qui en découle est
 * établi « d'après les dons observés » (PLAN.md §5), et l'app doit le dire. Mais le dire
 * trois fois en paragraphe sur le même écran finit par ne plus rien dire : la mention
 * tient donc sur une ligne, et le détail attend qu'on le demande.
 */
export function ObservedChip({ observed, subject = 'Ces chiffres' }: ObservedChipProps) {
  const [open, setOpen] = useState(false);

  if (!observed || observed.count === 0) {
    return (
      <Text className="text-[11px] text-gray-600">
        Aucun don observé pour l’instant. Le feed Streamlabs est relevé toutes les 20 s.
      </Text>
    );
  }

  return (
    <View className="gap-1.5">
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Provenance des chiffres"
        hitSlop={8}
        className="flex-row items-center gap-1 active:opacity-60"
      >
        <Ionicons name="information-circle-outline" size={12} color="#6b7280" />
        <Text className="shrink text-[11px] text-gray-600">
          D’après {formatCount(observed.count)} dons observés
          {observed.firstAt ? ` depuis ${formatRelativeTime(observed.firstAt)}` : ''}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={11} color="#6b7280" />
      </Pressable>

      {open ? (
        <Animated.Text
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          className="text-[11px] leading-4 text-gray-600"
        >
          {subject} ne portent que sur les dons vus passer dans le feed Streamlabs, relevé
          toutes les 20 s et limité aux 3 000 derniers dons. En pic d’affluence, des dons
          peuvent échapper à deux relevés successifs : les totaux d’ici sont donc un plancher,
          pas la cagnotte officielle.
        </Animated.Text>
      ) : null}
    </View>
  );
}
