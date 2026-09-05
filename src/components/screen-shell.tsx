import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Ossature commune d'un écran : barre du haut fixe, contenu en dessous. Le bord
 * haut est géré par la barre elle-même, il ne reste que le bas à protéger.
 */
export function ScreenShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      {header}
      {children}
    </SafeAreaView>
  );
}
