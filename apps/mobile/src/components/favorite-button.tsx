import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import {
  ICON_BUTTON_SIZE,
  TOUCH_TARGET_PX,
  type IconButtonSize,
} from '@/components/ui/icon-button';
import { icons } from '@/lib/icons';
import { useFavoritesStore } from '@/store/favorites';

/** Ambre du favori suivi, contre le gris de celui qui ne l'est pas. */
const ON = '#fbbf24';
const OFF = '#4b5563';

interface FavoriteButtonProps {
  twitch: string;
  /** Mêmes formats qu'`IconButton` : c'est la condition pour s'aligner à côté de lui. */
  size?: IconButtonSize;
}

/**
 * Étoile pour suivre / ne plus suivre un streamer (persistée via AsyncStorage).
 *
 * Elle ne passe pas par `IconButton` — son ambre sort des deux tons du système, et une
 * bascule n'est pas une action —, mais elle en reprend la boîte, la taille de glyphe et la
 * cible tactile. C'est ce qui manquait : posée en haut de la fiche d'un streamer à côté de
 * deux `IconButton`, elle dessinait son glyphe sans cadre, si bien qu'elle se collait à sa
 * voisine — huit pixels de moins que l'écart des deux autres — tout en réclamant par
 * `hitSlop` une surface que la disposition ne lui réservait pas, et qui mordait sur le
 * texte d'à côté dans les listes.
 *
 * En icône vectorielle plutôt qu'en caractère : les glyphes ★ et ☆ n'ont ni la même
 * chasse ni la même hauteur d'un appareil à l'autre, ce qui décalait la fin de ligne au
 * moment même où l'on tape dessus.
 */
export function FavoriteButton({ twitch, size = 'md' }: FavoriteButtonProps) {
  const isFavorite = useFavoritesStore((s) => s.favorites.includes(twitch.toLowerCase()));
  const toggle = useFavoritesStore((s) => s.toggle);
  const metrics = ICON_BUTTON_SIZE[size];

  return (
    <Pressable
      hitSlop={(TOUCH_TARGET_PX - metrics.px) / 2}
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onPress={() => toggle(twitch)}
      className={`items-center justify-center active:opacity-60 ${metrics.box}`}
    >
      <Icon
        optical
        name={isFavorite ? icons.favoriteOn : icons.favoriteOff}
        size={metrics.icon}
        color={isFavorite ? ON : OFF}
      />
    </Pressable>
  );
}
