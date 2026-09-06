import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Metric, MetricDivider } from '@/components/metric';
import { IconButton } from '@/components/ui/icon-button';
import { icons } from '@/lib/icons';
import { formatEuros, formatEurosCompact } from '@/lib/format';
import { formatEta, milestoneEtaMinutes, nextMilestone } from '@/lib/milestones';
import { formatElapsedLabel } from '@/lib/stats-edition';
import { buildVerdict } from '@/lib/stats-verdict';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { TONE_TEXT } from '@/theme';

/**
 * Progression vers le prochain palier rond de la cagnotte globale.
 *
 * Le dessin est celui de l'écran AlwaysOn (`AlwaysOnMilestone`), mais celui-ci se règle
 * en tailles de police pour un écran secondaire regardé de loin : le reprendre ici
 * aurait demandé de lui passer des mesures qui n'ont aucun sens dans une carte. Seule
 * la logique est partagée — c'est elle qui doit rester unique, pas la mise en page.
 */
function MilestoneRow({ amountEuros, eurPerHour }: { amountEuros: number; eurPerHour: number | null }) {
  const milestone = nextMilestone(amountEuros);
  if (!milestone) return null;

  const eta = formatEta(milestoneEtaMinutes(milestone.remaining, eurPerHour));

  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
          Prochain palier
        </Text>
        <Text className="text-[11px] text-gray-500">
          {eta ? `${eta} — estimation` : 'rythme inconnu'}
        </Text>
      </View>

      <View className="h-1.5 overflow-hidden rounded-full bg-gray-900">
        <View
          style={{ width: `${Math.round(milestone.ratio * 100)}%` }}
          className="h-full rounded-full bg-zevent-500"
        />
      </View>

      <Text className="text-[11px] text-gray-500">
        <Text className="font-semibold text-gray-300">{formatEurosCompact(milestone.target)}</Text>
        {` — reste ${formatEuros(milestone.remaining)}`}
      </Text>
    </View>
  );
}

/**
 * Tête de l'écran des statistiques : l'écart à l'édition précédente, sa projection et le
 * palier en vue.
 *
 * La cagnotte elle-même n'y figure pas — le résumé du direct l'affiche déjà en haut de
 * tous les écrans, et la répéter ici aurait fait de cette carte un doublon plutôt qu'une
 * réponse. Ce que la page apporte de neuf, c'est la comparaison ; c'est donc elle qui
 * prend la place du grand chiffre.
 */
export function StatsVerdict() {
  const router = useRouter();
  const { comparison, noBackend } = useEditionComparison();
  const verdict = buildVerdict(comparison, formatEurosCompact);

  return (
    <View className="gap-4 rounded-3xl border border-white/10 bg-surface-raised p-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
          2026 face à 2025
        </Text>
        <View className="flex-row items-center gap-2">
          {comparison.has2026Curve ? (
            <Text className="text-[11px] text-gray-500">
              {formatElapsedLabel(comparison.current2026Minutes)}
            </Text>
          ) : null}
          {/* L'écart à l'édition précédente est ce que l'on republie le plus volontiers
              pendant le week-end : le partage se prend ici, sur la carte qui l'énonce,
              plutôt qu'au bas d'une page qu'il faut d'abord dérouler. */}
          <IconButton
            size="sm"
            icon={icons.share}
            label="Partager la comparaison"
            onPress={() => router.push('/stats-share')}
          />
        </View>
      </View>

      <View>
        <Text className={`text-[30px] font-extrabold leading-9 ${TONE_TEXT[verdict.tone]}`}>
          {verdict.headline}
        </Text>
        <Text className="mt-1 text-[13px] text-gray-400">{verdict.detail}</Text>
      </View>

      <View className="flex-row items-start">
        <Metric
          label="Rythme"
          value={
            comparison.eurPerHour === null
              ? '—'
              : `${formatEurosCompact(comparison.eurPerHour)} / h`
          }
          // Même fenêtre et même formulation que la section « Rythme de collecte » : le
          // chiffre y est repris en détail, il ne doit pas sembler en désigner un autre.
          hint="sur la dernière heure"
        />
        <MetricDivider />
        <Metric
          label="Projection 2026"
          value={
            comparison.projected2026Eur === null
              ? '—'
              : formatEurosCompact(comparison.projected2026Eur)
          }
          // Le PLAN impose d'annoncer toute extrapolation comme telle, à l'endroit même
          // où elle s'affiche (§4 P1) : la mention ne peut pas vivre en pied de page.
          hint="estimation d’après 2025"
        />
      </View>

      <MilestoneRow amountEuros={comparison.current2026Eur} eurPerHour={comparison.eurPerHour} />

      {noBackend ? (
        <Text className="text-xs text-amber-200">
          Backend injoignable : l’édition en cours n’est pas comparable, seules les données
          figées restent affichées.
        </Text>
      ) : null}
    </View>
  );
}
