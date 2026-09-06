import { Text, View } from 'react-native';

import { formatCount } from '@/lib/format';

interface SectionTitleProps {
  label: string;
  /** Taille du groupe, posée à côté du libellé. */
  count?: number;
}

/**
 * Intitulé d'un groupe à l'intérieur d'une liste. À ne pas confondre avec
 * `SectionHeader`, qui ouvre un chapitre : celui-ci ne fait que marquer une rupture de
 * nature entre deux paquets de lignes — les directs et les éteints, par exemple. D'où
 * les capitales espacées plutôt qu'un gros titre : il doit se voir sans interrompre.
 */
export function SectionTitle({ label, count }: SectionTitleProps) {
  return (
    <View className="flex-row items-baseline gap-2 pt-2">
      <Text className="text-[11px] font-semibold uppercase tracking-[1.2px] text-gray-500">
        {label}
      </Text>
      {count === undefined ? null : (
        <Text className="text-[11px] text-gray-600">{formatCount(count)}</Text>
      )}
    </View>
  );
}
