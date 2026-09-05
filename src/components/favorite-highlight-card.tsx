import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PlanningEntry } from '@/api/types';
import type { RelevanceReason, ScoredFavorite } from '@/lib/favorite-relevance';
import { formatCount, formatEuros } from '@/lib/format';
import { openDonationPage, openTwitchStream } from '@/lib/links';
import { streamerActivity } from '@/lib/streamer-activity';
import { StreamerActivityLine } from './streamer-activity-line';
import { StreamerAvatar } from './streamer-avatar';

/** Pourquoi ce favori est remonté en tête : la carte l'annonce plutôt que de laisser deviner. */
const REASONS: Record<RelevanceReason, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  recent: { label: 'Vu récemment', icon: 'time-outline' },
  affinity: { label: 'Votre habitué', icon: 'star-outline' },
  momentum: { label: 'En forme', icon: 'trending-up' },
  planning: { label: 'Sur un show', icon: 'calendar-outline' },
  audience: { label: 'Forte audience', icon: 'people-outline' },
};

function ReasonChip({ reason }: { reason: RelevanceReason }) {
  const { label, icon } = REASONS[reason];
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
      <Ionicons name={icon} size={11} color="#c4b5fd" />
      <Text className="text-[10px] font-semibold text-zevent-200">{label}</Text>
    </View>
  );
}

interface FavoriteHighlightCardProps {
  item: ScoredFavorite;
  show?: PlanningEntry;
  /** Durée de la fenêtre de progression, pour légender le « +X € ». */
  windowMinutes: number;
}

/**
 * Favori mis en avant sur l'accueil : le plus pertinent du moment, en pleine largeur.
 * Une seule carte, donc pas de carrousel à faire défiler ; les suivants tiennent en
 * lignes juste en dessous.
 */
export function FavoriteHighlightCard({ item, show, windowMinutes }: FavoriteHighlightCardProps) {
  const router = useRouter();
  const { streamer, deltaCents, reason } = item;
  const activity = streamerActivity(streamer, show);

  return (
    <View className="overflow-hidden rounded-3xl border border-white/10 bg-surface-raised">
      <Pressable
        onPress={() =>
          router.push({ pathname: '/streamer/[twitch]', params: { twitch: streamer.twitch } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Détails de ${streamer.display}`}
        className="px-4 pb-3.5 pt-3.5 active:opacity-70"
      >
        {/* Tout le texte tient dans une seule colonne, à droite de la photo. Un montant posé
            sous l'avatar, dans une colonne à lui, se lisait comme un chiffre orphelin.
            La photo est dimensionnée pour tenir la hauteur de cette colonne : plus petite,
            elle laisserait un trou dans le coin, juste au-dessus des boutons. */}
        <View className="flex-row items-center gap-3">
          <StreamerAvatar uri={streamer.profileUrl} size={52} online />
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text numberOfLines={1} className="flex-1 text-base font-bold text-white">
                {streamer.display}
              </Text>
              {reason ? <ReasonChip reason={reason} /> : null}
            </View>

            <View className="mt-0.5 flex-row items-center gap-2">
              <View className="flex-1">
                <StreamerActivityLine activity={activity} size={12} />
              </View>
              <Text className="text-[11px] text-gray-500">
                {formatCount(streamer.viewersAmount.number)} viewers
              </Text>
            </View>

            {/* Montant et progression sur la même ligne de base : la cagnotte et ce qu'elle
                vient de prendre se lisent d'un seul regard. */}
            <View className="mt-2.5 flex-row items-end justify-between gap-2">
              <Text className="text-xl font-extrabold text-white">
                {formatEuros(streamer.donationAmount.number)}
              </Text>
              {deltaCents > 0 ? (
                <Text className="text-sm font-bold text-emerald-400">
                  +{formatEuros(deltaCents / 100)}
                  <Text className="text-[11px] font-normal text-gray-500">{` / ${windowMinutes} min`}</Text>
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>

      <View className="flex-row gap-2 px-4 pb-3.5">
        <Pressable
          onPress={() => void openTwitchStream(streamer.twitch)}
          accessibilityRole="button"
          accessibilityLabel={`Regarder ${streamer.display} sur Twitch`}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-zevent-500 py-2 active:opacity-80"
        >
          <Ionicons name="play" size={14} color="#ffffff" />
          <Text className="text-xs font-bold text-white">Regarder</Text>
        </Pressable>
        <Pressable
          onPress={() => void openDonationPage(streamer.donationUrl, streamer.twitch)}
          accessibilityRole="button"
          accessibilityLabel={`Faire un don à ${streamer.display}`}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-zevent-500/60 py-2 active:opacity-80"
        >
          <Ionicons name="heart" size={14} color="#c4b5fd" />
          <Text className="text-xs font-bold text-zevent-200">Faire un don</Text>
        </Pressable>
      </View>
    </View>
  );
}
