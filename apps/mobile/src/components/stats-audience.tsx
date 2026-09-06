import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useCollectionRate, useZeventState } from '@/api/queries';
import { DisclosureButton } from '@/components/disclosure-button';
import { Expandable } from '@/components/expandable';
import { HorizontalBars } from '@/components/horizontal-bars';
import { Metric, MetricDivider } from '@/components/metric';
import { OverlayChart, SCRUB_CAPTION_HEIGHT } from '@/components/overlay-chart';
import { SectionHeader } from '@/components/section-header';
import {
  audienceContrast,
  audienceGenerosity,
  audienceTicks,
  buildAudienceCurve,
  completeHours,
  mostWatchedHours,
  type AudienceContrast,
} from '@/lib/audience';
import { niceCeil, parisHourLabel } from '@/lib/donations';
import { formatCount, formatEuros, formatEurosCompact } from '@/lib/format';
import { formatParisTime } from '@/lib/planning';
import { useEditionComparison } from '@/lib/use-edition-comparison';

/**
 * Le cyan du nuancier, jamais porté par une cagnotte sur cet écran : le violet et l'ambre
 * y désignent des éditions, et l'audience ne doit surtout pas se lire comme l'une d'elles.
 */
const AUDIENCE_COLOR = '#22d3ee';

/** L'heure est la maille de lecture du week-end : « l'heure la plus regardée » se dit en heures. */
const BUCKET_MINUTES = 60;

/** Nombre de tranches listées sous le repli. */
const TOP_HOURS = 5;

/**
 * Ce que le dénominateur du ratio est, et ce qu'il n'est pas. La phrase reste à l'écran en
 * permanence : un ratio euros/viewers se lit spontanément comme « ce que donne un
 * spectateur », et c'est exactement ce qu'il ne mesure pas.
 */
const RATIO_NOTE =
  'Le compteur officiel additionne les viewers de toutes les chaînes à un instant donné : ce sont des connexions simultanées, pas des personnes uniques. Le ratio rapporte donc les euros d’une heure à l’audience connectée pendant cette même heure.';

/** Le croisement du week-end, en une phrase. */
function contrastSentence(contrast: AudienceContrast): string {
  const watched = `${parisHourLabel(contrast.mostWatched.bucket)} (${formatCount(contrast.mostWatched.peakViewers)} viewers)`;
  if (contrast.sameHour) {
    return `L’heure la plus regardée est aussi la plus généreuse : ${watched} a levé ${formatEuros(contrast.mostGenerous.raisedEur)}.`;
  }
  return `L’heure la plus regardée, ${watched}, n’est pas la plus généreuse : ${parisHourLabel(contrast.mostGenerous.bucket)} a levé ${formatEuros(contrast.mostGenerous.raisedEur)} avec ${formatCount(contrast.mostGenerous.peakViewers)} viewers.`;
}

/**
 * Section « Audience » de l'écran des statistiques : combien de personnes regardent, quand
 * elles ont été le plus nombreuses, et ce que cette audience donne.
 *
 * Autonome jusque dans ses données — elle appelle ses propres hooks plutôt que de recevoir
 * un modèle en props. Les requêtes sont partagées par React Query : la section ne coûte
 * aucun appel réseau de plus, et elle peut arriver quand elle est prête sans retenir le
 * reste de la page.
 */
