import { Pressable, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

interface NewItemsPillProps {
  count: number;
  onPress: () => void;
  /** Libellé au singulier, accordé par le composant : « nouveau don ». */
  noun: string;
}

/**
 * Rappel des arrivées pendant qu'on lit plus bas.
 *
 * Un feed qui se rafraîchit tout seul pose un dilemme : pousser les nouvelles lignes en
 * tête déplace ce qu'on est en train de lire, ne rien faire les cache. La pastille tranche
 * — les lignes sont déjà là, la liste ne bouge pas, et un tap ramène en tête.
 */
export function NewItemsPill({ count, onPress, noun }: NewItemsPillProps) {
  if (count <= 0) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(150)}
      className="items-center"
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Revenir en haut, ${count} ${noun}${count > 1 ? 's' : ''}`}
        className="flex-row items-center gap-1.5 rounded-full bg-zevent-500 px-3.5 py-1.5 active:opacity-80"
      >
        <Ionicons name="arrow-up" size={13} color="#ffffff" />
        <Text className="text-xs font-bold text-white">
          {count} {noun}
          {count > 1 ? 's' : ''}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
