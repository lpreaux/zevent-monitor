import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useZeventState } from '@/api/queries';
import { DisclosureButton } from '@/components/disclosure-button';
import { EditionsTable, type EditionRow } from '@/components/editions-table';
import { HorizontalBars, type HorizontalBar } from '@/components/horizontal-bars';
import { Metric, MetricDivider } from '@/components/metric';
import { SectionHeader } from '@/components/section-header';
import { buildEditionsOverview, CURRENT_EDITION_YEAR, type Edition } from '@/lib/editions';
import { formatCount, formatEuros, formatEurosCompact, formatRank } from '@/lib/format';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { colors } from '@/theme';

/** Couleur de marque : l'édition qui se joue pendant qu'on la regarde. */
const COLOR_CURRENT = colors.brand;
/**
 * L'ambre des éditions closes, la même que la courbe 2025 de la comparaison plus haut :
 * dans cet écran, violet veut dire « en cours » et ambre « déjà écrit ». Deux barres de
 * la même couleur auraient laissé la ligne 2026 se fondre dans le passé.
 */
const COLOR_PAST = colors.editionPast;

/**
 * Ligne de contexte sous chaque barre. Le nom de baptême et les dates dorment dans
 * src/content/editions.json depuis le début sans que rien ne les affiche : ce sont eux qui
 * font la différence entre une liste d'années et dix week-ends qui ont eu lieu.
 */
function contextLine(edition: Edition): string {
  if (edition.live) return 'en cours · total provisoire';
  const dates = edition.dates ?? '';
  return edition.label ? `« ${edition.label} » · ${dates}` : dates;
}

/**
 * L'enjeu de l'instant, en une phrase : où en est 2026 au classement, et ce qu'il lui
 * manque pour gagner une place.
 *
 * Quand 2026 passe en tête, la phrase ne disparaît pas — c'est précisément le moment où
 * elle a le plus à dire : elle annonce l'avance prise sur l'édition reléguée derrière.
 * Une section qui perdrait sa ligne d'enjeu au sommet donnerait l'impression d'un calcul
 * cassé au pire moment.
 */
function StakesLine({
  rank,
  editionCount,
  target,
  gapEur,
  runnerUp,
  leadEur,
}: {
  rank: number;
  editionCount: number;
  target: Edition | null;
  gapEur: number | null;
  runnerUp: Edition | null;
  leadEur: number | null;
}) {
  const position = (
    <Text className="font-semibold text-white">
      {`${formatRank(rank)} sur ${formatCount(editionCount)} éditions`}
    </Text>
  );

  if (target && gapEur !== null) {
    return (
      <Text className="text-sm text-gray-300">
        {`${CURRENT_EDITION_YEAR} est `}
        {position}
        {' : il manque '}
        <Text className="font-semibold text-zevent-200">{formatEurosCompact(gapEur)}</Text>
        {` pour dépasser ${target.year}.`}
      </Text>
    );
  }

  if (runnerUp && leadEur !== null && leadEur > 0) {
    return (
      <Text className="text-sm text-gray-300">
        {`${CURRENT_EDITION_YEAR} est `}
        {position}
        {' : '}
        <Text className="font-semibold text-zevent-200">{formatEurosCompact(leadEur)}</Text>
        {` au-dessus de ${runnerUp.year}, l’édition la plus généreuse jusqu’ici.`}
      </Text>
    );
  }

  // Égalité à l'euro près avec le record : rarissime, mais « 0 € d'avance » se lirait
  // comme une panne de calcul.
  if (runnerUp) {
    return (
      <Text className="text-sm text-gray-300">
        {`${CURRENT_EDITION_YEAR} vient d’égaler ${runnerUp.year}, l’édition la plus généreuse jusqu’ici.`}
      </Text>
    );
  }

  return (
    <Text className="text-sm text-gray-300">
      {`${CURRENT_EDITION_YEAR} est `}
      {position}
      {'.'}
    </Text>
  );
}

/**
 * Section « Éditions précédentes » : dix ans de ZEvent en barres, et la place que
 * l'édition en cours occupe au milieu d'elles.
 *
 * Le tableau chiffré ne suffisait pas. Un tableau se lit ligne à ligne, il faut retenir
 * 3,5 M€ le temps d'arriver à 5,7 M€ pour comprendre que quelque chose s'est passé en
 * 2019 ; les barres, elles, donnent la silhouette d'un coup d'œil — la marche de 2019, le
 * plateau de 2021 à 2024, le bond de 2025. Le détail chiffré n'a pas disparu pour autant,
 * il attend sous un bouton : on vient d'abord voir la forme, on va chercher les décimales
 * ensuite.
 *
 * La section est autonome et sans props : elle appelle elle-même les requêtes partagées,
 * que React Query rend déjà aux autres sections de l'écran — l'afficher ne coûte donc
 * aucun appel réseau supplémentaire.
 */
