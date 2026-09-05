import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

type IconName = keyof typeof Ionicons.glyphMap;

interface ToggleChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Croix de retrait à droite : le filtre est posé, on peut le défaire d'un geste. */
  onRemove?: () => void;
  accessibilityLabel?: string;
}

/**
 * Filtre qu'on pose et qu'on retire, par opposition à `ChoiceChips` où l'on choisit une
 * valeur parmi d'autres. Plusieurs peuvent être actifs en même temps : c'est tout
 * l'intérêt — « les messages, au-dessus de 100 €, chez mes favoris » est une question
 * qu'on se pose d'un seul tenant.
 */
export function ToggleChip({
  label,
  active,
  onPress,
  icon,
  onRemove,
  accessibilityLabel,
}: ToggleChipProps) {
  return (
    <View
      className={`flex-row items-center rounded-full border ${
        active ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900'
      }`}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={accessibilityLabel ?? label}
        className={`flex-row items-center gap-1.5 py-1.5 pl-3 active:opacity-70 ${
          onRemove ? 'pr-1.5' : 'pr-3'
        }`}
      >
        {icon ? (
          <Ionicons name={icon} size={12} color={active ? '#c4b5fd' : '#9ca3af'} />
        ) : null}
        <Text
          numberOfLines={1}
          className={`text-xs font-semibold ${active ? 'text-zevent-200' : 'text-gray-400'}`}
        >
          {label}
        </Text>
      </Pressable>

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Retirer le filtre ${label}`}
          hitSlop={8}
          className="pl-0.5 pr-2.5 active:opacity-60"
        >
          <Ionicons name="close" size={13} color={active ? '#c4b5fd' : '#9ca3af'} />
        </Pressable>
      ) : null}
    </View>
  );
}
