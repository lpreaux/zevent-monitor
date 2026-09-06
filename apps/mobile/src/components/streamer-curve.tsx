import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useStreamerSeries } from '@/api/queries';
import { Expandable } from '@/components/expandable';
import { OverlayChart, SCRUB_CAPTION_HEIGHT } from '@/components/overlay-chart';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { niceCeil } from '@/lib/donations';
import { formatEuros, formatEurosCompact } from '@/lib/format';
import { formatParisTime } from '@/lib/planning';
import { curveSlice, type CurveSlice } from '@/lib/streamer-profile';
import { useNow } from '@/lib/use-now';

type WindowKey = '1h' | '6h' | 'all';

interface CurveWindow {
  key: WindowKey;
  label: string;
  /** Profondeur de la tranche, `null` pour toute la collecte. */
  minutes: number | null;
  /**
   * Résolution demandée au backend. Une heure lue par pas de dix minutes ne compte que
   * six points : la courbe y devient une ligne brisée qui invente ses paliers.
   */
  resolution: '1m' | '5m' | '10m';
  /** Espacement des graduations, en minutes. */
  tick: number;
  /** La fenêtre en toutes lettres, pour la phrase qui la cite. */
  sentence: string;
}

const WINDOWS: CurveWindow[] = [
  { key: '1h', label: '1 h', minutes: 60, resolution: '1m', tick: 15, sentence: 'sur la dernière heure' },
  { key: '6h', label: '6 h', minutes: 360, resolution: '5m', tick: 60, sentence: 'sur les 6 dernières heures' },
  { key: 'all', label: 'Week-end', minutes: null, resolution: '10m', tick: 0, sentence: 'depuis le début' },
];

/** Marge laissée au-dessus et en dessous de la tranche, en part de son amplitude. */
const Y_PADDING = 0.15;

/** L'horloge n'a qu'à suivre le pas de collecte le plus fin. */
const CLOCK_MS = 60_000;

interface ChartModel {
  points: { minutes: number; eur: number }[];
  spanMinutes: number;
  yMin: number;
  yMax: number;
  referenceLines: { value: number; label: string }[];
  xTicks: { minutes: number; label: string }[];
}

/**
 * Cadre du tracé. Sur le week-end entier, l'axe part de zéro — c'est une cagnotte qui se
 * remplit, et sa hauteur est le sujet. Sur une fenêtre courte, il se recentre sur la
 * tranche : depuis zéro, une heure de collecte est une ligne plate collée en haut.
 */
function buildChart(slice: CurveSlice, window: CurveWindow, currentEur: number): ChartModel {
  if (window.minutes === null) {
    const yMax = niceCeil(Math.max(currentEur, slice.maxEur));
    const step = slice.spanMinutes > 48 * 60 ? 12 : slice.spanMinutes > 12 * 60 ? 6 : 2;
    const xTicks: { minutes: number; label: string }[] = [];
    for (let hour = 0; hour * 60 <= slice.spanMinutes; hour += step) {
      xTicks.push({ minutes: hour * 60, label: `${hour} h` });
    }
    return {
      points: slice.points,
      spanMinutes: slice.spanMinutes,
      yMin: 0,
      yMax,
      referenceLines: [0.5, 1].map((ratio) => ({
        value: yMax * ratio,
        label: formatEurosCompact(yMax * ratio),
      })),
      xTicks,
    };
  }

  // Une tranche sans le moindre don serait plate : on lui invente une amplitude d'un euro
  // pour que la ligne se pose au milieu du cadre plutôt que sur son bord.
  const amplitude = Math.max(slice.maxEur - slice.minEur, 1);
  const yMin = Math.max(0, slice.minEur - amplitude * Y_PADDING);
  const yMax = slice.maxEur + amplitude * Y_PADDING;
  const middle = Math.round((yMin + yMax) / 200) * 100;

  const xTicks: { minutes: number; label: string }[] = [];
  for (let minutes = 0; minutes <= slice.spanMinutes; minutes += window.tick) {
    xTicks.push({
      minutes,
      label: formatParisTime(new Date(slice.fromAt + minutes * 60_000).toISOString()),
    });
  }

  return {
    points: slice.points,
    spanMinutes: slice.spanMinutes,
    yMin,
    yMax,
    // Un seul repère sur une fenêtre courte : l'échelle y est si resserrée que deux traits
    // porteraient des montants presque identiques.
    referenceLines:
      middle > yMin && middle < yMax ? [{ value: middle, label: formatEuros(middle) }] : [],
    xTicks,
  };
}

