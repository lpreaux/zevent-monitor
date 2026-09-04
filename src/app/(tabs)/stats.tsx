import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTimeseries2026, useZeventState } from '@/api/queries';
import { EditionsTable, type EditionRow } from '@/components/editions-table';
import { Expandable } from '@/components/expandable';
import { OverlayChart, type ChartSeries } from '@/components/overlay-chart';
import { LoadingState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { StatTile } from '@/components/stat-tile';
import { formatCount, formatDate, formatEuros, formatEurosCompact } from '@/lib/format';
import { loadHistory2025 } from '@/lib/history-2025';
import {
  COLLECTION_START_THRESHOLD_EUR,
  interpolateEur,
  lastElapsedMinutes,
  shiftElapsed,
  toElapsedSeries,
  type RawPoint,
} from '@/lib/timeseries';

const editionsContent = require('@/content/editions.json') as {
  editions: { year: number; totalEur: number; streamers: number }[];
};

const COLOR_2025 = '#f59e0b';
const COLOR_2026 = '#8b5cf6';

/**
 * Recalage des deux éditions. Sans lui, aligner chaque série sur son propre T+0
 * comparerait le jeudi soir 2026 au vendredi soir 2025 : la cagnotte 2026 a ouvert
 * le jeudi à 20 h, celle de 2025 le vendredi à 18 h seulement.
 */
const OPENING_GAP_MINUTES = 22 * 60;
/**
 * T+0 d'une série est son premier point au-dessus de `COLLECTION_START_THRESHOLD_EUR`,
 * pas l'horaire d'ouverture : les premiers dons 2026 arrivent ~30 min avant 20 h,
 * alors que la série 2025 démarre pile à 18 h. On compense pour que les deux
 * ouvertures tombent bien au même endroit sur l'axe.
 */
const PRE_OPENING_2026_MINUTES = 30;
const OFFSET_2025_MINUTES = OPENING_GAP_MINUTES + PRE_OPENING_2026_MINUTES;

/** `T+22 h 30` — l'unité d'heure reste devant les minutes, comme « 20 h 30 ». */
const OFFSET_2025_LABEL = (() => {
  const hours = Math.floor(OFFSET_2025_MINUTES / 60);
  const minutes = OFFSET_2025_MINUTES % 60;
  return minutes === 0 ? `T+${hours} h` : `T+${hours} h ${String(minutes).padStart(2, '0')}`;
})();

type DisplayMode = 'eur' | 'pct';

const MODE_OPTIONS: { key: DisplayMode; label: string }[] = [
  { key: 'eur', label: 'En euros' },
  { key: 'pct', label: '% du total 2025' },
];

const PROJECTION_OPTIONS: { key: 'on' | 'off'; label: string }[] = [
  { key: 'on', label: 'Projection affichée' },
  { key: 'off', label: 'Projection masquée' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-base font-bold text-white">{title}</Text>
      {children}
    </View>
  );
}

function LegendRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        {color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null}
        <Text className="text-sm text-gray-300">{label}</Text>
      </View>
      <Text className="text-sm font-semibold text-white">{value}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const stateQuery = useZeventState();
  const timeseriesQuery = useTimeseries2026('10m');

  const [mode, setMode] = useState<DisplayMode>('eur');
  const [projection, setProjection] = useState<'on' | 'off'>('on');
  const showProjection = projection === 'on';

  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const landscape = winWidth > winHeight;
  const expandedChartHeight = Math.round((landscape ? winHeight * 0.68 : winHeight * 0.46));

  const onRefresh = useCallback(() => {
    void stateQuery.refetch();
    void timeseriesQuery.refetch();
  }, [stateQuery, timeseriesQuery]);

  const history = useMemo(() => loadHistory2025(), []);

  const model = useMemo(() => {
    const raw2026: RawPoint[] = (timeseriesQuery.data?.points ?? []).map((point) => ({
      t: Date.parse(point.bucket),
      eur: Number(point.donation_cents) / 100,
    }));
    const viewers2026 = (timeseriesQuery.data?.points ?? []).map((point) => Number(point.viewers));

    const elapsed2025 = toElapsedSeries(history.points);
    const elapsed2026 = toElapsedSeries(raw2026);
    const points2025 = shiftElapsed(elapsed2025.points, OFFSET_2025_MINUTES);

    const liveState = stateQuery.data?.data;
    const current2026Eur =
      liveState?.donationAmount.number ?? elapsed2026.points.at(-1)?.eur ?? 0;
    const current2026Minutes = lastElapsedMinutes(elapsed2026.points);
    const has2026Curve = elapsed2026.points.length >= 2;

    // Avant ce décalage, 2025 n'avait pas encore ouvert sa cagnotte : la comparaison
    // vaut 0 € plutôt que « indisponible ».
    const eur2025SameElapsed =
      has2026Curve && current2026Minutes > 0
        ? current2026Minutes < OFFSET_2025_MINUTES
          ? 0
          : interpolateEur(points2025, current2026Minutes)
        : null;

    // Une base 2025 quasi nulle (tout début de collecte) ferait exploser le ratio.
    const projected2026Eur =
      eur2025SameElapsed && eur2025SameElapsed >= COLLECTION_START_THRESHOLD_EUR
        ? current2026Eur * (history.finalEur / eur2025SameElapsed)
        : null;

    const maxMinutes = Math.max(
      lastElapsedMinutes(points2025),
      lastElapsedMinutes(elapsed2026.points),
      60,
    );

    const viewersMax2026 = viewers2026.length ? Math.max(...viewers2026) : 0;

    return {
      points2025,
      elapsed2026,
      has2026Curve,
      current2026Eur,
      current2026Minutes,
      eur2025SameElapsed,
      projected2026Eur,
      maxMinutes,
      viewersMax2026,
      liveState,
    };
  }, [timeseriesQuery.data, stateQuery.data, history]);

  const chart = useMemo(() => {
    const toUnit =
      mode === 'pct'
        ? (value: number) => (history.finalEur > 0 ? (value / history.finalEur) * 100 : 0)
        : (value: number) => value;

    const series: ChartSeries[] = [
      {
        id: '2025',
        label: '2025',
        color: COLOR_2025,
        points: model.points2025.map((p) => ({ minutes: p.minutes, eur: toUnit(p.eur) })),
      },
    ];
    if (model.has2026Curve) {
      series.push({
        id: '2026',
        label: '2026',
        color: COLOR_2026,
        points: model.elapsed2026.points.map((p) => ({ minutes: p.minutes, eur: toUnit(p.eur) })),
      });
    }

    const projectionUnit =
      showProjection && model.projected2026Eur ? toUnit(model.projected2026Eur) : 0;
    const yMaxBase = Math.max(
      toUnit(history.finalEur),
      toUnit(model.current2026Eur),
      projectionUnit,
      mode === 'pct' ? 100 : 0,
    );
    const yMax = yMaxBase * 1.05;

    const referenceLines =
      mode === 'pct'
        ? [25, 50, 75, 100].map((value) => ({ value, label: `${value} %` }))
        : [1_000_000, 5_000_000, 10_000_000, 15_000_000].map((value) => ({
            value,
            label: formatEurosCompact(value),
          }));
    if (showProjection && model.projected2026Eur) {
      referenceLines.push({
        value: projectionUnit,
        label: `Proj. ${mode === 'pct' ? `${Math.round(projectionUnit)} %` : formatEurosCompact(model.projected2026Eur)}`,
      });
    }

    const xTicks: { minutes: number; label: string }[] = [];
    for (let hour = 0; hour * 60 <= model.maxMinutes; hour += 12) {
      xTicks.push({ minutes: hour * 60, label: `${hour} h` });
    }

    return { series, yMax, referenceLines, xTicks };
  }, [mode, showProjection, model, history.finalEur]);

  const editionRows = useMemo<EditionRow[]>(() => {
    const rows: EditionRow[] = [...editionsContent.editions]
      .sort((a, b) => b.year - a.year)
      .map((edition) => ({
        year: edition.year,
        totalEur: edition.totalEur,
        streamers: edition.streamers,
      }));
    const liveState = model.liveState;
    if (liveState || model.has2026Curve) {
      rows.unshift({
        year: 2026,
        totalEur: model.current2026Eur,
        streamers: liveState?.live.length ?? 0,
        live: true,
      });
    }
    return rows;
  }, [model]);

  const noBackend =
    !stateQuery.data && !timeseriesQuery.data && (stateQuery.isError || timeseriesQuery.isError);
  const stillLoading =
    !stateQuery.data &&
    !timeseriesQuery.data &&
    (stateQuery.isLoading || timeseriesQuery.isLoading) &&
    !noBackend;

  if (stillLoading) return <LoadingState label="Chargement des statistiques…" />;

  const delta2026 =
    model.eur2025SameElapsed != null ? model.current2026Eur - model.eur2025SameElapsed : null;

  const renderChart = (chartHeight: number) => (
    <OverlayChart
      series={chart.series}
      maxMinutes={model.maxMinutes}
      yMax={chart.yMax}
      referenceLines={chart.referenceLines}
      xTicks={chart.xTicks}
      height={chartHeight}
    />
  );

  const legendNode = (
    <View className="gap-2 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <LegendRow
        color={COLOR_2026}
        label={`2026 — T+${Math.round(model.current2026Minutes / 60)} h`}
        value={formatEuros(model.current2026Eur)}
      />
      <LegendRow
        color={COLOR_2025}
        label="2025 — total final retenu"
        value={formatEuros(history.finalEur)}
      />
      <LegendRow
        label="2025 au même moment de l’édition"
        value={model.eur2025SameElapsed != null ? formatEuros(model.eur2025SameElapsed) : '—'}
      />
      {delta2026 != null ? (
        <Text
          className={`text-sm font-semibold ${
            delta2026 >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {delta2026 >= 0 ? '+' : '−'}
          {formatEuros(Math.abs(delta2026))} vs 2025 à cet instant
        </Text>
      ) : null}
      {showProjection ? (
        <LegendRow
          label="Projection 2026 (estimation)"
          value={model.projected2026Eur ? formatEuros(model.projected2026Eur) : '—'}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-10 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={stateQuery.isRefetching || timeseriesQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor="#a78bfa"
          />
        }
      >
        {noBackend ? (
          <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <Text className="text-sm text-amber-200">
              Backend injoignable : la courbe 2026 est indisponible, seules les données figées sont
              affichées.
            </Text>
          </View>
        ) : timeseriesQuery.isError ? (
          <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <Text className="text-sm text-amber-200">
              Courbe 2026 momentanément indisponible — dernier état conservé.
            </Text>
          </View>
        ) : null}

        <Section title="Comparaison 2025 / 2026">
          <Text className="text-xs text-gray-500">
            Les deux courbes sont alignées sur le déroulé de l’événement. La cagnotte 2026 ayant
            ouvert le jeudi à 20 h, T+0 correspond à cette ouverture ; celle de 2025 n’ayant ouvert
            que le vendredi à 18 h, sa courbe démarre à {OFFSET_2025_LABEL}.
          </Text>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          <Segmented options={PROJECTION_OPTIONS} value={projection} onChange={setProjection} />

          <Expandable
            title="Comparaison 2025 / 2026"
            expanded={
              <ScrollView contentContainerClassName="gap-4 pb-4">
                <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
                <Segmented
                  options={PROJECTION_OPTIONS}
                  value={projection}
                  onChange={setProjection}
                />
                {renderChart(expandedChartHeight)}
                {legendNode}
                <Text className="text-xs text-gray-500">
                  Astuce : tournez l’appareil en paysage pour étirer la courbe.
                </Text>
              </ScrollView>
            }
          >
            {renderChart(210)}
          </Expandable>

          {legendNode}

          {showProjection ? (
            <Text className="text-xs text-gray-500">
              La projection extrapole le rythme actuel par rapport à la courbe 2025 : simple
              estimation, à désactiver au besoin.
            </Text>
          ) : null}

          <Text className="text-xs text-gray-500">
            Courbe 2025 : {history.provenance.provider}, récupérée le{' '}
            {formatDate(history.provenance.fetchedAt)}. Créditer InGDoc / EvenMoreStats.
          </Text>
        </Section>

        <Section title="Repères 2026">
          <View className="flex-row gap-3">
            <StatTile
              label="€ par streamer"
              value={
                model.liveState && model.liveState.live.length > 0
                  ? formatEuros(model.current2026Eur / model.liveState.live.length)
                  : '—'
              }
              hint={
                model.liveState ? `${model.liveState.live.length} inscrits` : 'backend indisponible'
              }
            />
            <StatTile
              label="Viewers max"
              value={model.viewersMax2026 > 0 ? formatCount(model.viewersMax2026) : '—'}
              hint="cumulés, depuis le début"
            />
          </View>
          <View className="flex-row gap-3">
            <StatTile
              label="Viewers actuels"
              value={
                model.liveState ? formatCount(model.liveState.viewersCount.number) : '—'
              }
            />
            <StatTile
              label="Points collectés"
              value={formatCount(model.elapsed2026.points.length)}
              hint="pas de 10 min"
            />
          </View>
        </Section>

        <Section title="Éditions précédentes">
          <Expandable
            title="Éditions précédentes"
            expanded={
              <ScrollView contentContainerClassName="pb-4">
                <EditionsTable rows={editionRows} />
              </ScrollView>
            }
          >
            <EditionsTable rows={editionRows} />
          </Expandable>
          <Text className="text-xs text-gray-500">
            * 2026 : cagnotte provisoire en cours. Le ZEvent n’a pas eu lieu en 2023. Totaux figés
            d’après zevent.fr (2025 côté Streamlabs : {formatEuros(16_636_297)}).
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
