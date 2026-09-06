import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useCollectionRate } from '@/api/queries';
import { BarChart } from '@/components/bar-chart';
import { Metric, MetricDivider } from '@/components/metric';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import {
  buildCollectionRate,
  compareLastWindow,
  type RateBucket,
  type RateComparison,
} from '@/lib/collection-rate';
import { parisHourLabel } from '@/lib/donations';
import { formatCount, formatEurosCompact, formatPercent } from '@/lib/format';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { TONE_TEXT } from '@/theme';

type BucketKey = '30' | '60' | '180';

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: '30', label: '30 min' },
  { key: '60', label: '1 h' },
  { key: '180', label: '3 h' },
];

/**
 * Violet clair pour la meilleure tranche : l'ambre du dessin par défaut est ici la
 * couleur de 2025, et deux sens pour une même teinte sur un même graphe, c'est un
 * graphe qu'on lit de travers.
 */
const PEAK_COLOR = '#a78bfa';

/** Écart relatif tel qu'on l'énonce : le signe est porté par le texte, pas par le nombre. */
function formatGap(gap: number): string {
  return `${gap >= 0 ? '+' : '−'}${formatPercent(Math.abs(gap))}`;
}

/**
 * La phrase de tête : ce que la section apporte vraiment. L'histogramme dit combien on
 * lève par tranche, elle seule dit si c'est beaucoup.
 *
 * Sans comparaison possible, elle se contente du montant en gris : annoncer un rythme
 * en vert parce qu'il n'a rien à affronter serait une bonne nouvelle inventée.
 */
function sentenceFor(last: RateComparison): { text: string; tone: string } | null {
  if (last.eur === null) return null;
  const amount = `Sur la dernière heure, ${formatEurosCompact(last.eur)}`;

  if (last.gap !== null) {
    return {
      text: `${amount} — soit ${formatGap(last.gap)} par rapport à 2025 au même moment.`,
      tone: TONE_TEXT[last.gap >= 0 ? 'ahead' : 'behind'],
    };
  }
  if (last.before2025Opening) {
    return {
      text: `${amount}. À ce stade de l’édition, 2025 n’avait pas encore ouvert sa cagnotte : rien à comparer.`,
      tone: TONE_TEXT.idle,
    };
  }
  if (last.eur2025 === null) {
    return {
      text: `${amount}. La courbe 2025 ne va pas jusque-là : pas de comparaison à cet instant.`,
      tone: TONE_TEXT.idle,
    };
  }
  return {
    text: `${amount}. 2025 ouvrait tout juste sa cagnotte : un pourcentage n’y voudrait rien dire.`,
    tone: TONE_TEXT.idle,
  };
}

/** Ce que 2025 faisait sur la même tranche, affiché au tap sur une barre. */
function bucketHint(bucket: RateBucket): string | undefined {
  if (bucket.eur2025 === null) return undefined;
  if (bucket.gap !== null) {
    return `2025 : ${formatEurosCompact(bucket.eur2025)} · ${formatGap(bucket.gap)}`;
  }
  return bucket.eur2025 === 0
    ? 'cagnotte 2025 pas encore ouverte'
    : `2025 : ${formatEurosCompact(bucket.eur2025)}`;
}

/**
 * Section « Rythme de collecte » : les euros levés par tranche horaire, et surtout ce
 * que l'édition précédente en faisait au même moment.
 *
 * Un rythme ne se juge que par comparaison. La courbe 2025 embarquée est cumulative,
 * mais recalée sur le même temps écoulé elle rend, par différences, le rythme d'alors —
 * de quoi poser un repère sur l'histogramme, chiffrer chaque tranche au tap, et dire en
 * une phrase si le week-end en cours va plus vite ou moins vite que le précédent.
 */
