import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { formatCount } from '@/lib/format';
import { FAVORITES_MOMENTUM_WINDOW_MINUTES, useRankedFavorites } from '@/lib/use-ranked-favorites';
import { FavoriteHighlightCard } from './favorite-highlight-card';
import { LiveStreamerRow } from './live-streamer-row';
import { RowSeparator } from './row-separator';
import { SectionHeader } from './section-header';
import { SectionLink } from './section-link';

/** Lignes montrées sous la carte mise en avant : au-delà, l'accueil cesse d'être un résumé. */
const HOME_LIVE_ROWS = 3;

/** Bandeau d'appel quand aucun favori n'est encore enregistré. */
function NoFavorites() {
  const router = useRouter();
  return (
    <View className="items-start gap-3 rounded-3xl border border-white/10 bg-surface-raised px-4 py-5">
      <Text className="text-sm text-gray-400">
        Suivez vos streamers : leur cagnotte, ce qu’ils jouent et leurs shows remontent ici,
        les plus actifs en premier.
      </Text>
      <Pressable
        onPress={() => router.push('/streamers')}
        accessibilityRole="button"
        className="flex-row items-center gap-1.5 rounded-full bg-zevent-500 px-4 py-2 active:opacity-80"
      >
        <Ionicons name="add" size={15} color="#ffffff" />
        <Text className="text-xs font-bold text-white">Choisir mes favoris</Text>
      </Pressable>
    </View>
  );
}

/**
 * Bloc « Mes favoris » de l'accueil : un extrait classé par pertinence (direct,
 * progression récente, show en cours et habitudes de l'utilisateur), la liste complète
 * restant à un tap.
 *
 * Rien que des directs : puisque l'extrait ne montre déjà pas tous les favoris en ligne,
 * descendre jusqu'aux hors ligne reviendrait à faire de la place à ceux dont il n'y a
 * précisément rien à dire. Ils attendent sur la page « Mes favoris ».
 */
export function FavoritesSection() {
  const router = useRouter();
  const { live, known, saved, shows } = useRankedFavorites();

  const [highlight, ...rest] = live;
  const liveRows = rest.slice(0, HOME_LIVE_ROWS);
  const shown = (highlight ? 1 : 0) + liveRows.length;
  // Les hors ligne comptent parmi les « autres » : c'est bien ce que la page complète montre.
  const hidden = known - shown;

  return (
    <View className="gap-3">
      <SectionHeader
        title="Mes favoris"
        hint={known > 0 ? 'Les plus actifs en premier' : undefined}
        accessory={
          known > 0 ? (
            <Text className="text-xs text-gray-500">
              {formatCount(live.length)} en live sur {formatCount(known)}
            </Text>
          ) : null
        }
      />

      {saved === 0 ? (
        <NoFavorites />
      ) : known === 0 ? (
        <Text className="text-sm text-gray-500">
          Vos favoris ne figurent pas dans la liste officielle actuelle.
        </Text>
      ) : (
        <Animated.View layout={LinearTransition.duration(220)} className="gap-3">
          {highlight ? (
            <FavoriteHighlightCard
              item={highlight}
              show={shows.get(highlight.streamer.twitch.toLowerCase())}
              windowMinutes={FAVORITES_MOMENTUM_WINDOW_MINUTES}
            />
          ) : (
            <Text className="text-sm text-gray-500">Aucun favori en live pour le moment.</Text>
          )}

          {liveRows.length > 0 ? (
            <View className="px-1">
              {liveRows.map((item, index) => (
                <Fragment key={item.streamer.twitch_id}>
                  {index > 0 ? <RowSeparator inset={50} /> : null}
                  <LiveStreamerRow
                    streamer={item.streamer}
                    deltaCents={item.deltaCents}
                    show={shows.get(item.streamer.twitch.toLowerCase())}
                  />
                </Fragment>
              ))}
            </View>
          ) : null}

          <SectionLink
            // « Autres » suppose qu'on en a montré : quand aucun favori n'est en live, le
            // lien ouvre simplement la liste.
            label={
              shown > 0 && hidden > 0
                ? `Voir les ${formatCount(hidden)} autres favoris`
                : 'Ouvrir mes favoris'
            }
            accessibilityLabel="Ouvrir la liste de mes favoris"
            onPress={() => router.push('/favorites')}
          />
        </Animated.View>
      )}
    </View>
  );
}
