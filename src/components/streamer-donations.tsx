import { Fragment, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useStreamerDonations } from '@/api/queries';
import { DonationLine, DONATION_LINE_INSET } from '@/components/donation-line';
import { Metric, MetricDivider } from '@/components/metric';
import { ObservedChip } from '@/components/observed-chip';
import { RowSeparator } from '@/components/row-separator';
import { SectionHeader } from '@/components/section-header';
import { SectionLink } from '@/components/section-link';
import { SectionTitle } from '@/components/section-title';
import { Segmented } from '@/components/segmented';
import { DonationsSkeleton } from '@/components/skeleton';
import { StackedBar } from '@/components/stacked-bar';
import { formatCount, formatEuros } from '@/lib/format';
import { useNow } from '@/lib/use-now';

type Mode = 'recent' | 'largest';

const MODES: { key: Mode; label: string }[] = [
  { key: 'recent', label: 'Derniers' },
  { key: 'largest', label: 'Plus gros' },
];

/** Dons listés sous les chiffres : de quoi lire l'ambiance, pas de quoi tout parcourir. */
const LINES_VISIBLE = 8;

/** Montant à partir duquel un don est mis en avant sur une fiche personnelle. */
const HIGHLIGHT_CENTS = 10_000;

/** Part en deçà de laquelle une tranche n'est plus étiquetée dans la légende. */
const MIN_LEGEND_RATIO = 0.02;

interface StreamerDonationsProps {
  twitch: string;
}

/**
 * Section « Dons reçus » : ce que le feed Streamlabs a vu arriver chez ce streamer.
 *
 * La liste ne cherche pas à être exhaustive — le feed complet vit dans l'onglet Dons, où
 * il est paginé et filtrable, et un lien l'y ouvre déjà réglé sur ce streamer. Ce qu'on
 * garde ici, c'est ce que ce feed ne montre pas : la forme de ses dons. Beaucoup de
 * petits, quelques gros, ou l'inverse — deux cagnottes identiques racontent alors deux
 * week-ends très différents.
 */
export function StreamerDonations({ twitch }: StreamerDonationsProps) {
  const router = useRouter();
  const query = useStreamerDonations(twitch);
  const now = useNow(15_000);
  const [mode, setMode] = useState<Mode>('recent');
  const data = query.data;

  const segments = useMemo(
    () =>
      (data?.distribution ?? [])
        .filter((bucket) => bucket.totalCents > 0)
        .map((bucket) => ({
          key: bucket.key,
          label: bucket.label,
          value: bucket.totalCents,
          hint: `${formatCount(bucket.count)} don${bucket.count > 1 ? 's' : ''}`,
        })),
    [data],
  );

  const header = (hint?: string) => (
    <SectionHeader
      title="Dons reçus"
      hint={hint}
      accessory={
        data && data.summary.count > 0 ? (
          <Segmented compact options={MODES} value={mode} onChange={setMode} />
        ) : null
      }
    />
  );

  if (query.isError && !data) {
    return (
      <View className="gap-3">
        {header()}
        <Text className="text-xs text-amber-200">Dons indisponibles : backend injoignable.</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View className="gap-3">
        {header()}
        <DonationsSkeleton rows={4} />
      </View>
    );
  }

  const { summary } = data;
  const lines = (mode === 'largest' ? data.largest : data.recent).slice(0, LINES_VISIBLE);

  return (
    <View className="gap-3">
      {header(
        summary.count > 0
          ? `${formatEuros(summary.totalCents / 100)} vus passer dans le feed`
          : undefined,
      )}

      {summary.count === 0 ? (
        <Text className="text-sm text-gray-500">
          Aucun don observé pour ce streamer depuis le début de la collecte.
        </Text>
      ) : (
        <>
          <View className="flex-row items-start">
            <Metric
              label="Dons observés"
              value={formatCount(summary.count)}
              hint={
                summary.withComment > 0
                  ? `${formatCount(summary.withComment)} avec message`
                  : undefined
              }
            />
            <MetricDivider />
            <Metric
              label="Don moyen"
              value={summary.meanCents === null ? '—' : formatEuros(summary.meanCents / 100)}
              hint={
                summary.medianCents === null
                  ? undefined
                  : `médian ${formatEuros(summary.medianCents / 100)}`
              }
            />
            <MetricDivider />
            <Metric
              label="Plus gros"
              value={summary.maxCents === null ? '—' : formatEuros(summary.maxCents / 100)}
              hint={data.largest[0]?.donor}
            />
          </View>

          {segments.length > 1 ? (
            <View className="gap-2">
              <SectionTitle label="Répartition des montants" />
              <StackedBar segments={segments} minLegendRatio={MIN_LEGEND_RATIO} />
            </View>
          ) : null}

          <View>
            <SectionTitle
              label={mode === 'largest' ? 'Ses plus gros dons' : 'Ses derniers dons'}
              count={lines.length}
            />
            {lines.map((donation, index) => (
              <Fragment key={donation.id}>
                {index > 0 ? <RowSeparator inset={DONATION_LINE_INSET} /> : null}
                <DonationLine
                  donation={donation}
                  hideStreamer
                  highlightCents={HIGHLIGHT_CENTS}
                  rank={mode === 'largest' ? index + 1 : undefined}
                  now={now}
                />
              </Fragment>
            ))}
          </View>

          {/* Le feed complet vit dans l'onglet Dons : on l'y ouvre déjà filtré sur ce
              streamer plutôt que de recopier ici une seconde liste paginée. */}
          <SectionLink
            label="Tous ses dons, en direct"
            accessibilityLabel={`Ouvrir le feed des dons filtré sur ${twitch}`}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/donations',
                params: { section: 'feed', twitch: twitch.toLowerCase() },
              })
            }
          />
        </>
      )}

      <ObservedChip
        observed={{
          count: summary.count,
          totalCents: summary.totalCents,
          firstAt: summary.firstAt,
          lastAt: summary.lastAt,
        }}
        subject="Cette synthèse"
      />
    </View>
  );
}
