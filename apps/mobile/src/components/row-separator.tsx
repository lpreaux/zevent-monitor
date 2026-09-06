import { View } from 'react-native';

/**
 * Filet entre deux lignes d'une même liste. Plus léger qu'une bordure de carte : il
 * sépare sans redécouper la page en blocs.
 */
export function RowSeparator({ inset = 0 }: { inset?: number }) {
  return <View style={{ marginLeft: inset }} className="h-px bg-white/[0.06]" />;
}
