import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';

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
      <Button
        size="sm"
        icon="arrow-up"
        label={`${count} ${noun}${count > 1 ? 's' : ''}`}
        accessibilityLabel={`Revenir en haut, ${count} ${noun}${count > 1 ? 's' : ''}`}
        onPress={onPress}
      />
    </Animated.View>
  );
}