export function EditionsHistory() {
  const { comparison } = useEditionComparison();
  const state = useZeventState();
  const [detailed, setDetailed] = useState(false);

  const streamers = state.data?.data.live.length ?? 0;

  const overview = useMemo(
    () => buildEditionsOverview({ totalEur: comparison.current2026Eur, streamers }),
    [comparison.current2026Eur, streamers],
  );

  const bars = useMemo<HorizontalBar[]>(
    () =>
      overview.editions.map((edition) => ({
        key: String(edition.year),
        label: String(edition.year),
        value: edition.totalEur,
        valueLabel: formatEurosCompact(edition.totalEur),
        hint: contextLine(edition),
        color: edition.live ? COLOR_CURRENT : COLOR_PAST,
      })),
    [overview.editions],
  );

  const rows = useMemo<EditionRow[]>(
    () =>
      overview.editions.map((edition) => ({
        year: edition.year,
        totalEur: edition.totalEur,
        streamers: edition.streamers,
        live: edition.live,
      })),
    [overview.editions],
  );

  const oldest = overview.editions[overview.editions.length - 1];
  const newest = overview.editions[0];

  // Sans édition en cours, l'en-tête dit pourquoi il n'y a que neuf barres. C'est une
  // précision, pas une erreur : les totaux passés sont embarqués dans l'application et
  // n'ont jamais eu besoin du réseau pour s'afficher.
  const hint = overview.current
    ? `${formatCount(overview.editions.length)} éditions à la même échelle, de ${oldest.year} à aujourd’hui.`
    : `${formatCount(overview.editions.length)} éditions à la même échelle, de ${oldest.year} à ${newest.year}. La cagnotte ${CURRENT_EDITION_YEAR} rejoindra le classement dès les premiers dons.`;

  const notes: string[] = [
    ...(overview.current
      ? [`${CURRENT_EDITION_YEAR} : cagnotte provisoire, l’édition est en cours.`]
      : []),
    ...(overview.missingYears.length > 0
      ? [`Pas de ZEvent en ${overview.missingYears.join(', ')}.`]
      : []),
    ...overview.disputed.map(
      (edition) =>
        `${edition.year} : ${formatEuros(edition.totalEur)} selon ${edition.totalSource ?? 'la source retenue'}, ${formatEuros(edition.altTotalEur ?? 0)} selon ${edition.altTotalSource ?? 'une autre source'} — c’est le premier qui sert de référence ici, barre comme tableau.`,
    ),
    'Totaux des éditions closes figés d’après zevent.fr.',
  ];

  return (
    <View className="gap-3">
      <SectionHeader title="Éditions précédentes" hint={hint} />

      {overview.current && overview.currentRank !== null ? (
        <>
          <StakesLine
            rank={overview.currentRank}
            editionCount={overview.editions.length}
            target={overview.target}
            gapEur={overview.gapEur}
            runnerUp={overview.runnerUp}
            leadEur={overview.leadEur}
          />

          {/* Les deux chiffres qui ne se lisent pas dans les barres : la place, et ce que
              vaut un streamer inscrit — le seul angle sous lequel 2024 et ses 135
              participants ne ressemblent plus du tout à 2021 et ses 51. */}
          <View className="flex-row items-start">
            <Metric
              label={`Rang de ${CURRENT_EDITION_YEAR}`}
              value={formatRank(overview.currentRank)}
              hint={`sur ${formatCount(overview.editions.length)} éditions`}
            />
            <MetricDivider />
            <Metric
              label="€ par streamer"
              value={
                overview.current.eurPerStreamer !== null
                  ? formatEuros(overview.current.eurPerStreamer)
                  : '—'
              }
              hint={
                overview.previous?.eurPerStreamer != null
                  ? `${overview.previous.year} : ${formatEuros(overview.previous.eurPerStreamer)}`
                  : undefined
              }
            />
          </View>
        </>
      ) : null}

      <HorizontalBars bars={bars} color={COLOR_PAST} />

      {/*
        `DisclosureButton` plutôt qu'`Expandable` : le tableau se déplie sur place, dans le
        fil de la section, et dix lignes y tiennent sans jamais réclamer le plein écran.
        `Expandable` sert à agrandir ce qui manque de place — une courbe, un graphe — et il
        garde son contenu affiché en permanence, en faisant sa propre zone de tap : ici cela
        reviendrait à laisser le tableau visible tout du long, exactement ce dont on voulait
        sortir, en plus d'une cible tactile qu'aucun cadre n'annonce.
      */}
      <DisclosureButton
        expanded={detailed}
        onPress={() => setDetailed((value) => !value)}
        label="Le détail chiffré, édition par édition"
        expandedLabel="Replier le détail chiffré"
      />

      {detailed ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <EditionsTable rows={rows} />
        </Animated.View>
      ) : null}

      <View className="gap-1">
        {notes.map((note) => (
          <Text key={note} className="text-xs text-gray-500">
            {note}
          </Text>
        ))}
      </View>
    </View>
  );
}
