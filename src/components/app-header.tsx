import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveSummaryBar } from '@/components/live-summary-bar';
import { IconButton } from '@/components/ui/icon-button';
import { icons, type IconName } from '@/lib/icons';

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
  /** Résumé du direct épinglé sous le titre, réglable par l'utilisateur. */
  liveSummary?: boolean;
  /** Raccourci AlwaysOn, à retirer sur les écrans d'où il n'a pas de sens. */
  alwaysOn?: boolean;
}

/**
 * Barre du haut commune à tous les écrans : grand titre, ligne de contexte,
 * actions à droite et résumé permanent du direct juste en dessous. Elle gère
 * elle-même l'encoche, les écrans n'ont donc pas besoin de réserver le bord haut.
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
  liveSummary = true,
  alwaysOn = true,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hasContextLine = Boolean(badge || subtitle);

  return (
    <View
      className="border-b border-white/5 bg-surface"
      style={{ paddingTop: insetTop ? insets.top : 0 }}
    >
      {/* Le résumé apporte sa propre respiration : le titre se rapproche quand il est là. */}
      <View className={`flex-row items-center gap-3 px-5 pt-2 ${liveSummary ? 'pb-2' : 'pb-3'}`}>
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
          {alwaysOn ? (
            <IconButton
              icon={icons.alwaysOn}
              label="Activer le mode AlwaysOn"
              onPress={() => router.push('/always-on')}
            />
          ) : null}
          {actions?.map((action) => <IconButton key={action.label} {...action} />)}
        </View>
      </View>

      {liveSummary ? <LiveSummaryBar /> : null}
    </View>
  );
}
