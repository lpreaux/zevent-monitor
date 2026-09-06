/**
 * Superposition des cagnottes de quelques streamers sur l'axe de temps écoulé de
 * l'édition — qui l'on compare, sous quelle normalisation, et dans quel cadre.
 *
 * Sorti du composant pour deux raisons. La première est l'habitude de la maison : la
 * logique se teste sans monter de rendu. La seconde est propre à cette section — la
 * comparaison ne dit la vérité que si la couleur d'une pastille, celle de sa courbe et
 * celle de sa ligne de légende sont attribuées au même endroit. Trois listes construites
 * séparément finissent toujours par se décaler d'un rang, et une comparaison qui prête la
 * mauvaise courbe au mauvais streamer est pire que pas de comparaison du tout.
 *
 * Sans React ni React Native.
 */

import type { StreamerSeriesPoint } from '@/api/donations';
import type { Streamer } from '@/api/types';
import { niceCeil } from './donations';
import { formatEuros, formatEurosCompact, formatPercent } from './format';
import { formatElapsedLabel } from './stats-edition';
import type { ElapsedPoint } from './timeseries';
import { colors } from '@/theme';

/**
 * Au-delà de trois courbes, les teintes se ressemblent et l'écheveau ne se lit plus. La
 * limite n'est donc pas un détail d'implémentation mais une règle de lecture, et
 * l'interface doit l'annoncer plutôt que la faire subir.
 */
export const MAX_COMPARED = 3;

/**
 * Les trois couleurs de comparaison, dans l'ordre d'attribution. Elles viennent des
 * jetons partagés : ce sont les mêmes teintes que les courbes d'éditions, et deux
 * nuances voisines pour un même rôle se remarqueraient d'une section à l'autre.
 */
export const COMPARE_COLORS = [colors.brand, colors.editionPast, colors.compareThird] as const;

/** Pastilles montrées avant dépliage : de quoi tenir sur deux rangées d'un téléphone. */
export const VISIBLE_CANDIDATES = 8;

export type CompareMode = 'eur' | 'progress' | 'share';

export interface CompareModeOption {
  key: CompareMode;
  label: string;
  /** Ce que le mode permet de lire, sous le titre de la section. */
  hint: string;
}

/**
 * Trois lectures d'une même superposition.
 *
 * Le montant brut est le seul mode fidèle — il répond à « qui a collecté le plus » — mais
 * il est aussi le seul à s'effondrer dès que les échelles divergent : une cagnotte à
 * 15 k€ posée à côté d'une à 800 k€ devient un trait au ras de l'axe, et la comparaison
 * ne dit plus rien de l'un des deux streamers. Il reste le mode d'ouverture parce que
 * c'est la question qu'on se pose en arrivant, mais il ne peut pas rester le seul.
 *
 * Les deux autres retirent chacun une part de l'échelle, et changent donc la question. La
 * progression retire le socle déjà acquis à l'ouverture de la fenêtre : indispensable
 * quand la collecte n'a commencé à relever un streamer qu'en cours d'édition, sa courbe
 * démarrant alors sur un piédestal qui ne doit rien à la fenêtre observée. La part retire
 * l'échelle entière et ne laisse que la forme : c'est la seule façon de mettre un gros et
 * un petit côte à côte, et de voir lequel a fait son week-end dès le vendredi.
 */
export const COMPARE_MODES: readonly CompareModeOption[] = [
  {
    key: 'eur',
    label: 'Euros',
    hint: 'Cagnottes cumulées, à la même échelle : fidèle, mais la plus grosse écrase les autres.',
  },
  {
    key: 'progress',
    label: 'Progression',
    hint: 'Chaque courbe repart de zéro à son premier relevé : ce qui a été collecté pendant la fenêtre, sans l’avance déjà acquise.',
  },
  {
    key: 'share',
    label: 'Part',
    hint: 'Chaque courbe ramenée à sa propre cagnotte, de 0 à 100 % : les échelles disparaissent, il ne reste que le moment où chacun a collecté.',
  },
];

export function compareMode(key: CompareMode): CompareModeOption {
  return COMPARE_MODES.find((option) => option.key === key) ?? COMPARE_MODES[0];
}

/** Ce que la comparaison lit d'un streamer de l'état officiel. */
export type CompareStreamer = Pick<
  Streamer,
  'twitch' | 'display' | 'profileUrl' | 'donationAmount'
>;

/** Ce qu'elle lit d'un point de courbe : ni les viewers ni l'état du direct ne servent ici. */
export type CompareSeriesPoint = Pick<StreamerSeriesPoint, 'bucket' | 'eur'>;

