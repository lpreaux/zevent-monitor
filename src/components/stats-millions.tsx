import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { DisclosureButton } from '@/components/disclosure-button';
import { RowSeparator } from '@/components/row-separator';
import { SectionHeader } from '@/components/section-header';
import { formatCount, formatEurosCompact } from '@/lib/format';
import { formatEta } from '@/lib/milestones';
import {
  buildMillionsTimeline,
  formatGapMinutes,
  milestoneLabel,
  MILLION_EUR,
  type MilestoneCrossing,
  type PendingMilestone,
} from '@/lib/millions';
import { formatElapsedLabel } from '@/lib/stats-edition';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { TONE_TEXT, toneOf } from '@/theme';

/**
 * Nombre de franchissements gardés à l'écran quand la liste est repliée. Cinq lignes
 * tiennent sous le titre sans le décoller du reste de la page ; au-delà, la chronologie
 * se met à pousser les sections suivantes hors de vue pour montrer un jeudi soir que
 * plus personne ne consulte le dimanche.
 */
const VISIBLE_CROSSINGS = 5;

interface CrossingRowProps {
  crossing: MilestoneCrossing;
  stepEur: number;
  /** Première ligne affichée : elle seule nomme l'édition de référence. */
  reference: boolean;
}

/**
 * Un palier daté et son écart avec 2025.
 *
 * L'écart porte toute la valeur de la section, et c'est aussi le seul chiffre qui a un
 * sens (bon ou mauvais) : il prend la couleur — émeraude en avance, rouge en retard — et
 * le bord droit, là où l'œil descend la colonne pour voir si l'avance se creuse ou fond.
 */
function CrossingRow({ crossing, stepEur, reference }: CrossingRowProps) {
  const { gapMinutes } = crossing;
  const rounded = gapMinutes === null ? null : Math.round(gapMinutes);

  // Un palier que 2025 n'a jamais atteint n'est pas une donnée manquante : c'est une
  // édition qui va plus loin que la précédente, la meilleure nouvelle de la section.
  const gapLabel =
    rounded === null
      ? 'jamais atteint en 2025'
      : rounded === 0
        ? 'à la minute près qu’en 2025'
        : `${formatGapMinutes(rounded)} plus ${rounded > 0 ? 'tôt' : 'tard'}${
            reference ? ' qu’en 2025' : ''
          }`;

  // Un palier jamais atteint en 2025 compte comme une avance, pas comme une absence de
  // comparaison : c'est la meilleure nouvelle que la ligne puisse porter.
  const gapTone = TONE_TEXT[rounded === null ? 'ahead' : toneOf(rounded)];

  return (
    <View className="flex-row items-baseline gap-3 py-2">
      <Text numberOfLines={1} className="w-24 text-sm font-semibold text-white">
        {milestoneLabel(crossing.rank, stepEur)}
      </Text>
      <Text className="w-20 text-sm text-gray-400">
        {formatElapsedLabel(crossing.minutes2026)}
      </Text>
      <Text className={`flex-1 text-right text-xs font-semibold ${gapTone}`}>{gapLabel}</Text>
    </View>
  );
}

/**
 * Le palier qui se joue. Tout y est gris et le mot « estimation » est écrit en toutes
 * lettres (PLAN.md §4 P1) : une heure d'arrivée projetée au rythme de la dernière heure
 * ne se lit pas comme les lignes du dessus, qui, elles, sont arrivées.
 */
function PendingRow({ pending, stepEur }: { pending: PendingMilestone; stepEur: number }) {
  const eta = formatEta(pending.etaMinutes);

  // Reste zéro : la cagnotte officielle a passé le palier, seule la courbe agrégée n'en
  // sait rien encore. Annoncer « imminent » serait une estimation là où il n'y a plus
  // qu'un relevé à attendre.
  const label =
    pending.remainingEur <= 0
      ? 'tout juste franchi — datation au prochain relevé'
      : eta
        ? `${eta} au rythme actuel — estimation`
        : `reste ${formatEurosCompact(pending.remainingEur)} — rythme inconnu`;

  return (
    <View className="flex-row items-baseline gap-3 py-2">
      <Text numberOfLines={1} className="w-24 text-sm font-semibold text-gray-500">
        {milestoneLabel(pending.rank, stepEur)}
      </Text>
      <Text className="w-20 text-sm text-gray-600">à venir</Text>
      <Text className="flex-1 text-right text-xs text-gray-500">{label}</Text>
    </View>
  );
}

