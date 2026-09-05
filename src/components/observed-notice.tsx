import { Text } from 'react-native';

import type { Observed } from '@/api/donations';
import { formatCount, formatRelativeTime } from '@/lib/format';

interface ObservedNoticeProps {
  observed: Observed | undefined;
  /** Phrase d'introduction (« Classement établi », « Feed établi »…). */
  prefix?: string;
}

/**
 * Rappel de provenance : le feed Streamlabs ne montre qu'une fenêtre de dons récents, les
 * chiffres sont donc établis « d'après les dons observés » (PLAN.md §5).
 */
export function ObservedNotice({ observed, prefix = 'Établi' }: ObservedNoticeProps) {
  if (!observed || observed.count === 0) {
    return (
      <Text className="text-xs text-gray-600">
        Aucun don observé pour l’instant. Le feed Streamlabs est relevé toutes les 20 s.
      </Text>
    );
  }
  return (
    <Text className="text-xs text-gray-600">
      {prefix} d’après {formatCount(observed.count)} dons observés
      {observed.firstAt ? ` depuis ${formatRelativeTime(observed.firstAt)}` : ''}. Le feed
      Streamlabs peut manquer des dons en pic d’affluence.
    </Text>
  );
}
