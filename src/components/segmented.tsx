import { Pressable, Text, View } from 'react-native';

interface SegmentedProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}

/** Petit sélecteur en pastilles, même style que le tri de la liste des streamers. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            className={`flex-1 items-center rounded-full border py-2 ${
              active ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${active ? 'text-zevent-200' : 'text-gray-400'}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
