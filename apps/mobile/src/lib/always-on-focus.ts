/**
 * Choix du streamer mis en avant sur l'écran secondaire, et rotation entre favoris.
 *
 * Ce qui décrit un streamer — rang, paliers, passages au planning, progression récente —
 * vit dans `streamer-profile`, où la fiche de détail le lit aussi. Ne reste ici que ce
 * qui est propre au mode Focus : dans quel ordre les favoris défilent, et lequel occupe
 * l'écran.
 *
 * Sans React ni React Native pour rester testable : l'écran AlwaysOn se contente
 * d'appeler ces fonctions avec l'état courant.
 */

import type { Streamer } from '@/api/types';

/**
 * Favoris présents dans l'état officiel, en live d'abord puis par cagnotte
 * décroissante. C'est aussi l'ordre de rotation du mode Focus : un écran secondaire
 * doit montrer en premier ceux qui diffusent réellement.
 */
export function orderFavorites(live: Streamer[], favorites: string[]): Streamer[] {
  const wanted = new Set(favorites.map((f) => f.toLowerCase()));
  return live
    .filter((s) => wanted.has(s.twitch.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) || b.donationAmount.number - a.donationAmount.number,
    );
}

/**
 * Streamer à afficher en Focus : celui épinglé s'il est toujours dans la liste,
 * sinon le premier de l'ordre de rotation (donc un live si tant est qu'il y en ait un).
 */
export function resolveFocus(order: Streamer[], focusTwitch: string | null): Streamer | undefined {
  if (order.length === 0) return undefined;
  if (focusTwitch) {
    const login = focusTwitch.toLowerCase();
    const pinned = order.find((s) => s.twitch.toLowerCase() === login);
    if (pinned) return pinned;
  }
  return order[0];
}

/** Login du favori suivant (`direction = 1`) ou précédent, avec bouclage. */
export function stepFocus(
  order: Streamer[],
  currentTwitch: string | null,
  direction: 1 | -1,
): string | null {
  if (order.length === 0) return null;
  const login = (currentTwitch ?? '').toLowerCase();
  const index = order.findIndex((s) => s.twitch.toLowerCase() === login);
  const from = index >= 0 ? index : 0;
  const next = (from + direction + order.length) % order.length;
  return order[next].twitch.toLowerCase();
}
