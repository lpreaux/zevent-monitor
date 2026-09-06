/**
 * Les dix éditions du ZEvent mises côte à côte : le contenu figé de l'application et
 * l'édition en cours, réunis dans un même classement.
 *
 * Tout est calculé ici, sans React, pour une raison simple : les totaux passés sont
 * embarqués dans le binaire et n'ont besoin de personne pour s'afficher. Le backend ne
 * fournit qu'une ligne sur dix — celle de 2026 —, et le reste doit rester lisible qu'il
 * réponde ou non. Faire dépendre le classement d'une requête aurait transformé une panne
 * réseau en section vide, alors qu'il n'y a rien à charger pour montrer 2016.
 */

import editionsContent from '@/content/editions.json';

/** L'édition que l'application suit en direct. */
export const CURRENT_EDITION_YEAR = 2026;

interface RawEdition {
  year: number;
  label: string | null;
  dates: string;
  totalEur: number;
  streamers: number;
  totalSource?: string;
  altTotalEur?: number;
  altTotalSource?: string;
}

export interface Edition {
  year: number;
  /** Nom que l'édition s'était donné, quand elle en avait un (« Projet Avengers »). */
  label: string | null;
  /** Dates telles qu'écrites dans le contenu figé ; `null` pour l'édition en cours. */
  dates: string | null;
  /** Total retenu, en euros. Provisoire tant que `live` vaut vrai. */
  totalEur: number;
  streamers: number;
  /** Qui compte le total retenu, quand deux décomptes coexistent. */
  totalSource: string | null;
  /** Second décompte du même week-end, quand une autre source en publie un. */
  altTotalEur: number | null;
  altTotalSource: string | null;
  /** L'édition en cours : son total bougera encore. */
  live: boolean;
  /** Euros levés par streamer inscrit ; `null` tant qu'on ne connaît pas les inscrits. */
  eurPerStreamer: number | null;
}

/** Ce que le direct sait de l'édition en cours au moment du rendu. */
export interface CurrentEdition {
  /** Cagnotte provisoire, en euros. */
  totalEur: number;
  /** Streamers inscrits ; 0 tant que le backend n'a pas rendu la liste. */
  streamers: number;
}

export interface EditionsOverview {
  /** Les éditions dans l'ordre d'affichage, édition en cours comprise si elle a démarré. */
  editions: Edition[];
  /** Les mêmes, classées du plus gros total au plus petit. */
  ranked: Edition[];
  /** L'édition en cours, ou `null` tant qu'elle n'a pas collecté un euro. */
  current: Edition | null;
  /** L'édition close la plus récente, référence naturelle de l'édition en cours. */
  previous: Edition | null;
  /** Rang de l'édition en cours, 1 étant la plus généreuse ; `null` sans édition en cours. */
  currentRank: number | null;
  /** L'édition immédiatement au-dessus au classement ; `null` quand 2026 est en tête. */
  target: Edition | null;
  /** Euros manquants pour passer devant `target`, toujours strictement positifs. */
  gapEur: number | null;
  /** L'édition reléguée juste derrière, quand 2026 est en tête. */
  runnerUp: Edition | null;
  /** Avance de 2026 sur `runnerUp` ; `null` quand 2026 n'est pas en tête. */
  leadEur: number | null;
  /** Années sans ZEvent dans l'intervalle couvert : le trou de 2023 se dit, il ne se devine pas. */
  missingYears: number[];
  /** Éditions dont le total dépend de la source consultée. */
  disputed: Edition[];
}

function toEdition(raw: RawEdition): Edition {
  return {
    year: raw.year,
    label: raw.label,
    dates: raw.dates,
    totalEur: raw.totalEur,
    streamers: raw.streamers,
    totalSource: raw.totalSource ?? null,
    altTotalEur: raw.altTotalEur ?? null,
    altTotalSource: raw.altTotalSource ?? null,
    live: false,
    eurPerStreamer: raw.streamers > 0 ? raw.totalEur / raw.streamers : null,
  };
}

