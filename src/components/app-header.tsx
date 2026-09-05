import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export interface HeaderAction {
  icon: IconName;
  /** Libellé lu par les lecteurs d'écran : le bouton n'affiche qu'une icône. */
  label: string;
  onPress: () => void;
}

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Pastille affichée devant le sous-titre (statut de l'événement, origine des données…). */
  badge?: ReactNode;
  actions?: readonly HeaderAction[];
  onBack?: () => void;
  /** Écrans secondaires : titre réduit pour laisser la place au contenu. */
  compact?: boolean;
  backIcon?: IconName;
  /**
   * À désactiver quand la barre est déjà décalée du haut de l'écran (feuille
   * modale iOS) : l'encoche y est déjà hors du cadre.
   */
  insetTop?: boolean;
}

/** Bouton d'action circulaire, discret sur le fond sombre de la barre. */
function IconButton({ icon, label, onPress }: HeaderAction) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 active:opacity-60"
    >
      <Ionicons name={icon} size={19} color={colors.brandSoft} />
    </Pressable>
  );
}

/**
 * Barre du haut commune à tous les écrans : grand titre, ligne de contexte et
 * actions à droite. Elle gère elle-même l'encoche, les écrans n'ont donc pas
 * besoin de réserver le bord haut.
 */
export function AppHeader({
  title,
  subtitle,
  badge,
  actions,
  onBack,
  compact = false,
  backIcon = 'chevron-back',
  insetTop = true,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const hasContextLine = Boolean(badge || subtitle);

  return (
    <View
      className="border-b border-white/5 bg-surface"
      style={{ paddingTop: insetTop ? insets.top : 0 }}
    >
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        {onBack ? <IconButton icon={backIcon} label="Retour" onPress={onBack} /> : null}

        <View className="flex-1">
          <Text
            numberOfLines={1}
            className={
              compact
                ? 'text-lg font-bold text-white'
                : 'text-[26px] font-extrabold leading-8 text-white'
            }
          >
            {title}
          </Text>
          {hasContextLine ? (
            <View className="mt-1 flex-row items-center gap-2">
              {badge}
              {subtitle ? (
                <Text numberOfLines={1} className="flex-1 text-xs text-gray-400">
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {actions && actions.length > 0 ? (
          <View className="flex-row items-center gap-2">
            {actions.map((action) => (
              <IconButton key={action.label} {...action} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
