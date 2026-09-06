import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useZeventState } from '@/api/queries';
import { DisclosureButton } from '@/components/disclosure-button';
import { RowSeparator } from '@/components/row-separator';
import { StreamerAvatar } from '@/components/streamer-avatar';
import { formatEuros } from '@/lib/format';
import { favoriteMarks, type FavoriteDigest } from '@/lib/recap-view';

/** Favoris montrés avant dépliage : de quoi voir qui a porté la période, sans la remplir. */
const VISIBLE = 5;

/** Décalage de l'avatar, pour que le filet ne coupe pas sous la photo. */
const ROW_INSET = 48;

interface RecapFavoritesProps {
  digests: readonly FavoriteDigest[];
  onOpenStreamer: (twitch: string) => void;
}

/**
 * Ce que la période contient sur les streamers suivis, une ligne par personne.
 *
 * Le statut de direct vient de l'état courant, pas du récap : lire dimanche matin qu'un
 * favori « a lancé son direct à 21:40 » est une information de la période, mais savoir
 * qu'il est encore dessus est une information sur maintenant — et c'est celle qui décide
 * si on quitte l'écran pour aller le regarder.
 */
export function RecapFavorites({ digests, onOpenStreamer }: RecapFavoritesProps) {
  const state = useZeventState();
  const [expanded, setExpanded] = useState(false);

  const live = useMemo(() => {
    const map = new Map<string, { profileUrl: string; online: boolean }>();
    for (const streamer of state.data?.data.live ?? []) {
      map.set(streamer.twitch.toLowerCase(), {
        profileUrl: streamer.profileUrl,
        online: streamer.online,
      });
    }
    return map;
  }, [state.data]);

  const shown = expanded ? digests : digests.slice(0, VISIBLE);
  const hidden = digests.length - shown.length;

  return (
    <View className="gap-3">
      <View className="-my-2">
        {shown.map((digest, index) => {
          const known = live.get(digest.twitch);
          const marks = favoriteMarks(digest, known?.online ?? false);
          return (
            <View key={digest.twitch}>
              {index > 0 ? <RowSeparator inset={ROW_INSET} /> : null}
              <Pressable
                onPress={() => onOpenStreamer(digest.twitch)}
                accessibilityRole="button"
                accessibilityLabel={`${digest.display}, ${marks.join(', ') || 'aucun fait marquant'}`}
                className="flex-row items-center gap-3 py-2.5 active:opacity-70"
              >
                {known?.profileUrl ? (
                  <StreamerAvatar uri={known.profileUrl} size={36} online={known.online} />
                ) : (
                  <View className="h-9 w-9 rounded-full bg-white/5" />
                )}

                <View className="flex-1 gap-0.5">
                  <Text numberOfLines={1} className="text-sm font-semibold text-white">
                    {digest.display}
                  </Text>
                  {marks.length > 0 ? (
                    <Text numberOfLines={1} className="text-[11px] text-amber-200/80">
                      {marks.join(' · ')}
                    </Text>
                  ) : null}
                </View>

                {digest.raisedCents > 0 ? (
                  <Text className="text-sm font-bold text-zevent-300">
                    +{formatEuros(digest.raisedCents / 100)}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {hidden > 0 || expanded ? (
        <DisclosureButton
          expanded={expanded}
          onPress={() => setExpanded((current) => !current)}
          label={`${hidden} autre${hidden > 1 ? 's' : ''} favori${hidden > 1 ? 's' : ''}`}
          expandedLabel="Réduire"
        />
      ) : null}
    </View>
  );
}