export interface CompareCandidate {
  /** Login Twitch en minuscules, clé de tout le reste : séries, favoris, sélection. */
  login: string;
  /** Nom affiché de l'état officiel — « AnyMe », pas « anyme ». Le login en dernier recours. */
  display: string;
  /** Photo de profil, `null` quand l'état officiel ne connaît pas ce login. */
  profileUrl: string | null;
  /** Cagnotte personnelle, 0 pour un login que l'état officiel ignore. */
  eur: number;
  selected: boolean;
  /** Couleur de sa courbe, `null` tant qu'il n'est pas coché. */
  color: string | null;
  /** Proposé par le classement plutôt que par les favoris : la pastille doit le dire. */
  fromTop: boolean;
}

function normalize(logins: readonly string[]): string[] {
  return logins.map((login) => login.toLowerCase());
}

function indexByLogin(live: readonly CompareStreamer[]): Map<string, CompareStreamer> {
  const map = new Map<string, CompareStreamer>();
  for (const streamer of live) map.set(streamer.twitch.toLowerCase(), streamer);
  return map;
}

/** Les `count` plus grosses cagnottes de l'état officiel, de la plus haute à la plus basse. */
export function topLogins(live: readonly CompareStreamer[], count = MAX_COMPARED): string[] {
  return [...live]
    .sort((a, b) => b.donationAmount.number - a.donationAmount.number)
    .slice(0, count)
    .map((streamer) => streamer.twitch.toLowerCase());
}

/**
 * Les favoris les mieux dotés, dans cet ordre.
 *
 * Pas les premiers ajoutés : l'ordre d'ajout ne veut plus rien dire quinze favoris plus
 * tard, alors que les trois plus grosses cagnottes de sa propre liste ont de bonnes
 * chances d'être le trio qu'on venait voir.
 */
export function favoriteSelection(
  live: readonly CompareStreamer[],
  favorites: readonly string[],
  count = MAX_COMPARED,
): string[] {
  const byLogin = indexByLogin(live);
  return normalize(favorites)
    .sort(
      (a, b) =>
        (byLogin.get(b)?.donationAmount.number ?? 0) - (byLogin.get(a)?.donationAmount.number ?? 0),
    )
    .slice(0, count);
}

/**
 * Sélection retenue tant que rien n'a été coché.
 *
 * Sans favoris, repli sur le classement plutôt qu'un écran vide : comparer les trois plus
 * grosses cagnottes de l'édition est même la comparaison la plus regardée du week-end.
 *
 * Cette valeur est calculée, pas implicite : l'appelant la traite comme une sélection
 * ordinaire, les pastilles concernées apparaissent donc cochées, et l'on n'a plus à
 * deviner sur quoi porte le graphe.
 */
export function defaultSelection(
  live: readonly CompareStreamer[],
  favorites: readonly string[],
): string[] {
  const mine = favoriteSelection(live, favorites);
  return mine.length > 0 ? mine : topLogins(live);
}

/**
 * Pastilles proposées : les favoris d'abord, puis ce que le classement ajoute, puis ce qui
 * est coché sans venir ni de l'un ni de l'autre.
 *
 * Le classement s'invite dans la liste des favoris plutôt que dans une rangée à part : ce
 * sont les mêmes pastilles, cochées de la même façon, et deux rangées auraient laissé
 * croire à deux comparaisons distinctes.
 */
export function buildCandidates(
  live: readonly CompareStreamer[],
  favorites: readonly string[],
  selection: readonly string[],
): CompareCandidate[] {
  const byLogin = indexByLogin(live);
  const favoriteSet = new Set(normalize(favorites));
  const picked = normalize(selection);

  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [
    ...favoriteSelection(live, favorites, favorites.length),
    ...topLogins(live),
    ...picked,
  ];
  for (const login of queue) {
    if (seen.has(login)) continue;
    seen.add(login);
    order.push(login);
  }

  return order.map((login) => {
    const streamer = byLogin.get(login);
    const rank = picked.indexOf(login);
    return {
      login,
      display: streamer?.display ?? login,
      profileUrl: streamer?.profileUrl ?? null,
      eur: streamer?.donationAmount.number ?? 0,
      selected: rank >= 0,
      color: rank >= 0 ? COMPARE_COLORS[rank % COMPARE_COLORS.length] : null,
      fromTop: !favoriteSet.has(login),
    };
  });
}

/**
 * Ce qui tient dans la rangée repliée, et ce qui attend derrière le bouton.
 *
 * Les pastilles cochées passent toujours devant la coupe : une sélection qu'on ne voit pas
 * est exactement le défaut qu'on cherche à corriger, et il serait absurde de la reléguer
 * sous un bouton « voir plus ».
 */
