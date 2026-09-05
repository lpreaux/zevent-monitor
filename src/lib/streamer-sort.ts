/**
 * Recherche, tri et groupement de la liste des streamers.
 *
 * Le principe vient de la page « Mes favoris » : seuls les streamers en direct se
 * comparent sur autre chose que leur cagnotte. Ranger par audience quelqu'un qui a
 * éteint reviendrait à le classer sur une valeur qui vaut zéro pour tous les éteints,
 * c'est-à-dire à ne pas le classer du tout. Les deux groupes sont donc rendus
 * séparément, et le tri choisi ne s'applique qu'au premier.
 *
 * Conséquence : « en live » n'est plus un tri. Les directs passent devant par
 * construction, il n'y a plus de choix à offrir pour ça.
 *
 * Aucun import React ni React Native : tout est testable.
 */

import type { Streamer } from '@/api/types';

export type StreamerSort = 'donation' | 'viewers' | 'momentum';

export const STREAMER_SORTS: { key: StreamerSort; label: string }[] = [
  { key: 'donation', label: 'Cagnotte' },
  { key: 'viewers', label: 'Viewers' },
  { key: 'momentum', label: 'En forme' },
];

/** Chaque tri annonce sur quoi il classe : sans quoi trois rangs identiques semblent arbitraires. */
export const STREAMER_SORT_HINTS: Record<StreamerSort, string> = {
  donation: 'Classés par cagnotte personnelle.',
  viewers: 'Classés par audience Twitch du moment.',
  momentum: 'Classés par progression de la cagnotte sur la fenêtre observée.',
};

/** Progression récente par login (centimes), telle que le backend la publie. */
export type MomentumIndex = ReadonlyMap<string, number>;

export function compareByDonation(a: Streamer, b: Streamer): number {
  return (
    b.donationAmount.number - a.donationAmount.number ||
    a.display.localeCompare(b.display, 'fr')
  );
}

/**
 * Comparateur appliqué aux seuls directs. La cagnotte sert partout de départage : deux
 * streamers à égalité d'audience restent ordonnés sur quelque chose de stable.
 */
export function compareLive(
  sort: StreamerSort,
  momentum?: MomentumIndex,
): (a: Streamer, b: Streamer) => number {
  switch (sort) {
    case 'viewers':
      return (a, b) =>
        b.viewersAmount.number - a.viewersAmount.number || compareByDonation(a, b);
    case 'momentum':
      return (a, b) => delta(b, momentum) - delta(a, momentum) || compareByDonation(a, b);
    case 'donation':
    default:
      return compareByDonation;
  }
}

function delta(streamer: Streamer, momentum?: MomentumIndex): number {
  return momentum?.get(streamer.twitch.toLowerCase()) ?? 0;
}

/**
 * Saisie normalisée une fois pour toute la liste : chaîne vide quand il n'y a rien à
 * chercher. À passer telle quelle à `matchesStreamer`, qui n'attend que du minuscule.
 */
export function searchNeedle(search: string): string {
  return search.trim().toLowerCase();
}

/**
 * Le streamer répond-il à la recherche ? Sur le nom affiché comme sur le login, casse
 * ignorée. Exposé à part de `searchStreamers` pour les listes qui portent autre chose
 * que des streamers nus — les favoris, qui trimballent leur score de pertinence.
 */
export function matchesStreamer(streamer: Streamer, needle: string): boolean {
  if (!needle) return true;
  return (
    streamer.display.toLowerCase().includes(needle) ||
    streamer.twitch.toLowerCase().includes(needle)
  );
}

/** Filtre sur le nom affiché ou le login Twitch. Chaîne vide : la liste passe telle quelle. */
export function searchStreamers(streamers: Streamer[], search: string): Streamer[] {
  const needle = searchNeedle(search);
  if (!needle) return streamers;
  return streamers.filter((streamer) => matchesStreamer(streamer, needle));
}

/**
 * Groupes de la liste, dans l'ordre d'affichage. Les libellés restent à l'écran qui les
 * rend : le module décide de la structure, pas des mots.
 *
 * - `live` : les directs, triés selon le choix de l'utilisateur.
 * - `ranked` / `rest` : le tri « en forme » scindé, voir plus bas.
 * - `offline` : les éteints, toujours par cagnotte.
 */
export type StreamerGroupKey = 'live' | 'ranked' | 'rest' | 'offline';

export interface StreamerGroup {
  key: StreamerGroupKey;
  data: Streamer[];
}

/**
 * Répartit les streamers en groupes prêts à afficher. Les groupes vides sont omis.
 *
 * Le tri « en forme » a droit à un traitement particulier : le backend ne publie qu'un
 * classement tronqué (les cinquante premiers), tout le reste ayant une progression
 * inconnue — pas nulle. Les mélanger ferait passer pour un classement une liste qui
 * retombe silencieusement sur la cagnotte au-delà du dernier rang connu. On coupe donc
 * là où la donnée s'arrête, et l'écran nomme les deux moitiés.
 */
export function groupStreamers(
  streamers: Streamer[],
  sort: StreamerSort,
  momentum?: MomentumIndex,
): StreamerGroup[] {
  const live: Streamer[] = [];
  const offline: Streamer[] = [];
  for (const streamer of streamers) (streamer.online ? live : offline).push(streamer);
  offline.sort(compareByDonation);

  if (sort !== 'momentum') {
    live.sort(compareLive(sort));
    return compact([
      { key: 'live', data: live },
      { key: 'offline', data: offline },
    ]);
  }

  const ranked = live.filter((streamer) => delta(streamer, momentum) > 0);
  const rest = live.filter((streamer) => delta(streamer, momentum) <= 0);
  ranked.sort(compareLive('momentum', momentum));
  rest.sort(compareByDonation);

  return compact([
    { key: 'ranked', data: ranked },
    { key: 'rest', data: rest },
    { key: 'offline', data: offline },
  ]);
}

function compact(groups: StreamerGroup[]): StreamerGroup[] {
  return groups.filter((group) => group.data.length > 0);
}
