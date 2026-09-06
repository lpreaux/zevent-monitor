import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useStreamerSeries, useZeventState } from '@/api/queries';
import { DisclosureButton } from '@/components/disclosure-button';
import { Expandable } from '@/components/expandable';
import { OverlayChart, SCRUB_CAPTION_HEIGHT } from '@/components/overlay-chart';
import { SectionHeader } from '@/components/section-header';
import { Segmented } from '@/components/segmented';
import { StreamerAvatar } from '@/components/streamer-avatar';
import { ToggleChip } from '@/components/toggle-chip';
import {
  buildCandidates,
  buildCompareChart,
  compareMode,
  COMPARE_MODES,
  defaultSelection,
  displayOf,
  favoriteSelection,
  MAX_COMPARED,
  sameSelection,
  splitCandidates,
  toggleCompared,
  topLogins,
  type CompareCandidate,
  type CompareCurve,
  type CompareMode,
} from '@/lib/compare-series';
import { formatEurosCompact } from '@/lib/format';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { useFavoritesStore } from '@/store/favorites';

/**
 * Pastille de sélection : photo, nom affiché, et la couleur de sa courbe une fois cochée.
 *
 * Le login brut ne paraît jamais tant que l'état officiel connaît le streamer — « anyme »
 * est une clé de base de données, « AnyMe » est le nom sous lequel on le suit. La photo
 * fait le reste du travail : dans une rangée de huit pastilles, on reconnaît un visage
 * bien avant d'avoir lu son nom.
 *
 * Le point de couleur double la marque de sélection parce qu'il dit quelque chose que le
 * cadre violet ne dit pas : quelle courbe du graphe est la sienne.
 */
function CandidateChip({
  candidate,
  onPress,
}: {
  candidate: CompareCandidate;
  onPress: () => void;
}) {
  const amount = candidate.eur > 0 ? `, ${formatEurosCompact(candidate.eur)}` : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: candidate.selected }}
      accessibilityLabel={`${candidate.display}${amount}${candidate.fromTop ? ', hors favoris' : ''}`}
      className={`flex-row items-center gap-2 rounded-full border py-1 pr-3 active:opacity-70 ${
        candidate.profileUrl ? 'pl-1' : 'pl-3'
      } ${candidate.selected ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900'}`}
    >
      {candidate.profileUrl ? (
        <StreamerAvatar uri={candidate.profileUrl} size={22} dim={!candidate.selected} />
      ) : null}

      {candidate.color ? (
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: candidate.color }}
        />
      ) : null}

      <Text
        numberOfLines={1}
        className={`text-xs font-semibold ${
          candidate.selected ? 'text-zevent-200' : 'text-gray-400'
        }`}
      >
        {candidate.display}
      </Text>

      {/* Ce streamer n'est pas dans les favoris : le classement l'a invité, autant le dire. */}
      {candidate.fromTop ? (
        <Ionicons name="trophy" size={10} color={candidate.selected ? '#c4b5fd' : '#6b7280'} />
      ) : null}
    </Pressable>
  );
}

