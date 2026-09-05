import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  useCollectionRate,
  useStreamerSeries,
  useTimeseries2026,
  useZeventState,
} from '@/api/queries';
import { AppHeader } from '@/components/app-header';
import { ScreenShell } from '@/components/screen-shell';
import { BarChart } from '@/components/bar-chart';
import { EditionsTable, type EditionRow } from '@/components/editions-table';
import { Expandable } from '@/components/expandable';
import { OverlayChart, type ChartSeries } from '@/components/overlay-chart';
import { LoadingState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { StatTile } from '@/components/stat-tile';
import { niceCeil, parisHourLabel } from '@/lib/donations';
import { formatCount, formatDate, formatEuros, formatEurosCompact } from '@/lib/format';
import { loadHistory2025 } from '@/lib/history-2025';
import { useFavoritesStore } from '@/store/favorites';
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

/** Couleurs des courbes de la comparaison de favoris (au plus trois streamers). */
const COMPARE_COLORS = ['#8b5cf6', '#f59e0b', '#22d3ee'];
const MAX_COMPARED = 3;

type RateBucket = '30' | '60' | '180';

const RATE_OPTIONS: { key: RateBucket; label: string }[] = [
  { key: '30', label: '30 min' },
  { key: '60', label: '1 h' },
  { key: '180', label: '3 h' },
];

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

/** Rythme de collecte : euros levés par tranche horaire, d'après les échantillons du backend. */
function CollectionRateSection() {
  const [bucket, setBucket] = useState<RateBucket>('60');
  const rateQuery = useCollectionRate(Number(bucket));

  const model = useMemo(() => {
    const points = (rateQuery.data?.points ?? []).filter((p) => p.samples > 0);
    const bars = points.map((point) => ({
      key: point.bucket,
      label: parisHourLabel(point.bucket, bucket === '180' || points.length > 30),
      value: point.raisedCents / 100,
      hint: `pic ${formatCount(point.peakViewers)} viewers`,
    }));
    const peak = points.reduce<(typeof points)[number] | null>(
      (best, point) => (best === null || point.raisedCents > best.raisedCents ? point : best),
      null,
    );
    const labelEvery = bars.length > 36 ? 6 : bars.length > 18 ? 3 : bars.length > 9 ? 2 : 1;
    return { bars, peak, labelEvery };
  }, [rateQuery.data, bucket]);

  return (
    <Section title="Rythme de collecte">
      <Text className="text-xs text-gray-500">
        Euros levés par tranche, en heure de Paris, d’après la collecte du backend (indépendant du
        feed Streamlabs).
      </Text>
      <Segmented options={RATE_OPTIONS} value={bucket} onChange={setBucket} />
      {rateQuery.isError && !rateQuery.data ? (
        <Text className="text-xs text-amber-200">Rythme indisponible : backend injoignable.</Text>
      ) : (
        <BarChart
          bars={model.bars}
          height={150}
          formatValue={(value) => formatEurosCompact(value)}
          labelEvery={model.labelEvery}
        />
      )}
      <View className="flex-row gap-3">
        <StatTile
          label="Tranche la plus généreuse"
          value={model.peak ? formatEurosCompact(model.peak.raisedCents / 100) : '—'}
          hint={model.peak ? parisHourLabel(model.peak.bucket) : undefined}
        />
        <StatTile
          label="Moyenne par tranche"
          value={
            model.bars.length
              ? formatEurosCompact(model.bars.reduce((acc, bar) => acc + bar.value, 0) / model.bars.length)
              : '—'
          }
          hint={`${model.bars.length} tranches`}
        />
      </View>
    </Section>
  );
}

/** Superposition des cagnottes de quelques favoris, alignées sur le T+0 de la collecte. */
function CompareFavoritesSection({ originAt, maxMinutes }: { originAt: number | null; maxMinutes: number }) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = useMemo(
    () => (selected.length ? selected : favorites.slice(0, MAX_COMPARED)),
    [selected, favorites],
  );
  const seriesQuery = useStreamerSeries(chosen);

  const toggle = (login: string) => {
    setSelected((current) => {
      const base = current.length ? current : favorites.slice(0, MAX_COMPARED);
      if (base.includes(login)) return base.filter((entry) => entry !== login);
      if (base.length >= MAX_COMPARED) return [...base.slice(1), login];
      return [...base, login];
    });
  };

  const chart = useMemo(() => {
    const origin = originAt;
    const series: ChartSeries[] = [];
    let yMaxRaw = 0;
    let xMax = 60;
    chosen.forEach((login, index) => {
      const points = seriesQuery.data?.streamers[login] ?? [];
      const elapsed = points
        .map((point) => {
          const t = Date.parse(point.bucket);
          const minutes = origin === null ? 0 : (t - origin) / 60_000;
          return { minutes, eur: point.eur };
        })
        .filter((point) => point.minutes >= 0);
      for (const point of elapsed) {
        yMaxRaw = Math.max(yMaxRaw, point.eur);
        xMax = Math.max(xMax, point.minutes);
      }
      series.push({
        id: login,
        label: login,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length]!,
        points: elapsed,
      });
    });
    const yMax = niceCeil(yMaxRaw);
    // Sans données, `yMax` retombe à 1 et les deux repères s'afficheraient « 1 € » :
    // on ne garde qu'un repère par libellé.
    const referenceLines = [0.5, 1]
      .map((ratio) => ({ value: yMax * ratio, label: formatEurosCompact(yMax * ratio) }))
      .filter((line, index, all) => all.findIndex((other) => other.label === line.label) === index);
    const span = Math.max(xMax, Math.min(maxMinutes, xMax + 60));
    const xTicks: { minutes: number; label: string }[] = [];
    const step = span > 48 * 60 ? 12 : span > 12 * 60 ? 6 : 2;
    for (let hour = 0; hour * 60 <= span; hour += step) xTicks.push({ minutes: hour * 60, label: `${hour} h` });
    return { series, yMax, referenceLines, xTicks, span };
  }, [chosen, seriesQuery.data, originAt, maxMinutes]);

  return (
    <Section title="Comparer mes favoris">
      {favorites.length === 0 ? (
        <Text className="text-sm text-gray-500">
          Ajoutez des favoris depuis l’onglet Streamers pour superposer leurs cagnottes ici.
        </Text>
      ) : (
        <>
          <Text className="text-xs text-gray-500">
            Jusqu’à {MAX_COMPARED} streamers, sur le même axe de temps écoulé que la courbe globale.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {favorites.map((login) => {
              const active = chosen.includes(login);
              return (
                <Pressable
                  key={login}
                  onPress={() => toggle(login)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  className={`rounded-full border px-3 py-1.5 ${
                    active ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-zevent-200' : 'text-gray-400'}`}>
                    {login}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {seriesQuery.isError && !seriesQuery.data ? (
            <Text className="text-xs text-amber-200">Courbes indisponibles : backend injoignable.</Text>
          ) : (
            <OverlayChart
              series={chart.series}
              maxMinutes={chart.span}
              yMax={chart.yMax}
              referenceLines={chart.referenceLines}
              xTicks={chart.xTicks}
              height={180}
            />
          )}
          <View className="gap-1.5 rounded-2xl border border-gray-800 bg-gray-900/60 p-3">
            {chart.series.map((entry) => {
              const last = entry.points.at(-1);
              return (
                <LegendRow
                  key={entry.id}
                  color={entry.color}
                  label={entry.label}
                  value={last ? formatEuros(last.eur) : '—'}
                />
              );
            })}
          </View>
        </>
      )}
    </Section>
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
      originAt2026: elapsed2026.originAt,
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

  const header = <AppHeader title="Statistiques" subtitle="2026 face aux éditions passées" />;

  if (stillLoading) {
    return (
      <ScreenShell header={header}>
        <LoadingState label="Chargement des statistiques…" />
      </ScreenShell>
    );
  }

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
    <ScreenShell header={header}>
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

        <CollectionRateSection />

        <CompareFavoritesSection originAt={model.originAt2026} maxMinutes={model.maxMinutes} />

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
    </ScreenShell>
  );
}
