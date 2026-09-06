import { RefreshControl, ScrollView } from 'react-native';

import { EditionsHistory } from '@/components/editions-history';
import { SectionBreak } from '@/components/section-break';
import { StatsAudience } from '@/components/stats-audience';
import { StatsComparison } from '@/components/stats-comparison';
import { StatsMillions } from '@/components/stats-millions';
import { StatsRate } from '@/components/stats-rate';
import { StatsStreamerCompare } from '@/components/stats-streamer-compare';
import { StatsVerdict } from '@/components/stats-verdict';
import { useEditionComparison } from '@/lib/use-edition-comparison';

/**
 * Onglet Statistiques : où en est l'édition en cours, comparée à celle d'avant.
 *
 * L'écran n'est qu'un assemblage. Chaque section porte ses propres requêtes, son propre
 * vide et sa propre erreur — c'est ce qui lui permet d'arriver quand elle est prête sans
 * retenir le reste de la page, et ce qui a fait disparaître le chargement plein écran
 * qui masquait autrefois jusqu'à la courbe 2025, pourtant embarquée dans l'application
 * et affichable sans réseau.
 *
 * L'ordre raconte : ce que vaut l'édition face à 2025 (le verdict, les courbes, les
 * paliers, le rythme), puis qui la regarde, puis les streamers, puis les dix ans qui
 * précèdent. Chaque section descend d'un cran dans l'échelle de temps.
 */
export function StatsPane() {
  const { isRefetching, refetch } = useEditionComparison();

  return (
    <ScrollView
      // Sections espacées franchement : c'est le vide entre elles, plus qu'un encadré,
      // qui découpe une page faite de graphes et de listes.
      contentContainerClassName="gap-7 px-5 pb-10 pt-4"
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#a78bfa" />
      }
    >
      <StatsVerdict />

      <StatsComparison />

      <StatsMillions />

      <StatsRate />

      <StatsAudience />

      {/* On descend de l'événement aux streamers qui le font : dernière section avant
          de changer d'échelle de temps. */}
      <StatsStreamerCompare />

      {/* On quitte l'édition en cours pour les dix ans qui la précèdent : la rupture
          d'échelle mérite plus qu'un interligne. */}
      <SectionBreak />

      <EditionsHistory />
    </ScrollView>
  );
}
