import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { iconSizes, icons, type IconName } from '@/lib/icons';
import { colors } from '@/theme';

interface NavRowProps {
  icon: IconName;
  label: string;
  /** Ce qu'on trouve derrière, en une ligne : un intitulé seul ne dit pas ce qu'on y règle. */
  hint?: string;
  onPress: () => void;
}

/**
 * Ligne qui mène ailleurs : icône, intitulé, ce qu'on y trouve, chevron.
 *
 * Le même dessin sert dans le dépliage du socle et dans le hub des réglages, et c'est
 * voulu : ce sont les deux endroits d'où l'on quitte l'écran courant pour une page de
 * l'application, et deux dessins pour un même geste se paient en apprentissage.
 */
export function NavRow({ icon, label, hint, onPress }: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 py-2.5 active:opacity-60"
    >
      <Icon name={icon} size={iconSizes.button} color={colors.brandSoft} />
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-gray-200">{label}</Text>
        {hint ? (
          <Text numberOfLines={1} className="text-[11px] text-gray-500">
            {hint}
          </Text>
        ) : null}
      </View>
      <Icon name={icons.forward} size={iconSizes.row} color={colors.inactive} />
    </Pressable>
  );
}
