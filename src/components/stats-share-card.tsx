import { forwardRef } from 'react';
import { Text, View } from 'react-native';

import { OverlayChart, type ChartSeries } from '@/components/overlay-chart';
import { parisClock } from '@/lib/donations';
import { formatDate, formatEuros, formatEurosCompact } from '@/lib/format';
import type { HistoryProvenance } from '@/lib/history-2025';
import { formatElapsedLabel, type EditionComparison } from '@/lib/stats-edition';
import { colors, TONE_TEXT } from '@/theme';

/**
 * Mêmes teintes que la superposition de l'onglet Statistiques. Une carte partagée est
 * relue à côté de l'écran d'où elle sort : si l'ambre y désignait 2026, on ne saurait
 * plus laquelle des deux courbes on regarde.
 */

/**
 * Hauteur figée de la vignette de courbe. C'est elle qui tient le rapport de forme de la
 * carte : tout le reste est du texte de gabarit constant, une courbe qui s'adapterait à
 * la place disponible ferait un PNG de proportions différentes à chaque capture.
 */
const CHART_HEIGHT = 120;

interface StatsShareCardProps {
  comparison: EditionComparison;
  /** Crédit de la courbe 2025, tel que le porte le snapshot figé dans l'application. */
  provenance: HistoryProvenance;
  /** Aucune des deux sources 2026 n'a répondu : il ne reste que l'édition passée à montrer. */
  noBackend: boolean;
  /** Instant représenté par la carte, en ISO. */
  capturedAt: string;
}

/** Chiffre encadré : la carte est faite pour être lue en vignette, d'où les cadres. */
function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white/5 p-3">
      <Text className="text-[11px] uppercase tracking-wider text-gray-400">{label}</Text>
      <Text numberOfLines={1} className="mt-0.5 text-xl font-bold text-white">
        {value}
      </Text>
      <Text numberOfLines={1} className="text-[11px] text-gray-500">
        {hint}
      </Text>
    </View>
  );
}

/** Pastille de légende : sans elle, deux traits de couleur ne se nomment pas. */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text numberOfLines={1} className="text-[11px] text-gray-400">
        {label}
      </Text>
    </View>
  );
}

/**
 * Carte « 2026 face à 2025 au même moment de l'édition », faite pour sortir de
 * l'application en PNG.
 *
 * C'est la comparaison qui fait le message, pas le montant : « 11,2 M€ » ne dit rien à
 * qui n'a pas l'édition précédente en tête, « 1,24 M€ d'avance sur 2025 » se comprend
 * seul. D'où la hiérarchie : le total en grand, l'écart juste dessous en couleur, et la
 * courbe réduite à sa silhouette — pas de graduations ni de repères, une vignette relue
 * dans un fil ne se lit pas comme un graphique, elle se lit comme une forme.
 *
 * Le fond est opaque et posé en style plutôt qu'en classe : la capture rend hors de
 * l'arbre de l'écran, où un fond transparent donnerait un PNG à trous.
 */
