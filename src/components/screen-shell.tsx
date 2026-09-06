import { use, type ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';

/**
 * Ossature commune d'un écran : barre du haut fixe, contenu en dessous. Le bord haut est
 * géré par la barre elle-même, il ne reste que le bas à protéger — et seulement là où
 * personne d'autre ne s'en charge.
 *
 * Sous les onglets, c'est le socle qui borde le bas de l'écran, et il porte déjà la marge
 * de la zone sûre. La scène, elle, reçoit du navigateur les marges de la fenêtre entière :
 * réserver le bas ici y ajoutait une seconde fois la barre de gestes, soit une trentaine
 * de pixels vides coincés entre la dernière ligne de liste et le socle. Le contexte de
 * hauteur du menu du bas n'existe que dans une scène d'onglet : sa seule présence suffit à
 * savoir qui borde le bas.
 */
export function ScreenShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  const insideTabs = use(BottomTabBarHeightContext) !== undefined;

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={insideTabs ? [] : ['bottom']}>
      {header}
      {children}
    </SafeAreaView>
  );
}