interface StreamerCurveProps {
  twitch: string;
  display: string;
  /** Cagnotte officielle, plus fraîche que le dernier point agrégé. */
  currentEur: number;
}

/**
 * Section « Sa cagnotte » : la courbe personnelle, sur la fenêtre qu'on choisit.
 *
 * La fenêtre ne sert pas qu'à zoomer, elle change la question posée — « où en est-il du
 * week-end » ou « qu'est-ce qui vient de se passer ». La seconde est la plus fréquente
 * pendant le direct, c'est donc l'heure écoulée qui s'ouvre en premier.
 */
export function StreamerCurve({ twitch, display, currentEur }: StreamerCurveProps) {
  const [key, setKey] = useState<WindowKey>('1h');
  const window = WINDOWS.find((option) => option.key === key) ?? WINDOWS[0];
  const now = useNow(CLOCK_MS);

  const query = useStreamerSeries([twitch], window.resolution);
  const points = query.data?.streamers[twitch.toLowerCase()];

  const chart = useMemo(() => {
    const slice = points ? curveSlice(points, window.minutes, now) : null;
    return slice ? { slice, model: buildChart(slice, window, currentEur) } : null;
  }, [points, window, now, currentEur]);

  const hint = chart
    ? chart.slice.deltaEur > 0
      ? `+${formatEuros(chart.slice.deltaEur)} ${window.sentence}`
      : `rien de nouveau ${window.sentence}`
    : undefined;

  const draw = (height: number) =>
    chart ? (
      <OverlayChart
        series={[{ id: twitch, label: display, color: '#8b5cf6', points: chart.model.points }]}
        maxMinutes={chart.model.spanMinutes}
        yMin={chart.model.yMin}
        yMax={chart.model.yMax}
        referenceLines={chart.model.referenceLines}
        xTicks={chart.model.xTicks}
        height={height}
        // Le bandeau reprend l'unité de l'axe : une heure de la journée sur une fenêtre
        // courte — « il a pris 300 € vers 23 h » est ce qu'on cherche à savoir —, le
        // temps écoulé sur le week-end entier, où l'heure seule ne dirait pas quel jour.
        scrub={{
          formatValue: formatEuros,
          formatX:
            window.minutes === null
              ? undefined
              : (minutes) =>
                  formatParisTime(
                    new Date(chart.slice.fromAt + minutes * 60_000).toISOString(),
                  ),
        }}
      />
    ) : null;

  return (
    <View className="gap-3">
      <SectionHeader
        title="Sa cagnotte"
        hint={hint}
        accessory={<Segmented compact options={WINDOWS} value={key} onChange={setKey} />}
      />

      {query.isError && !query.data ? (
        <Text className="text-xs text-amber-200">Courbe indisponible : backend injoignable.</Text>
      ) : chart ? (
        <Expandable
          title={`Cagnotte de ${display}`}
          expanded={draw(320)}
          handleTop={SCRUB_CAPTION_HEIGHT + 8}
        >
          {draw(150)}
        </Expandable>
      ) : (
        <Text className="text-xs text-gray-500">
          {query.isLoading
            ? 'Chargement de la courbe…'
            : window.minutes === null
              ? 'La courbe apparaîtra dès que la collecte aura relevé quelques points pour ce streamer.'
              : 'Pas assez de points sur cette fenêtre : essayez une fenêtre plus large.'}
        </Text>
      )}
    </View>
  );
}
