import { Pressable } from 'react-native';

import { iconSizes, type IconName } from '@/lib/icons';
import { Icon } from './icon';

/**
 * Poids du bouton dans son environnement.
 *
 * `bare` est le cas ordinaire, et c'est un renversement : chaque bouton-icône portait
 * jusqu'ici son cercle bordé, si bien que la barre du haut alignait jusqu'à trois pastilles
 * grises au-dessus du contenu. Le cercle ne se justifie que lorsqu'il faut détacher
 * l'action de ce qu'il y a dessous ; partout ailleurs il n'ajoute que du bruit.
 */
export type IconButtonVariant = 'bare' | 'soft' | 'accent' | 'overlay';

export type IconButtonSize = 'sm' | 'md';

const VARIANT = {
  bare: 'active:opacity-60',
  soft: 'border border-white/10 bg-white/5 active:opacity-60',
  accent: 'border border-zevent-500/40 bg-zevent-500/15 active:opacity-60',
  /**
   * Posé par-dessus un contenu qui n'a pas de fond convenu — une courbe, une image. Le
   * fond doit être opaque : un blanc à cinq pour cent disparaît sur une zone claire du
   * tracé, et le bouton avec lui.
   */
  overlay: 'bg-gray-900/85 active:opacity-60',
} as const satisfies Record<IconButtonVariant, string>;

/**
 * Deux formats, contre huit auparavant (de 28 à 40 px, avec des icônes de 11 à 19). Le
 * `hitSlop` complète le cadre jusqu'aux 44 px recommandés : c'est le cadre qui se voit,
 * la cible tactile reste la même dans les deux cas.
 */
export const ICON_BUTTON_SIZE = {
  sm: { box: 'h-8 w-8', px: 32, icon: iconSizes.button },
  md: { box: 'h-10 w-10', px: 40, icon: iconSizes.header },
} as const satisfies Record<IconButtonSize, { box: string; px: number; icon: number }>;

const SIZE = ICON_BUTTON_SIZE;

/**
 * Cible tactile minimale. Exportée parce qu'elle vaut pour tout bouton-icône, y compris
 * ceux qui ne passent pas par ce composant : une étoile de favori posée à côté d'un
 * `IconButton` doit se viser aussi facilement que lui.
 */
export const TOUCH_TARGET_PX = 44;

const BRAND_SOFT = '#c4b5fd';
const MUTED = '#9ca3af';

export interface IconButtonProps {
  icon: IconName;
  /**
   * Ce que fait le bouton, lu par les lecteurs d'écran. Obligatoire : une icône seule
   * n'énonce rien, et le seul moyen de garantir qu'elle soit annoncée est de ne pas
   * permettre de l'omettre.
   */
  label: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** `muted` pour une action de service, qui ne doit pas attirer l'œil sur elle. */
  tone?: 'brand' | 'muted';
  /**
   * Bascule enfoncée : le bouton prend la teinte de marque et l'annonce comme
   * sélectionné. Réservé aux boutons qui ont deux états, pas à celui qui vient d'être
   * pressé.
   */
  selected?: boolean;
  disabled?: boolean;
}

/**
 * Bouton réduit à une icône.
 *
 * C'est le seul endroit de l'application où un glyphe est centré sans rien pour
 * l'accompagner, et donc le seul où le centrage se voit. Il délègue le dessin à `Icon`,
 * qui porte les deux corrections : le remplissage de police d'Android, et le décalage
 * optique des glyphes dont la masse ne coïncide pas avec la boîte.
 */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'bare',
  size = 'md',
  tone = 'brand',
  selected = false,
  disabled = false,
}: IconButtonProps) {
  const metrics = SIZE[size];
  const shape = selected && variant !== 'bare' ? VARIANT.accent : VARIANT[variant];
  const color = selected || tone === 'brand' ? BRAND_SOFT : MUTED;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      hitSlop={(TOUCH_TARGET_PX - metrics.px) / 2}
      className={[
        'items-center justify-center rounded-full',
        metrics.box,
        shape,
        disabled ? 'opacity-40' : '',
      ].join(' ')}
    >
      <Icon optical name={icon} size={metrics.icon} color={color} />
    </Pressable>
  );
}
