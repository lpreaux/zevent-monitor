import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { useMomentum } from '@/api/queries';
import { formatRelativeTime } from '@/lib/format';
import { useLiveShows } from '@/lib/use-live-shows';
import { MOMENTUM_LIMIT } from '@/lib/use-ranked-favorites';
import { useNow } from '@/lib/use-now';
import { useFavoritesStore } from '@/store/favorites';
import { MomentumRow } from './momentum-row';
import { RowSeparator } from './row-separator';
import { SectionHeader } from './section-header';
import { SectionLink } from './section-link';
import { Segmented } from './segmented';

type MomentumWindow = '10' | '60';

const WINDOWS: { key: MomentumWindow; label: string }[] = [
  { key: '10', label: '10 min' },
  { key: '60', label: '1 h' },
];

/** Places du podium affichées ici : le classement complet est demandé une seule fois pour toute l'app. */
const MOMENTUM_VISIBLE = 5;

/** Le libellé de fraîcheur doit vieillir tout seul entre deux relevés. */
const CLOCK_MS = 15_000;

/** Durée du glissement quand deux streamers échangent leurs places. */
const REORDER_MS = 320;

/**
 * « Top du moment » : ce qui progresse le plus fort ailleurs que chez vos favoris.
 *
 * Les favoris en sont retirés, et le sous-titre le dit — sans quoi la règle serait
 * invisible, donc suspecte. C'est ce qui rend les deux sections de l'accueil étanches :
 * au-dessus les gens que vous avez choisis, ici ceux que vous ne suivez pas encore. Un
 * favori qui s'envole est déjà mis en avant plus haut, avec le même montant.
 *
 * Le reste tient en une liste de lignes, sans encadré : chaque montant est doublé d'une
 * jauge à l'échelle du premier, et les places s'échangent en glissant plutôt qu'en
 * sautant, pour qu'un classement qui bouge tout seul reste lisible.
 */
export function MomentumSection() {
  const router = useRouter();
  const [window, setWindow] = useState<MomentumWindow>('10');
  // Même requête que le classement de pertinence des favoris : une seule fenêtre partagée.
  const query = useMomentum(Number(window), MOMENTUM_LIMIT);
  const favorites = useFavoritesStore((s) => s.favorites);
  const shows = useLiveShows();
  const now = useNow(CLOCK_MS);

  const all = query.data?.streamers;
  const items = useMemo(() => {
    const mine = new Set(favorites);
    return (all ?? [])
      .filter((item) => !mine.has(item.twitch.toLowerCase()))
      .slice(0, MOMENTUM_VISIBLE);
  }, [all, favorites]);

  // Échelle des jauges : la tête de ce qui est montré vaut la barre pleine.
  const top = items.length > 0 ? Math.max(...items.map((item) => item.deltaCents)) : 0;

  const freshness = query.data ? formatRelativeTime(query.data.to, now) : null;
  const hint = [
    favorites.length > 0 ? 'Hors favoris' : 'Les plus fortes progressions',
    query.data && !query.data.complete ? 'collecte partielle' : null,
    freshness ? `relevé ${freshness}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /** Le classement existe, mais vos favoris le trustent : ce n'est pas le même vide. */
  const crowdedOut = (all ?? []).length > 0 && items.length === 0;

  return (
    <View className="gap-3">
      <SectionHeader
        title="Top du moment"
        hint={hint}
        accessory={<Segmented compact options={WINDOWS} value={window} onChange={setWindow} />}
      />

      {query.isError && !query.data ? (
        <Text className="text-xs text-amber-200">Classement indisponible : backend injoignable.</Text>
      ) : items.length === 0 ? (
        <Text className="text-sm text-gray-500">
          {crowdedOut
            ? 'Vos favoris occupent tout le haut du classement.'
            : query.data && !query.data.complete
              ? 'La collecte ne couvre pas encore cette fenêtre.'
              : 'Aucune progression sur la fenêtre choisie.'}
        </Text>
      ) : (
        <View className="px-1">
          {items.map((item, index) => (
            <Animated.View
              // Le filet voyage avec sa ligne : pendant un échange de places, il ne reste
              // pas seul au milieu de deux lignes qui glissent.
              key={item.twitch}
              layout={LinearTransition.duration(REORDER_MS)}
              entering={FadeIn.duration(REORDER_MS)}
              exiting={FadeOut.duration(REORDER_MS / 2)}
            >
              {index > 0 ? <RowSeparator inset={32} /> : null}
              <MomentumRow
                item={item}
                position={index + 1}
                intensity={top > 0 ? item.deltaCents / top : 0}
                show={shows.get(item.twitch.toLowerCase())}
                lead={index === 0}
              />
            </Animated.View>
          ))}
        </View>
      )}

      {items.length > 0 ? (
        <SectionLink
          label="Tout le classement"
          accessibilityLabel="Ouvrir le classement complet des streamers, trié par progression"
          onPress={() => router.push({ pathname: '/(tabs)/streamers', params: { sort: 'momentum' } })}
        />
      ) : null}
    </View>
  );
}
