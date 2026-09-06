import { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { Expandable } from '@/components/expandable';
import {
  OverlayChart,
  SCRUB_CAPTION_HEIGHT,
  type ChartSeries,
} from '@/components/overlay-chart';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { ToggleChip } from '@/components/toggle-chip';
import { comparisonSlice, elapsedTicks, referenceValues } from '@/lib/comparison-chart';
import { formatDate, formatEuros, formatEurosCompact, formatPercent } from '@/lib/format';
import { formatElapsedLabel, OFFSET_2025_LABEL } from '@/lib/stats-edition';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { colors } from '@/theme';

type WindowKey = '12h' | '24h' | 'all';

interface ComparisonWindow {
  key: WindowKey;
  label: string;
  /** Profondeur de la tranche, `null` pour tout l'événement. */
  minutes: number | null;
}

/**
 * La fenêtre ne zoome pas, elle change la question : « où en est le week-end » ou
 * « qu'est-ce qui s'est passé depuis hier soir ». La seconde n'a de réponse qu'une fois
 * l'édition entamée, c'est donc le week-end entier qui s'ouvre en premier — l'inverse
 * du choix fait sur la fiche d'un streamer, où c'est l'heure écoulée qui intéresse.
 */
const WINDOWS: ComparisonWindow[] = [
  { key: '12h', label: '12 h', minutes: 12 * 60 },
  { key: '24h', label: '24 h', minutes: 24 * 60 },
  { key: 'all', label: 'Tout', minutes: null },
];

/** Ligne de légende : une pastille de couleur, ce qu'elle désigne, ce qu'elle vaut. */
function LegendRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2">
        {color ? (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        ) : (
          <View className="w-2.5" />
        )}
        <Text className="flex-1 text-[13px] text-gray-400">{label}</Text>
      </View>
      <Text className="text-[13px] font-semibold text-white">{value}</Text>
    </View>
  );
}

/**
 * Section « Comparaison 2025 / 2026 » : les deux cagnottes superposées sur le déroulé de
 * l'événement.
 *
 * L'écart chiffré, lui, est déjà tombé en tête d'écran : cette section montre comment on
 * y est arrivé. C'est pourquoi elle s'ouvre sur le graphe et non sur une phrase, et
 * pourquoi sa légende dit des montants plutôt que de répéter le verdict.
 */