/**
 * Section « Chronologie des millions » de l'écran des statistiques.
 *
 * La page compare déjà les deux éditions par le montant. Il lui manquait la lecture par
 * le temps, qui est la plus parlante : « +1,2 M€ sur 2025 » ne dit pas si l'édition court
 * plus vite ou si elle a simplement ouvert plus tôt, alors que « le 8e million est tombé
 * 3 h avant » le dit d'un coup d'œil, et se raconte tel quel.
 *
 * La section se sert elle-même auprès de `useEditionComparison` : React Query rend aux
 * autres sections la même réponse sans requête supplémentaire, et celle-ci arrive quand
 * elle est prête sans retenir le reste de la page.
 */
export function StatsMillions() {
  const { comparison, noBackend, isLoading } = useEditionComparison();
  const [expanded, setExpanded] = useState(false);

  const { stepEur, crossings, pending } = useMemo(
    () => buildMillionsTimeline(comparison),
    [comparison],
  );

  const foldable = Math.max(0, crossings.length - VISIBLE_CROSSINGS);
  // Repliée, la liste garde les derniers paliers : le samedi soir, le 14e million vaut
  // mieux que le 1er, tombé deux jours plus tôt et que la page a déjà raconté.
  const shown = expanded || foldable === 0 ? crossings : crossings.slice(foldable);
  const plural = crossings.length > 1 ? 's' : '';
  const foldPlural = foldable > 1 ? 's' : '';

  const stepLabel =
    stepEur === MILLION_EUR
      ? 'million par million'
      : `de ${formatEurosCompact(stepEur)} en ${formatEurosCompact(stepEur)}`;

  const header = (
    <SectionHeader
      title="Chronologie des millions"
      hint={
        crossings.length > 0
          ? `${formatCount(crossings.length)} palier${plural} franchi${plural}, ${stepLabel} · écart compté depuis l’ouverture de chaque cagnotte`
          : 'Quand chaque palier tombe, face à 2025 depuis l’ouverture de chaque cagnotte'
      }
    />
  );

  if (noBackend) {
    return (
      <View className="gap-3">
        {header}
        <Text className="text-xs text-amber-200">Chronologie indisponible : backend injoignable.</Text>
      </View>
    );
  }

  if (crossings.length === 0 && !pending) {
    return (
      <View className="gap-3">
        {header}
        <Text className="text-xs text-gray-500">
          {isLoading
            ? 'Chargement de la chronologie…'
            : 'Aucun palier franchi pour l’instant : la chronologie s’écrira au fil des premiers dons.'}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {header}

      <View>
        {/* Le bouton précède les lignes, contrairement au reste de l'app : ce qu'il replie
            est en amont dans le temps, et le déplier fait donc pousser la liste vers le
            haut. Le placer dessous demanderait de relire la chronologie à l'envers. */}
        {foldable > 0 ? (
          <DisclosureButton
            expanded={expanded}
            onPress={() => setExpanded((value) => !value)}
            label={`${formatCount(foldable)} palier${foldPlural} plus ancien${foldPlural}`}
            expandedLabel="Ne garder que les derniers paliers"
          />
        ) : null}

        {shown.map((crossing, index) => (
          <View key={crossing.targetEur}>
            {index > 0 ? <RowSeparator /> : null}
            <CrossingRow crossing={crossing} stepEur={stepEur} reference={index === 0} />
          </View>
        ))}

        {pending ? (
          <View>
            {shown.length > 0 ? <RowSeparator /> : null}
            <PendingRow pending={pending} stepEur={stepEur} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