/** Une courbe en une ligne : sa couleur, son nom, sa cagnotte, et ce que le mode y ajoute. */
function LegendRow({ curve }: { curve: CompareCurve }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="shrink flex-row items-center gap-2">
        <View
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: curve.color }}
        />
        <Text numberOfLines={1} className="shrink text-sm text-gray-300">
          {curve.label}
        </Text>
      </View>
      <View className="items-end">
        {/* Toujours en euros, quel que soit le mode : c'est la valeur qu'on retient, et la
            voir changer d'unité avec le cadrage du graphe ferait douter du chiffre. */}
        <Text className="text-sm font-semibold text-white">{curve.value}</Text>
        {curve.detail ? (
          <Text className="text-[11px] text-gray-500">{curve.detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Section « Comparer » de l'écran des statistiques : deux ou trois cagnottes superposées
 * sur l'axe de temps écoulé de l'édition.
 *
 * Elle ne compare plus seulement des favoris. Une comparaison enfermée dans sa propre
 * liste ne sert qu'à ceux qui en ont une, et ne répond jamais à la question la plus
 * courante du week-end — qui est en tête, et de combien. Le raccourci « Top 3 » la pose
 * en un geste, et c'est aussi ce qui s'ouvre par défaut quand aucun favori n'est
 * enregistré : la section a quelque chose à montrer dès le premier lancement.
 *
 * Autonome, comme les autres sections de la page : elle lit `useEditionComparison()` pour
 * son compte, React Query rendant la même réponse à toutes.
 */
export function StatsStreamerCompare() {
  const { comparison } = useEditionComparison();
  const stateQuery = useZeventState();
  const favorites = useFavoritesStore((state) => state.favorites);
  const hydrated = useFavoritesStore((state) => state.hydrated);

  const [mode, setMode] = useState<CompareMode>('eur');
  /** `null` tant que la sélection de départ n'a pas été posée ; une liste ensuite, fût-elle vide. */
  const [picked, setPicked] = useState<string[] | null>(null);
  /** Dernier remplacement à annoncer, effacé dès que la sélection change autrement. */
  const [replaced, setReplaced] = useState<{ added: string; removed: string } | null>(null);
  const [openAll, setOpenAll] = useState(false);

  const live = useMemo(() => stateQuery.data?.data.live ?? [], [stateQuery.data]);

  /**
   * Sélection de départ : les favoris les mieux dotés, ou le Top 3 à défaut de favori.
   *
   * Elle est traitée comme n'importe quelle sélection plutôt que comme une règle tacite
   * appliquée au moment de tracer : les pastilles concernées apparaissent cochées et le
   * raccourci correspondant s'allume, si bien qu'on lit dans l'interface ce sur quoi porte
   * le graphe. Elle suit les données tant que rien n'a été coché, ce qui est cohérent avec
   * le raccourci qu'elle allume — « Top 3 » désigne les trois plus grosses cagnottes de
   * l'instant, pas celles du chargement de l'écran. Le premier geste sur une pastille la
   * fige, `picked` prenant alors la main.
   *
   * On attend l'hydratation des favoris avant de proposer quoi que ce soit : un état
   * officiel arrivé avant eux ferait tracer le Top 3 pour le remplacer aussitôt, soit deux
   * requêtes de séries et un clignotement pour rien.
   */
  const fallback = useMemo(
    () => (hydrated ? defaultSelection(live, favorites) : []),
    [hydrated, live, favorites],
  );
  const selection = useMemo(() => picked ?? fallback, [picked, fallback]);

  const presets = useMemo(
    () => ({ mine: favoriteSelection(live, favorites), top: topLogins(live) }),
    [live, favorites],
  );
  const candidates = useMemo(
    () => buildCandidates(live, favorites, selection),
    [live, favorites, selection],
  );

  const seriesQuery = useStreamerSeries(selection);

  const chart = useMemo(
    () =>
      buildCompareChart({
        selection,
        candidates,
        series: seriesQuery.data?.streamers,
        mode,
        originAt: comparison.originAt2026,
        maxMinutes: comparison.maxMinutes,
      }),
    [selection, candidates, seriesQuery.data, mode, comparison.originAt2026, comparison.maxMinutes],
  );

  const { shown, hidden } = splitCandidates(candidates, openAll);

  const pick = (candidate: CompareCandidate) => {
    const next = toggleCompared(selection, candidate.login);
    setPicked(next.selection);
    setReplaced(
      next.evicted
        ? { added: candidate.display, removed: displayOf(candidates, next.evicted) }
        : null,
    );
  };

  const applyPreset = (logins: string[]) => {
    setPicked(logins);
    setReplaced(null);
  };

  /**
   * Sans état officiel et sans favori, la section n'a même pas de quoi proposer une
   * sélection : c'est le backend qu'il faut annoncer, pas un chargement sans fin.
   */
  const unreachable =
    (seriesQuery.isError && !seriesQuery.data) ||
    (selection.length === 0 && stateQuery.isError && !stateQuery.data);

  const limit = replaced
    ? `${replaced.added} a pris la place de ${replaced.removed} : ${MAX_COMPARED} streamers au maximum.`
    : selection.length === 0
      ? `Cochez jusqu’à ${MAX_COMPARED} streamers à superposer.`
      : `${selection.length} streamer${selection.length > 1 ? 's comparés' : ' comparé'} sur ${MAX_COMPARED} — au-delà, le plus anciennement coché cède sa place.`;

  const draw = (height: number) => (
    <OverlayChart
      series={chart.curves}
      maxMinutes={chart.spanMinutes}
      yMax={chart.yMax}
      referenceLines={chart.referenceLines}
      xTicks={chart.xTicks}
      height={height}
      // L'axe des abscisses est bien celui du temps écoulé : le `formatX` par défaut convient.
      scrub={{ formatValue: chart.format }}
    />
  );

  return (
    <View className="gap-3">
      <SectionHeader
        title="Comparer"
        hint={compareMode(mode).hint}
        accessory={<Segmented compact options={COMPARE_MODES} value={mode} onChange={setMode} />}
      />

      {presets.mine.length > 0 || presets.top.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {presets.mine.length > 0 ? (
            <ToggleChip
              label="Mes favoris"
              icon="star"
              active={sameSelection(selection, presets.mine)}
              onPress={() => applyPreset(presets.mine)}
              accessibilityLabel="Comparer mes favoris les mieux dotés"
            />
          ) : null}
          {presets.top.length > 0 ? (
            <ToggleChip
              label={`Top ${MAX_COMPARED}`}
              icon="trophy"
              active={sameSelection(selection, presets.top)}
              onPress={() => applyPreset(presets.top)}
              accessibilityLabel="Comparer les trois plus grosses cagnottes de l’édition"
            />
          ) : null}
        </View>
      ) : null}

      {/* Après hydratation seulement : une liste vide, avant, ne veut encore rien dire. */}
      {hydrated && favorites.length === 0 ? (
        <Text className="text-[11px] text-gray-500">
          Aucun favori enregistré : la comparaison s’ouvre sur les plus grosses cagnottes. Ajoutez
          des favoris depuis l’onglet Streamers pour les retrouver ici.
        </Text>
      ) : null}

      {/* La règle et son application partagent la même ligne : l'annonce d'un remplacement
          prend la place de la consigne au lieu de s'ajouter dessous, et la rangée de
          pastilles ne se déplace pas sous le doigt qui vient d'en cocher une. */}
      <Text className={`text-[11px] ${replaced ? 'text-zevent-200' : 'text-gray-500'}`}>{limit}</Text>

      <View className="flex-row flex-wrap gap-2">
        {shown.map((candidate) => (
          <CandidateChip
            key={candidate.login}
            candidate={candidate}
            onPress={() => pick(candidate)}
          />
        ))}
      </View>

      {hidden > 0 || openAll ? (
        <DisclosureButton
          expanded={openAll}
          onPress={() => setOpenAll((current) => !current)}
          label={`Voir ${hidden} streamer${hidden > 1 ? 's' : ''} de plus`}
          expandedLabel="Réduire la liste"
        />
      ) : null}

      {unreachable ? (
        <Text className="text-xs text-amber-200">Courbes indisponibles : backend injoignable.</Text>
      ) : chart.isEmpty ? (
        <Text className="text-xs text-gray-500">
          {selection.length === 0
            ? // Rien de coché et rien décoché non plus : la sélection par défaut n'a pas
              // encore de quoi se décider.
              picked === null
              ? 'Chargement des courbes…'
              : 'Cochez un streamer pour superposer sa cagnotte.'
            : seriesQuery.isLoading
              ? 'Chargement des courbes…'
              : 'Pas encore assez de relevés pour ces streamers : la collecte les trace dès qu’elle en a deux.'}
        </Text>
      ) : (
        <>
          <Expandable
            title="Cagnottes comparées"
            expanded={draw(320)}
            handleTop={SCRUB_CAPTION_HEIGHT + 8}
          >
            {draw(180)}
          </Expandable>

          <View className="gap-1.5 rounded-2xl border border-white/10 bg-surface-raised p-3">
            {chart.curves.map((curve) => (
              <LegendRow key={curve.id} curve={curve} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}