/**
 * Ordre d'affichage : du plus récent au plus ancien, et non du plus gros au plus petit.
 *
 * Un classement par montant dessinerait une pyramide parfaite, donc muette : elle
 * effacerait la seule chose que ces barres racontent, la marche d'escalier de 2019, le
 * palier où 2021, 2022 et 2024 se tiennent à cent mille euros près, puis le bond de 2025.
 * Cette silhouette n'existe que si les années restent dans leur ordre. Le classement, lui,
 * n'a pas besoin d'un tri pour se lire : il tient dans le rang et dans l'écart annoncés
 * au-dessus des barres.
 *
 * Le fichier tient en neuf lignes, on le lit au chargement du module — contrairement à la
 * courbe 2025 et à ses milliers de points, que `loadHistory2025` prend soin de paresser.
 */
const PAST_EDITIONS: Edition[] = (editionsContent.editions as RawEdition[])
  .map(toEdition)
  .sort((a, b) => b.year - a.year);

/**
 * Le trou de 2023 se calcule sur les seules éditions closes : cette phrase de bas de
 * section ne doit pas changer selon que le backend a répondu ou non.
 */
const MISSING_YEARS: number[] = (() => {
  const years = PAST_EDITIONS.map((edition) => edition.year);
  const oldest = Math.min(...years);
  const newest = Math.max(...years);
  const missing: number[] = [];
  for (let year = oldest; year <= newest; year += 1) {
    if (!years.includes(year)) missing.push(year);
  }
  return missing;
})();

const DISPUTED: Edition[] = PAST_EDITIONS.filter((edition) => edition.altTotalEur !== null);

function toCurrentEdition({ totalEur, streamers }: CurrentEdition): Edition {
  return {
    year: CURRENT_EDITION_YEAR,
    label: null,
    // Le contenu figé ne décrit que des éditions closes : les dates de celle qui se déroule
    // ne sont écrites nulle part, et les déduire du planning reviendrait à les inventer.
    // La section dira « en cours », ce qui est vrai et suffit à situer la ligne.
    dates: null,
    totalEur,
    streamers,
    totalSource: null,
    altTotalEur: null,
    altTotalSource: null,
    live: true,
    eurPerStreamer: streamers > 0 ? totalEur / streamers : null,
  };
}

/**
 * Le classement des éditions, tel que la section l'affiche.
 *
 * `current` vaut `null` quand le direct n'a rien à dire — backend injoignable, ou édition
 * qui n'a pas encore ouvert sa cagnotte. Une cagnotte à zéro est traitée exactement comme
 * une absence : une barre plate à 0 € en tête du graphe donnerait à croire que la collecte
 * a échoué, alors qu'elle n'a simplement pas commencé. Les neuf éditions passées, elles,
 * s'affichent dans tous les cas — il n'y a aucune raison de les priver d'écran parce que
 * le réseau manque.
 */
export function buildEditionsOverview(current: CurrentEdition | null): EditionsOverview {
  const live =
    current && Number.isFinite(current.totalEur) && current.totalEur > 0
      ? toCurrentEdition(current)
      : null;

  const editions = live ? [live, ...PAST_EDITIONS] : PAST_EDITIONS;

  // À total égal — coïncidence à l'euro près, mais elle déciderait d'un rang — c'est la
  // plus récente qui passe devant : elle vient d'égaler l'autre, c'est elle l'événement.
  const ranked = [...editions].sort((a, b) => b.totalEur - a.totalEur || b.year - a.year);

  const index = live ? ranked.indexOf(live) : -1;
  const target = index > 0 ? (ranked[index - 1] ?? null) : null;
  const runnerUp = index === 0 ? (ranked[1] ?? null) : null;

  return {
    editions,
    ranked,
    current: live,
    previous: PAST_EDITIONS[0] ?? null,
    currentRank: index >= 0 ? index + 1 : null,
    target,
    gapEur: live && target ? target.totalEur - live.totalEur : null,
    runnerUp,
    leadEur: live && runnerUp ? live.totalEur - runnerUp.totalEur : null,
    missingYears: MISSING_YEARS,
    disputed: DISPUTED,
  };
}
