import { Pressable, Text, View } from 'react-native';

interface SegmentedProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  /**
   * Variante d'en-tête : des pastilles serrées dans un rail, à la largeur de leur texte.
   * Le sélecteur se range alors à côté d'un titre de section au lieu de barrer l'écran.
   */
  compact?: boolean;
}

/** Petit sélecteur en pastilles, même style que le tri de la liste des streamers. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: SegmentedProps<T>) {
  return (
    <View
      className={
        compact
          ? 'flex-row items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5'
          : 'flex-row gap-2'
      }
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={
              compact
                ? `rounded-full px-2.5 py-1 ${active ? 'bg-zevent-500/25' : ''}`
                : `flex-1 items-center rounded-full border py-2 ${
                    active ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900'
                  }`
            }
          >
            <Text
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
