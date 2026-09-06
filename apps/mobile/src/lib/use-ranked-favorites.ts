import { useMemo } from 'react';

import { useMomentum, useZeventState } from '@/api/queries';
import type { PlanningEntry, Streamer } from '@/api/types';
import { rankFavorites, type ScoredFavorite } from '@/lib/favorite-relevance';
import { useLiveShows } from '@/lib/use-live-shows';
import { useNow } from '@/lib/use-now';
import { useFavoritesStore } from '@/store/favorites';
import { useStreamerAffinityStore } from '@/store/streamer-affinity';

/** Fenêtre courte : « actif maintenant » se juge sur les dix dernières minutes. */
export const FAVORITES_MOMENTUM_WINDOW_MINUTES = 10;

/**
 * Le backend plafonne la taille du classement de progression. On demande le maximum :
 * la même requête sert au bloc « Top du moment », qui n'en affiche qu'une poignée.
 */
export const MOMENTUM_LIMIT = 50;

export interface RankedFavorites {
  /** Favoris en direct, du plus pertinent au moins pertinent. */
  live: ScoredFavorite[];
  /** Favoris hors ligne, par cagnotte décroissante : sans direct, le classement n'a plus de sens. */
  offline: Streamer[];
  /** Favoris retrouvés dans la liste officielle (live + hors ligne). */
  known: number;
  /** Favoris enregistrés sur l'appareil, y compris ceux absents de la liste officielle. */
  saved: number;
  /** Shows du planning en cours, par login : sert à décrire l'activité de chacun. */
  shows: Map<string, PlanningEntry>;
  /** `true` tant que l'état officiel n'est pas arrivé. */
  pending: boolean;
}

/**
 * Favoris prêts à afficher : scindés live / hors ligne et ordonnés par pertinence.
 * Partagé par l'accueil (qui n'en montre qu'un extrait) et la page « Mes favoris ».
 */
export function useRankedFavorites(): RankedFavorites {
  const { data } = useZeventState();
  const favorites = useFavoritesStore((s) => s.favorites);
  const affinities = useStreamerAffinityStore((s) => s.entries);
  const momentum = useMomentum(FAVORITES_MOMENTUM_WINDOW_MINUTES, MOMENTUM_LIMIT);
  const shows = useLiveShows();
  // Une minute suffit : c'est le pas de l'amortissement d'affinité.
  const now = useNow(60_000);

  const deltas = useMemo(
    () =>
      new Map(
        (momentum.data?.streamers ?? []).map((item) => [item.twitch.toLowerCase(), item.deltaCents]),
      ),
    [momentum.data],
  );

  return useMemo(() => {
    const wanted = new Set(favorites);
    const mine = (data?.data.live ?? []).filter((s) => wanted.has(s.twitch.toLowerCase()));
    const online = mine.filter((s) => s.online);

    return {
      live: rankFavorites(
        online.map((streamer) => {
          const login = streamer.twitch.toLowerCase();
          return {
            streamer,
            deltaCents: deltas.get(login) ?? 0,
            affinity: affinities[login],
            planningLive: shows.has(login),
          };
        }),
        now,
      ),
      offline: mine
        .filter((s) => !s.online)
        .sort((a, b) => b.donationAmount.number - a.donationAmount.number),
      known: mine.length,
      saved: favorites.length,
      shows,
      pending: !data,
    };
  }, [data, favorites, affinities, deltas, shows, now]);
}