export function StatsAudience() {
  const { comparison, viewers2026, noBackend, isLoading } = useEditionComparison();
  const state = useZeventState();
  const rate = useCollectionRate(BUCKET_MINUTES);
  const [hoursOpen, setHoursOpen] = useState(false);

  const originAt = comparison.originAt2026;
  const curve = useMemo(() => buildAudienceCurve(viewers2026, originAt), [viewers2026, originAt]);
  const ticks = useMemo(
    () => audienceTicks(originAt, curve.spanMinutes),
    [originAt, curve.spanMinutes],
  );

  const hours = useMemo(() => {
    // La largeur des tranches vient de la réponse : le backend peut arrondir la demande.
    const bucketMinutes = rate.data?.bucketMinutes ?? BUCKET_MINUTES;
    const closed = completeHours(rate.data?.points ?? [], bucketMinutes);
    const latest = closed.length ? closed[closed.length - 1] : null;
    return {
      contrast: audienceContrast(closed),
      weekend: audienceGenerosity(closed, bucketMinutes),
      latest: latest ? audienceGenerosity([latest], bucketMinutes) : null,
      latestBucket: latest?.bucket ?? null,
      top: mostWatchedHours(closed, TOP_HOURS),
    };
  }, [rate.data]);

  const viewersNow = state.data?.data.viewersCount.number ?? null;
  const hasCurve = curve.points.length >= 2 && curve.spanMinutes > 0;

  // L'axe s'arrête sur une borne ronde au-dessus du pic : les repères y tombent alors sur
  // des nombres qu'on lit sans les déchiffrer.
  const yMax = niceCeil(curve.peak?.viewers ?? 0);

  const draw = (height: number) => (
    <OverlayChart
      series={[
        // `points[].eur` porte des viewers : le champ ne nomme que l'unité de l'axe Y.
        { id: 'audience-2026', label: 'Viewers', color: AUDIENCE_COLOR, points: curve.points },
      ]}
      maxMinutes={curve.spanMinutes}
      yMax={yMax}
      referenceLines={[0.5, 1].map((ratio) => ({
        value: yMax * ratio,
        label: formatCount(yMax * ratio),
      }))}
      xTicks={ticks}
      height={height}
      // La courbe d'audience se lit au doigt comme les autres. Ce n'est pas qu'une
      // question d'uniformité : sans son bandeau, la pastille d'agrandissement — posée à
      // la même hauteur sur tous les graphes de l'écran — tombait ici vingt pixels trop
      // bas, en plein sur le tracé.
      scrub={{
        formatValue: (value) => `${formatCount(value)} viewers`,
        // L'axe porte des heures de Paris, pas du temps écoulé : « 03h20 » situe une nuit
        // de ZEvent mieux que « T+31 h ».
        formatX:
          originAt === null
            ? undefined
            : (minutes) => formatParisTime(new Date(originAt + minutes * 60_000).toISOString()),
      }}
    />
  );

  return (
    <View className="gap-3">
      <SectionHeader
        title="Audience"
        hint="Viewers relevés en même temps que la cagnotte, toutes chaînes confondues."
      />

      {noBackend ? (
        <Text className="text-xs text-amber-200">Audience indisponible : backend injoignable.</Text>
      ) : (
        <>
          {hasCurve ? (
            <Expandable
              title="Audience du week-end"
              expanded={draw(320)}
              handleTop={SCRUB_CAPTION_HEIGHT + 8}
            >
              {draw(150)}
            </Expandable>
          ) : (
            <Text className="text-xs text-gray-500">
              {isLoading
                ? 'Chargement de l’audience…'
                : 'La courbe apparaîtra dès que la collecte aura relevé quelques points.'}
            </Text>
          )}

          <View className="flex-row items-start">
            <Metric
              label="En ce moment"
              value={viewersNow === null ? '—' : formatCount(viewersNow)}
              hint="viewers cumulés"
            />
            <MetricDivider />
            <Metric
              label="Pic d’audience"
              value={curve.peak ? formatCount(curve.peak.viewers) : '—'}
              hint={curve.peak ? parisHourLabel(new Date(curve.peak.at).toISOString()) : undefined}
            />
          </View>

          <View className="flex-row items-start">
            <Metric
              label="Euros pour 1 000 viewers"
              value={hours.latest ? formatEuros(hours.latest.eurPerThousandViewerHours) : '—'}
              hint={
                hours.latestBucket
                  ? `sur ${parisHourLabel(hours.latestBucket)}, dernière heure complète`
                  : 'en attente d’une heure complète'
              }
            />
          </View>

          <Text className="text-[11px] text-gray-500">
            {hours.weekend
              ? `${RATIO_NOTE} Sur l’ensemble du week-end, il s’établit à ${formatEuros(hours.weekend.eurPerThousandViewerHours)}.`
              : RATIO_NOTE}
          </Text>

          {hours.contrast ? (
            <Text className="text-xs text-gray-400">{contrastSentence(hours.contrast)}</Text>
          ) : null}

          {hours.top.length > 1 ? (
            <>
              <DisclosureButton
                expanded={hoursOpen}
                onPress={() => setHoursOpen((open) => !open)}
                label={`Les ${hours.top.length} heures les plus regardées`}
                expandedLabel="Masquer les heures"
              />
              {hoursOpen ? (
                <HorizontalBars
                  color={AUDIENCE_COLOR}
                  bars={hours.top.map((entry) => ({
                    key: entry.bucket,
                    label: parisHourLabel(entry.bucket),
                    value: entry.peakViewers,
                    valueLabel: `${formatCount(entry.peakViewers)} viewers`,
                    hint: `${formatEurosCompact(entry.raisedEur)} levés sur la tranche`,
                  }))}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </View>
  );
}
