import { Pressable, Text, View } from 'react-native';

interface ChoiceChipsProps<T> {
  options: { key: string; label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Choix parmi quelques valeurs (pas de palier, seuil de don) sous forme de pastilles. */
export function ChoiceChips<T>({ options, value, onChange, disabled }: ChoiceChipsProps<T>) {
  return (
    <View className={`flex-row flex-wrap gap-2 ${disabled ? 'opacity-50' : ''}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.key}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
            className={`rounded-full border px-3.5 py-2 ${
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