export function splitCandidates(
  candidates: readonly CompareCandidate[],
  expanded: boolean,
  limit = VISIBLE_CANDIDATES,
): { shown: CompareCandidate[]; hidden: number } {
  if (expanded || candidates.length <= limit) return { shown: [...candidates], hidden: 0 };

  const room = Math.max(limit - candidates.filter((candidate) => candidate.selected).length, 0);
  let taken = 0;
  const shown = candidates.filter((candidate) => {
    if (candidate.selected) return true;
    if (taken >= room) return false;
    taken += 1;
    return true;
  });

  return { shown, hidden: candidates.length - shown.length };
}

export interface SelectionChange {
  selection: string[];
  /** Login sorti pour faire de la place, `null` si personne n'a cédé la sienne. */
  evicted: string | null;
}

/**
 * Coche ou décoche un streamer, et dit qui en a fait les frais.
 *
 * Au quatrième coché, le plus anciennement sélectionné cède sa place : c'est la règle qui
 * demande le moins de gestes, puisqu'elle évite d'avoir à décocher avant de cocher. Mais
 * elle n'est acceptable qu'annoncée — d'où `evicted`, que l'appelant est tenu d'afficher.
 * Une sélection qui change toute seule et sans le dire donne l'impression que
 * l'application a mal compris le geste.
 */
export function toggleCompared(selection: readonly string[], login: string): SelectionChange {
  const key = login.toLowerCase();
  const current = normalize(selection);

  if (current.includes(key)) {
    return { selection: current.filter((entry) => entry !== key), evicted: null };
  }
  if (current.length < MAX_COMPARED) return { selection: [...current, key], evicted: null };
  return { selection: [...current.slice(1), key], evicted: current[0] };
}

/** Mêmes streamers, l'ordre en moins : c'est à ça qu'un raccourci se sait actif. */
export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(normalize(a));
  return normalize(b).every((login) => set.has(login));
}

/** Nom affiché d'un login déjà connu des pastilles, le login lui-même en repli. */
export function displayOf(candidates: readonly CompareCandidate[], login: string): string {
  const key = login.toLowerCase();
  return candidates.find((candidate) => candidate.login === key)?.display ?? key;
}

/**
 * Une courbe prête à tracer.
 *
 * Les trois premiers champs reprennent exactement le contrat de `ChartSeries`
 * (`OverlayChart`) : la forme est volontairement compatible pour que le composant passe la
 * liste telle quelle, sans la recopier à chaque rendu — un tableau reconstruit à chaque
 * passage relancerait le calcul des tracés du graphe pour rien. Le type n'est pas importé
 * pour autant : cette logique ne dépend d'aucun composant.
 */
export interface CompareCurve {
  /** Login Twitch : identifie la courbe du tracé comme de la légende. */
  id: string;
  /** Nom affiché du streamer — « AnyMe », jamais « anyme ». */
  label: string;
  color: string;
  /** Points déjà normalisés selon le mode, sur l'axe de temps écoulé de l'édition. */
  points: ElapsedPoint[];
  /** Cagnotte courante, toujours en euros : la légende ne change pas d'unité avec le mode. */
  value: string;
  /** Lecture propre au mode, `null` quand elle n'apprendrait rien. */
  detail: string | null;
}

export interface CompareChart {
  curves: CompareCurve[];
  /** Étendue de l'axe des abscisses, en minutes. */
  spanMinutes: number;
  yMax: number;
  referenceLines: { value: number; label: string }[];
  xTicks: { minutes: number; label: string }[];
  /**
   * Mise en forme des valeurs de l'axe. Elle appartient au modèle et non au rendu : c'est
   * le mode qui décide de l'unité, et une lecture au doigt qui afficherait des euros là où
   * la courbe trace des pourcentages mentirait sur ce qu'on montre du doigt.
   */
  format: (value: number) => string;
  /** Aucune courbe traçable : mieux vaut l'écrire que dessiner un cadre vide. */
  isEmpty: boolean;
}

export interface CompareChartInput {
  /** Logins cochés, dans l'ordre où ils l'ont été : c'est lui qui attribue les couleurs. */
  selection: readonly string[];
  candidates: readonly CompareCandidate[];
  /** Réponse de `useStreamerSeries`, indexée par login minuscule. */
  series: Record<string, readonly CompareSeriesPoint[]> | undefined;
  mode: CompareMode;
  /** T+0 de l'édition (ms epoch), l'origine commune à toute la page. */
  originAt: number | null;
  /** Étendue de l'axe de la page, en minutes : la comparaison ne s'étire pas au-delà. */
  maxMinutes: number;
}

/**
 * Une heure d'axe au minimum. Sans ce plancher, les premiers relevés d'une édition qui
 * vient d'ouvrir s'écraseraient sur quelques minutes de large, et la courbe partirait à la
 * verticale pour ne s'aplatir qu'heure après heure.
 */
const MIN_SPAN_MINUTES = 60;

/**
 * Un chouïa au-dessus de 100 % : l'étiquette d'un repère se pose au-dessus de son trait, et
 * celui des 100 % posé pile en haut du cadre serait rogné par le bord.
 */
