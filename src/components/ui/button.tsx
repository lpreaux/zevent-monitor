import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { iconSizes, type IconName } from '@/lib/icons';
import { Icon } from './icon';

/**
 * Rang de l'action, jamais son apparence : on choisit `primary` parce que le bouton
 * engage, pas parce qu'on le veut violet.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'neutral';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT = {
  /** Ce que la vue attend de l'utilisateur : donner, générer, publier, activer. */
  primary: {
    container: 'bg-zevent-500',
    label: 'text-white',
    icon: '#ffffff',
  },
  /** Une autre voie de même rang, offerte à côté de la première : partager en texte plutôt qu'en image. */
  secondary: {
    container: 'border border-zevent-500/60',
    label: 'text-zevent-200',
    icon: '#c4b5fd',
  },
  /** Service rendu à la lecture : déplier, revenir, gérer. Elle ne réclame rien. */
  neutral: {
    container: 'border border-white/10 bg-white/5',
    label: 'text-gray-300',
    icon: '#9ca3af',
  },
} as const satisfies Record<ButtonVariant, { container: string; label: string; icon: string }>;

/**
 * Trois hauteurs, pas davantage. Les paddings étaient jusqu'ici choisis au cas par cas —
 * neuf valeurs pour le seul bouton plein —, et deux boutons de même rang à deux pixels
 * d'écart se lisent comme un défaut d'alignement, pas comme une nuance.
 */
const SIZE = {
  sm: { container: 'gap-1.5 px-3.5 py-2', label: 'text-xs', icon: iconSizes.row },
  md: { container: 'gap-2 px-4 py-2.5', label: 'text-[13px]', icon: iconSizes.button },
  lg: { container: 'gap-2 px-5 py-3.5', label: 'text-sm', icon: iconSizes.button },
} as const satisfies Record<ButtonSize, { container: string; label: string; icon: number }>;

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /**
   * Bouton-bloc : il prend toute la largeur de son conteneur et adoucit son rayon.
   *
   * C'est là toute la règle de forme de l'application — la pastille (`rounded-full`) pour
   * ce qui est posé dans une rangée à côté d'autre chose, le rectangle arrondi pour ce qui
   * barre la largeur. Un bouton pleine largeur en pastille étire ses deux demi-cercles sur
   * une corde bien trop longue pour eux, et le rond cesse de se lire comme un rond.
   */
  block?: boolean;
  /** Partage la largeur disponible avec ses voisins de rangée, sans devenir un bloc. */
  grow?: boolean;
  /**
   * Travail en cours déclenché par ce bouton : la roue prend la place de l'icône, et le
   * bouton refuse un second appui. Elle se substitue à l'icône plutôt que de s'y ajouter,
   * faute de quoi le bouton s'élargirait au moment précis où il ne faut plus le viser.
   */
  loading?: boolean;
  disabled?: boolean;
  /** Quand le libellé seul ne dit pas sur quoi porte l'action (« Regarder » qui ?). */
  accessibilityLabel?: string;
}

/**
 * Bouton à libellé de l'application.
 *
 * Il n'existait pas : chaque bouton portait ses classes en propre, et la même intention
 * finissait dessinée de neuf façons. Le rôle du composant n'est pas d'épargner des
 * caractères mais de rendre le choix visible — trois rangs, trois tailles, une règle de
 * rayon —, de sorte qu'un bouton nouveau ne puisse être qu'un de ceux qui existent déjà.
 *
 * Pour un bouton sans libellé, voir `IconButton` : une icône seule dans un cadre pose des
 * questions que celui-ci n'a pas à connaître, à commencer par son centrage.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  block = false,
  grow = false,
  loading = false,
  disabled = false,
  accessibilityLabel,
}: ButtonProps) {
  const tone = VARIANT[variant];
  const metrics = SIZE[size];
  const inert = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={grow ? { flex: 1 } : undefined}
      className={[
        'flex-row items-center justify-center active:opacity-70',
        block ? 'w-full rounded-2xl' : 'rounded-full',
        metrics.container,
        tone.container,
        inert ? 'opacity-40' : '',
      ].join(' ')}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.icon} />
      ) : icon ? (
        <Icon name={icon} size={metrics.icon} color={tone.icon} />
      ) : null}
      <Text numberOfLines={1} className={`font-bold ${metrics.label} ${tone.label}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Rangée de boutons de même rang, chacun prenant sa part de la largeur.
 *
 * Deux boutons côte à côte doivent finir à la même largeur même si l'un dit « Texte » et
 * l'autre « Partager l'image » : c'est l'égalité des largeurs qui dit qu'ils sont au même
 * rang, et la laisser dépendre de la longueur des mots ferait passer le plus bavard pour
 * le plus important.
 */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View className="flex-row items-center gap-2">{children}</View>;
}
