import { useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/icon-button';
import { icons, type IconName } from '@/lib/icons';

export interface HeaderAction {
  icon: IconName;
  /** Libellé lu par les lecteurs d'écran : le bouton n'affiche qu'une icône. */
  label: string;
  onPress: () => void;
}

/**
 * L'action d'en-tête d'un onglet, et la seule.
 *
 * La règle veut qu'une page ne porte au plus qu'une action, toujours la même, menant au
 * hub des réglages. Elle était jusqu'ici recopiée écran par écran, et deux des cinq
 * onglets l'avaient tout bonnement oubliée. Un hook la rend identique par construction :
 * il n'y a plus d'endroit où la libeller autrement, ni où omettre de la poser.
 */
export function useSettingsAction(): readonly HeaderAction[] {
  const router = useRouter();
  return useMemo(
    () => [
      {
        icon: icons.settings,
        label: 'Réglages',
        onPress: () => router.push('/settings' as never),
      },
    ],
    [router],
  );
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

/**
 * Barre du haut commune à tous les écrans : grand titre, ligne de contexte, actions à
 * droite. Elle gère elle-même l'encoche, les écrans n'ont donc pas besoin de réserver le
 * bord haut.
 *
 * Elle ne porte plus que du local. Le résumé du direct s'épinglait juste en dessous et le
 * raccourci vers l'écran secondaire figurait parmi ses actions, si bien que la lecture de
 * l'écran alternait local → global → local et que le titre se trouvait séparé de ses
 * propres contrôles par deux cents pixels de mobilier qui ne le concernait pas. Le global
 * est descendu dans le socle ; ce qui reste ici parle de cette page et d'elle seule.
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

        <View className="flex-row items-center gap-2">
          {actions?.map((action) => <IconButton key={action.label} {...action} />)}
        </View>
      </View>
    </View>
  );
}
