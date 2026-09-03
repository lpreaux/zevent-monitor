import { Pressable, Text } from 'react-native';

import { useFavoritesStore } from '@/store/favorites';

interface FavoriteButtonProps {
  twitch: string;
  size?: number;
}

/** Étoile pour ajouter / retirer un streamer des favoris (persisté via AsyncStorage). */
export function FavoriteButton({ twitch, size = 22 }: FavoriteButtonProps) {
  const isFavorite = useFavoritesStore((s) => s.favorites.includes(twitch.toLowerCase()));
  const toggle = useFavoritesStore((s) => s.toggle);

  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onPress={() => toggle(twitch)}
    >
      <Text style={{ fontSize: size }} className={isFavorite ? 'text-amber-400' : 'text-gray-600'}>
        {isFavorite ? '★' : '☆'}
      </Text>
    </Pressable>
  );
}