const SHARE_HEADROOM = 1.04;

/** Instant où la courbe franchit la moitié de son propre total, `null` si elle ne l'atteint pas. */
function halfwayMinutes(points: readonly ElapsedPoint[], total: number): number | null {
  if (points.length < 2 || total <= 0) return null;
  return points.find((point) => point.eur >= total / 2)?.minutes ?? null;
}

/**
 * Cadre et courbes de la superposition.
 *
 * L'axe des abscisses est celui de la page entière (`originAt`, `maxMinutes`) et non celui
 * des séries reçues : c'est ce qui permet de lire cette comparaison juste sous la courbe
 * 2025 / 2026 sans changer de repères en chemin.
 */
export function buildCompareChart({
  selection,
  candidates,
  series,
  mode,
  originAt,
  maxMinutes,
}: CompareChartInput): CompareChart {
  const curves: CompareCurve[] = [];
  let peak = 0;
  let lastMinutes = MIN_SPAN_MINUTES;

  normalize(selection).forEach((login, index) => {
    const candidate = candidates.find((entry) => entry.login === login);

    const raw: ElapsedPoint[] = (series?.[login] ?? [])
      .map((point) => ({
        minutes: originAt === null ? Number.NaN : (Date.parse(point.bucket) - originAt) / 60_000,
        eur: point.eur,
      }))
      .filter((point) => Number.isFinite(point.minutes) && point.minutes >= 0)
      .sort((a, b) => a.minutes - b.minutes);

    // Le socle : ce que le streamer avait déjà collecté à l'ouverture de la fenêtre. Il
    // vaut zéro pour qui est suivi depuis le début, et bien davantage pour qui a rejoint
    // la collecte en route — c'est tout l'objet du mode « Progression ».
    const base = raw.at(0)?.eur ?? 0;
    // La cagnotte officielle prime sur le dernier point agrégé, qui peut avoir dix minutes
    // de retard ; ce dernier reste le repli quand l'état ne connaît pas ce login.
    const total = Math.max(candidate?.eur ?? 0, raw.at(-1)?.eur ?? 0);

    const points = raw.map((point) => ({
      minutes: point.minutes,
      eur:
        mode === 'eur'
          ? point.eur
          : mode === 'progress'
            ? point.eur - base
            : total > 0
              ? point.eur / total
              : 0,
    }));

    for (const point of points) {
      if (point.eur > peak) peak = point.eur;
      if (point.minutes > lastMinutes) lastMinutes = point.minutes;
    }

    const half = halfwayMinutes(raw, total);

    curves.push({
      id: login,
      label: candidate?.display ?? login,
      color: COMPARE_COLORS[index % COMPARE_COLORS.length],
      points,
      value: formatEuros(total),
      detail:
        mode === 'progress'
          ? raw.length >= 2
            ? `+${formatEuros(total - base)} sur la fenêtre`
            : null
          : mode === 'share'
            ? half === null
              ? null
              : `moitié atteinte à ${formatElapsedLabel(half)}`
            : null,
    });
  });

  // L'axe ne dépasse le dernier relevé que d'une heure, et jamais l'étendue de la page :
  // du vide à droite ferait croire à une collecte arrêtée.
  const spanMinutes = Math.max(lastMinutes, Math.min(maxMinutes, lastMinutes + 60));

  const yMax = mode === 'share' ? SHARE_HEADROOM : niceCeil(peak);
  const referenceLines =
    mode === 'share'
      ? [0.25, 0.5, 0.75, 1].map((ratio) => ({ value: ratio, label: formatPercent(ratio) }))
      : // Sans données, `niceCeil` retombe à 1 et les deux repères afficheraient « 1 € » :
        // on ne garde alors qu'un repère par libellé.
        [0.5, 1]
          .map((ratio) => ({ value: yMax * ratio, label: formatEurosCompact(yMax * ratio) }))
          .filter(
            (line, index, all) => all.findIndex((other) => other.label === line.label) === index,
          );

  const step = spanMinutes > 48 * 60 ? 12 : spanMinutes > 12 * 60 ? 6 : 2;
  const xTicks: { minutes: number; label: string }[] = [];
  // La dernière graduation s'arrête avant le bord : posée dessus, son libellé déborderait.
  for (let hour = 0; hour * 60 <= spanMinutes; hour += step) {
    xTicks.push({ minutes: hour * 60, label: `${hour} h` });
  }

  return {
    curves,
    spanMinutes,
    yMax,
    referenceLines,
    xTicks,
    format: mode === 'share' ? formatPercent : formatEuros,
    // Une courbe se trace à partir de deux points ; en deçà, le cadre resterait vide.
    isEmpty: curves.every((curve) => curve.points.length < 2),
  };
}