export function StatsRate() {
  const [bucket, setBucket] = useState<BucketKey>('60');
  const bucketMinutes = Number(bucket);
  const rateQuery = useCollectionRate(bucketMinutes);
  const { comparison } = useEditionComparison();

  const model = useMemo(
    () =>
      buildCollectionRate({
        points: rateQuery.data?.points ?? [],
        bucketMinutes,
        points2025: comparison.points2025,
        originAt2026: comparison.originAt2026,
      }),
    [rateQuery.data, bucketMinutes, comparison.points2025, comparison.originAt2026],
  );

  const lastHour = useMemo(
    () =>
      compareLastWindow(
        comparison.points2025,
        comparison.current2026Minutes,
        comparison.eurPerHour,
      ),
    [comparison.points2025, comparison.current2026Minutes, comparison.eurPerHour],
  );

  const chart = useMemo(() => {
    const bars = model.buckets.map((entry) => ({
      key: entry.key,
      // Le jour n'a de sens que quand l'axe couvre plusieurs journées ; sur une poignée
      // de tranches il répète « sam. » sous chaque barre.
      label: parisHourLabel(entry.key, bucketMinutes >= 180 || model.buckets.length > 30),
      value: entry.eur,
      hint: bucketHint(entry),
    }));
    const labelEvery = bars.length > 36 ? 6 : bars.length > 18 ? 3 : bars.length > 9 ? 2 : 1;
    // Un repère à zéro (2025 dormait encore sur toute la période) se confondrait avec
    // le bas du cadre et n'apprendrait rien.
    const reference =
      model.average2025Eur !== null && model.average2025Eur > 0
        ? { value: model.average2025Eur, label: `2025 : ${formatEurosCompact(model.average2025Eur)}` }
        : undefined;
    return { bars, labelEvery, reference };
  }, [model, bucketMinutes]);

  const sentence = sentenceFor(lastHour);
  const bucketCount = model.buckets.length;

  return (
    <View className="gap-3">
      <SectionHeader
        title="Rythme de collecte"
        hint="Euros levés par tranche, en heure de Paris, d’après la collecte du backend."
        accessory={<Segmented compact options={BUCKETS} value={bucket} onChange={setBucket} />}
      />

      {sentence ? (
        <Text className={`text-[13px] font-semibold ${sentence.tone}`}>{sentence.text}</Text>
      ) : null}

      {rateQuery.isError && !rateQuery.data ? (
        <Text className="text-xs text-amber-200">Rythme indisponible : backend injoignable.</Text>
      ) : bucketCount === 0 ? (
        <Text className="text-xs text-gray-500">
          {rateQuery.isLoading
            ? 'Mesure du rythme en cours…'
            : 'L’histogramme apparaîtra dès que la collecte aura relevé sa première tranche.'}
        </Text>
      ) : (
        <>
          <BarChart
            bars={chart.bars}
            height={150}
            peakColor={PEAK_COLOR}
            formatValue={(value) => formatEurosCompact(value)}
            labelEvery={chart.labelEvery}
            reference={chart.reference}
          />
          <Text className="text-[11px] text-gray-500">
            {chart.reference
              ? 'Le trait ambré marque ce que 2025 levait en moyenne par tranche sur la même période. Tapez une barre pour la comparer à la sienne.'
              : 'Tapez une barre pour le détail de la tranche.'}
          </Text>
        </>
      )}

      <View className="flex-row items-start">
        <Metric
          label="Rythme actuel"
          value={
            comparison.eurPerHour !== null ? `${formatEurosCompact(comparison.eurPerHour)}/h` : '—'
          }
          hint="sur la dernière heure"
          size="lg"
        />
        <MetricDivider />
        <Metric
          label="2025 au même moment"
          value={lastHour.eur2025 !== null ? `${formatEurosCompact(lastHour.eur2025)}/h` : '—'}
          hint={lastHour.before2025Opening ? 'cagnotte pas encore ouverte' : 'à ce stade du week-end'}
          size="lg"
        />
      </View>

      <View className="flex-row items-start">
        <Metric
          label="Meilleure tranche"
          value={model.peak ? formatEurosCompact(model.peak.eur) : '—'}
          hint={model.peak ? parisHourLabel(model.peak.key) : undefined}
        />
        <MetricDivider />
        <Metric
          label="Moyenne par tranche"
          value={bucketCount > 0 ? formatEurosCompact(model.averageEur) : '—'}
          hint={
            bucketCount > 0
              ? `sur ${formatCount(bucketCount)} tranche${bucketCount > 1 ? 's' : ''}`
              : undefined
          }
        />
      </View>
    </View>
  );
}