export function StatsComparison() {
  const { comparison, history, noBackend } = useEditionComparison();
  const [windowKey, setWindowKey] = useState<WindowKey>('all');
  const [asPercent, setAsPercent] = useState(false);
  const [showProjection, setShowProjection] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const { width, height } = useWindowDimensions();
  // Tourner l'appareil est le geste qui donne le plus de place à une courbe : le plein
  // écran en profite au lieu de garder la hauteur du portrait.
  const expandedHeight = Math.round(width > height ? height * 0.68 : height * 0.46);

  const window = WINDOWS.find((option) => option.key === windowKey) ?? WINDOWS[2];

  const chart = useMemo(() => {
    const toUnit = asPercent
      ? (value: number) =>
          comparison.final2025Eur > 0 ? (value / comparison.final2025Eur) * 100 : 0
      : (value: number) => value;
    const format = asPercent
      ? (value: number) => formatPercent(value / 100)
      : (value: number) => formatEurosCompact(value);

    const slice = comparisonSlice(comparison, window.minutes, toUnit);

    const series: ChartSeries[] = [
      { id: '2025', label: '2025', color: colors.editionPast, points: slice.points2025 },
    ];
    if (comparison.has2026Curve) {
      series.push({ id: '2026', label: '2026', color: colors.brand, points: slice.points2026 });
    }

    const referenceLines = referenceValues(slice.yMin, slice.yMax).map((value) => ({
      value,
      label: format(value),
    }));

    // La projection vise le bout du week-end : sur une fenêtre de douze heures, son trait
    // tomberait très au-dessus du cadre, ou pire, dedans par hasard.
    if (window.minutes === null && showProjection && comparison.projected2026Eur !== null) {
      referenceLines.push({
        value: toUnit(comparison.projected2026Eur),
        label: `Proj. ${format(toUnit(comparison.projected2026Eur))}`,
      });
    }

    return {
      series,
      slice,
      referenceLines,
      xTicks: elapsedTicks(slice.fromMinutes, slice.spanMinutes, formatElapsedLabel),
      format,
    };
  }, [comparison, window.minutes, asPercent, showProjection]);

  const draw = (chartHeight: number) => (
    <OverlayChart
      series={chart.series}
      maxMinutes={chart.slice.spanMinutes}
      yMin={chart.slice.yMin}
      yMax={chart.slice.yMax}
      referenceLines={chart.referenceLines}
      xTicks={chart.xTicks}
      height={chartHeight}
      // Lire les deux éditions à un instant donné est la seule chose que la légende ne
      // sait pas faire : elle ne parle que de maintenant. Les minutes du tracé étant
      // rebasées sur la fenêtre, le bandeau doit les recaler pour annoncer la vraie
      // position dans l'édition.
      scrub={{
        formatValue: chart.format,
        formatX: (minutes) => formatElapsedLabel(chart.slice.fromMinutes + minutes),
      }}
    />
  );

  const legend = (
    <View className="gap-2 rounded-2xl border border-white/10 bg-surface-raised p-3.5">
      <LegendRow
        color={colors.brand}
        label={`2026 — ${formatElapsedLabel(comparison.current2026Minutes)}`}
        value={formatEuros(comparison.current2026Eur)}
      />
      <LegendRow
        color={colors.editionPast}
        label="2025 au même moment"
        value={
          comparison.eur2025SameElapsed === null
            ? '—'
            : formatEuros(comparison.eur2025SameElapsed)
        }
      />
      <LegendRow label="2025 — total final" value={formatEuros(comparison.final2025Eur)} />
      {showProjection ? (
        <LegendRow
          label="Projection 2026 — estimation"
          value={
            comparison.projected2026Eur === null
              ? '—'
              : formatEuros(comparison.projected2026Eur)
          }
        />
      ) : null}
    </View>
  );

  return (
    <View className="gap-3">
      <SectionHeader
        title="Comparaison 2025 / 2026"
        hint="Les deux cagnottes alignées sur le déroulé de l’événement."
        accessory={
          <Segmented compact options={WINDOWS} value={windowKey} onChange={setWindowKey} />
        }
      />

      {noBackend ? (
        <Text className="text-xs text-amber-200">
          Courbe 2026 indisponible : backend injoignable. Seule l’édition 2025, embarquée dans
          l’application, reste tracée.
        </Text>
      ) : null}

      <Expandable
        title="Comparaison 2025 / 2026"
        expanded={draw(expandedHeight)}
        handleTop={SCRUB_CAPTION_HEIGHT + 8}
      >
        {draw(210)}
      </Expandable>

      {/* Deux réglages qu'on pose et qu'on retire, pas deux vues entre lesquelles choisir :
          la pastille dit son état sans occuper un rail pleine largeur pour un booléen. */}
      <View className="flex-row flex-wrap gap-2">
        <ToggleChip
          label="En % du total 2025"
          active={asPercent}
          onPress={() => setAsPercent((value) => !value)}
          icon="stats-chart-outline"
        />
        <ToggleChip
          label="Projection"
          active={showProjection}
          onPress={() => setShowProjection((value) => !value)}
          icon="trending-up-outline"
          accessibilityLabel="Afficher la projection du total 2026"
        />
      </View>

      {legend}

      {/* Le détail des sources et du recalage se lit une fois, en arrivant, et n'a plus
          rien à dire ensuite : il tient replié sous la section plutôt qu'en quatre
          paragraphes gris entre le graphe et la suite de la page. */}
      <View className="gap-2">
        <Text
          onPress={() => setSourcesOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: sourcesOpen }}
          className="text-[11px] font-semibold text-zevent-300"
        >
          {sourcesOpen ? 'Masquer le détail des sources' : 'D’où viennent ces chiffres ?'}
        </Text>

        {sourcesOpen ? (
          <View className="gap-2">
            <Text className="text-xs text-gray-500">
              T+0 est l’ouverture de la cagnotte 2026, le jeudi à 20 h. Celle de 2025 n’ayant
              ouvert que le vendredi à 18 h, sa courbe démarre à {OFFSET_2025_LABEL} : sans ce
              recalage, on comparerait le jeudi soir 2026 au vendredi soir 2025.
            </Text>
            <Text className="text-xs text-gray-500">
              La projection extrapole l’avance actuelle sur le total final de 2025. C’est une
              estimation, pas une prévision : elle bouge à chaque gros don.
            </Text>
            <Text className="text-xs text-gray-500">
              Courbe 2025 : {history.provenance.provider}, récupérée le{' '}
              {formatDate(history.provenance.fetchedAt)}. Merci aux InGDocs et à EvenMoreStats.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