export const StatsShareCard = forwardRef<View, StatsShareCardProps>(function StatsShareCard(
  { comparison, provenance, noBackend, capturedAt },
  ref,
) {
  // Sans courbe 2026, « T+0 min » serait un mensonge poli : mieux vaut ne pas dater du tout.
  const elapsedLabel =
    comparison.has2026Curve && comparison.current2026Minutes > 0
      ? formatElapsedLabel(comparison.current2026Minutes)
      : null;
  const clock = parisClock(capturedAt);
  const stamp = [elapsedLabel, clock ? `${clock} Paris` : null].filter(Boolean).join(' · ');

  // Le montant courant, et non la comparaison, décide de ce que la carte annonce : tant
  // qu'il vaut zéro, il n'y a rien à mettre en grand et c'est 2025 qui prend la vedette.
  const hasAmount = comparison.current2026Eur > 0;
  const delta = comparison.deltaEur;
  const ahead = delta !== null && delta >= 0;

  const series: ChartSeries[] = [
    { id: '2025', label: '2025', color: colors.editionPast, points: comparison.points2025 },
  ];
  if (comparison.has2026Curve) {
    series.push({ id: '2026', label: '2026', color: colors.brand, points: comparison.points2026 });
  }
  // Un peu d'air au-dessus du plus haut des deux totaux, pour que la courbe de tête ne
  // vienne pas se coller au bord du cadre.
  const yMax = Math.max(comparison.final2025Eur, comparison.current2026Eur, 1) * 1.05;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ backgroundColor: '#12082b' }}
      className="gap-4 rounded-3xl border border-zevent-500/40 p-6"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-widest text-zevent-300">
          ZEvent 2026
        </Text>
        <Text numberOfLines={1} className="text-xs text-gray-400">
          {stamp}
        </Text>
      </View>

      {hasAmount ? (
        <View>
          <Text className="text-sm text-gray-300">Cagnotte à cet instant</Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            className="mt-1 text-5xl font-extrabold text-white"
          >
            {formatEuros(comparison.current2026Eur)}
          </Text>
          {delta !== null ? (
            <Text
              numberOfLines={2}
              className={`mt-1 text-base font-semibold ${TONE_TEXT[ahead ? 'ahead' : 'behind']}`}
            >
              {`${ahead ? '+' : '−'}${formatEuros(Math.abs(delta))} ${ahead ? 'd’avance sur' : 'de retard sur'} 2025 au même moment`}
            </Text>
          ) : (
            <Text numberOfLines={2} className="mt-1 text-sm text-gray-400">
              Comparaison avec 2025 pas encore calculable à cette heure.
            </Text>
          )}
        </View>
      ) : (
        <View>
          <Text className="text-sm text-gray-300">ZEvent 2025 — total final</Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            className="mt-1 text-5xl font-extrabold text-white"
          >
            {formatEuros(comparison.final2025Eur)}
          </Text>
          <Text numberOfLines={2} className="mt-1 text-sm text-gray-400">
            {noBackend
              ? 'Cagnotte 2026 injoignable : la carte ne montre que l’édition passée.'
              : 'La cagnotte 2026 n’a pas encore de montant à comparer.'}
          </Text>
        </View>
      )}

      <View className="gap-2">
        <OverlayChart
          series={series}
          maxMinutes={comparison.maxMinutes}
          yMax={yMax}
          height={CHART_HEIGHT}
        />
        <View className="flex-row items-center justify-between">
          {comparison.has2026Curve ? (
            <LegendDot color={colors.brand} label={elapsedLabel ? `2026 · ${elapsedLabel}` : '2026'} />
          ) : null}
          <LegendDot
            color={colors.editionPast}
            label={`2025 · ${formatEurosCompact(comparison.final2025Eur)} au total`}
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        {comparison.eur2025SameElapsed !== null ? (
          <Tile
            label="2025 au même moment"
            value={formatEurosCompact(comparison.eur2025SameElapsed)}
            hint={`sur ${formatEurosCompact(comparison.final2025Eur)} au final`}
          />
        ) : (
          <Tile
            label="Total 2025"
            value={formatEurosCompact(comparison.final2025Eur)}
            hint="édition précédente"
          />
        )}
        {comparison.projected2026Eur !== null ? (
          <Tile
            label="Projection 2026"
            value={formatEurosCompact(comparison.projected2026Eur)}
            hint="estimation, pas une annonce"
          />
        ) : comparison.eurPerHour !== null ? (
          <Tile
            label="Rythme"
            value={`${formatEurosCompact(comparison.eurPerHour)}/h`}
            hint="sur la dernière heure"
          />
        ) : null}
      </View>

      <View className="gap-1">
        {/* Le crédit de la courbe 2025 voyage avec l'image : c'est l'engagement pris
            envers la source communautaire, et une carte se republie sans son écran. */}
        <Text numberOfLines={2} className="text-[10px] text-gray-500">
          {`Cagnotte 2026 : zevent.fr · Courbe 2025 : ${provenance.provider}, récupérée le ${formatDate(provenance.fetchedAt)}`}
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-gray-400">zevent.fr/don</Text>
          <Text className="text-xs text-gray-600">ZEvent Monitor</Text>
        </View>
      </View>
    </View>
  );
});
