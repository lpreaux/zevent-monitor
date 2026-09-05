import { Pressable, Text, View } from 'react-native';

interface SegmentedProps<T extends string> {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  /**
   * Rail resserré : les pastilles reviennent à la largeur de leur texte, et l'ensemble
   * se range à côté d'un titre de section ou dans un en-tête replié au lieu de barrer
   * l'écran. Le dessin, lui, ne change pas.
   */
  compact?: boolean;
}

/**
 * Sélecteur en pastilles, dessin unique : un rail bordé, des pastilles à l'intérieur,
 * celle qui est active remplie.
 *
 * Déployé ou resserré, c'est le même objet à deux tailles — un rail qui se transformait
 * en trois boutons séparés donnait deux dessins à animer l'un vers l'autre, et la
 * transition ne pouvait que sembler cassée. Ici il ne reste qu'un changement d'échelle,
 * que les animations de disposition savent interpoler.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: SegmentedProps<T>) {
  return (
    <View
      className={`flex-row items-center rounded-full border border-white/10 bg-white/5 p-0.5 ${
        compact ? 'gap-0.5' : 'gap-1'
      }`}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`items-center rounded-full active:opacity-70 ${
              compact ? 'px-2.5 py-1' : 'flex-1 px-3 py-1.5'
            } ${active ? 'bg-zevent-500/25' : ''}`}
          >
            <Text
              numberOfLines={1}
              className={`font-semibold ${compact ? 'text-[11px]' : 'text-xs'} ${
                active ? 'text-zevent-200' : 'text-gray-400'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
