import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useFavoritesStore } from '@/store/favorites';

/** Cible tactile minimale, alignée sur celle d'`IconButton`. */
const TOUCH_TARGET_PX = 44;

interface FavoriteButtonProps {
  twitch: string;
  size?: number;
}

/**
 * Étoile pour suivre / ne plus suivre un streamer (persistée via AsyncStorage).
 *
 * En icône vectorielle plutôt qu'en caractère : les glyphes ★ et ☆ n'ont ni la même
 * chasse ni la même hauteur d'un appareil à l'autre, ce qui décalait la fin de ligne
 * au moment même où l'on tape dessus.
 */
export function FavoriteButton({ twitch, size = 22 }: FavoriteButtonProps) {
  const isFavorite = useFavoritesStore((s) => s.favorites.includes(twitch.toLowerCase()));
  const toggle = useFavoritesStore((s) => s.toggle);

  return (
    <Pressable
      // Complété jusqu'aux 44 px recommandés, comme le fait `IconButton` : l'étoile se
      // dessine de 16 à 22 px selon l'endroit, et un `hitSlop` figé laissait la plus
      // petite — celle de la fiche, posée à côté de deux boutons du système — avec une
      // cible de 36 px.
      hitSlop={Math.max(0, (TOUCH_TARGET_PX - size) / 2)}
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onPress={() => toggle(twitch)}
      className="active:opacity-60"
    >
      <Ionicons
        name={isFavorite ? 'star' : 'star-outline'}
        size={size}
        color={isFavorite ? '#fbbf24' : '#4b5563'}
      />
    </Pressable>
  );
}
