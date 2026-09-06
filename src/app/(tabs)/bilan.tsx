import { useState } from 'react';
import { View } from 'react-native';

import { AppHeader, useSettingsAction } from '@/components/app-header';
import { RecapsPane } from '@/components/recaps-pane';
import { ScreenShell } from '@/components/screen-shell';
import { Segmented } from '@/components/segmented';
import { StatsPane } from '@/components/stats-pane';

type Pane = 'stats' | 'recaps';

const PANES = [
  { key: 'stats' as const, label: 'Statistiques' },
  { key: 'recaps' as const, label: 'Récaps' },
];

const SUBTITLES: Record<Pane, string> = {
  stats: '2026 face aux éditions passées',
  recaps: 'Le week-end, période par période',
};

/**
 * Onglet Bilan : deux façons de répondre à « qu'est-ce qui s'est passé ».
 *
 * Statistiques et Récaps occupaient deux onglets alors qu'ils posent la même question et
 * ne diffèrent que par la réponse — l'un chiffre l'édition et la compare, l'autre la
 * raconte par tranches. Les séparer coûtait d'autant plus cher que Récaps est vide hors
 * événement : la moitié de l'année, l'un des six onglets ne menait à rien.
 *
 * Statistiques ouvre, parce que c'est le volet qui a toujours quelque chose à dire : la
 * courbe 2025 est embarquée dans l'application et s'affiche même sans réseau, là où le
 * premier récap n'existe qu'une fois le week-end commencé.
 */
export default function BilanScreen() {
  const [pane, setPane] = useState<Pane>('stats');
  const headerActions = useSettingsAction();

  return (
    <ScreenShell
      header={<AppHeader title="Bilan" subtitle={SUBTITLES[pane]} actions={headerActions} />}
    >
      <View className="px-5 pb-2 pt-3">
        <Segmented options={PANES} value={pane} onChange={setPane} />
      </View>

      {/* Les deux volets sont montés à tour de rôle et non superposés : celui des récaps
          tient une liste, ses commandes flottantes et une feuille de génération, et le
          garder vivant derrière les statistiques ferait tourner ses requêtes pour un écran
          que personne ne regarde. */}
      {pane === 'stats' ? <StatsPane /> : <RecapsPane />}
    </ScreenShell>
  );
}
