import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { StreamerMomentum } from '@/api/donations';
import type { PlanningEntry } from '@/api/types';
import { rankChange } from '@/lib/donations';
import { formatEuros } from '@/lib/format';
import { streamerActivity } from '@/lib/streamer-activity';
import { TONE_COLOR, TONE_TEXT, toneOf } from '@/theme';
import { StreamerActivityLine } from './streamer-activity-line';
import { StreamerAvatar } from './streamer-avatar';
import { WatchButton } from './watch-button';

interface MomentumRowProps {
  item: StreamerMomentum;
  position: number;
  /**
   * Progression rapportée à celle de la tête du classement, entre 0 et 1. Un montant seul
   * ne dit pas s'il est gros : la barre le situe d'un coup d'œil par rapport au premier.
   */
  intensity: number;
  /** Show du planning en cours pour ce streamer, s'il y en a un. */
  show?: PlanningEntry;
  /** Tête du classement : un cran plus grande, elle ouvre la section. */
  lead?: boolean;
}

/** Évolution du rang au classement par cagnotte : flèche verte/rouge ou tiret. */
function RankBadge({ item }: { item: StreamerMomentum }) {
  const change = rankChange(item);
  if (change === null) return <Text className="text-[11px] text-gray-600">#{item.rank}</Text>;
  if (change === 0) return <Text className="text-[11px] text-gray-600">#{item.rank}</Text>;
  const up = change > 0;
  const tone = toneOf(change);
  return (
    <View className="flex-row items-center gap-0.5">
      <Text className="text-[11px] text-gray-600">#{item.rank}</Text>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={10} color={TONE_COLOR[tone]} />
      <Text className={`text-[11px] font-semibold ${TONE_TEXT[tone]}`}>
        {Math.abs(change)}
      </Text>
    </View>
  );
}

/** Couleurs de la jauge, en dur : la piste et son remplissage doivent arriver ensemble ou pas du tout. */
const GAUGE_TRACK = 'rgba(255, 255, 255, 0.07)';
const GAUGE_FILL_LEAD = '#34d399';
const GAUGE_FILL = 'rgba(52, 211, 153, 0.55)';

/**
 * Jauge de la progression, à l'échelle du premier du classement. Fine et sans graduation :
 * elle sert à comparer les lignes entre elles, pas à lire une valeur — le montant est
 * juste au-dessus.
 */
function IntensityBar({ intensity, lead }: { intensity: number; lead: boolean }) {
  // Plancher visible : une progression réelle mais minuscule mérite un trait, pas rien.
  const ratio = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  const width = `${Math.max(3, Math.round(ratio * 100))}%` as const;

  return (
    <View
      style={{
        marginTop: 6,
        height: 3,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: GAUGE_TRACK,
      }}
    >
      <View
        style={{
          width,
          height: '100%',
          borderRadius: 999,
          backgroundColor: lead ? GAUGE_FILL_LEAD : GAUGE_FILL,
        }}
      />
    </View>
  );
}

/**
 * Une place du « Top du moment », en ligne dense : rang, qui c'est, ce qu'il fait, combien
 * il a pris sur la fenêtre et à quelle hauteur ça le situe. Le corps mène à la fiche, le
 * rond de droite au direct.
 */
function MomentumRowComponent({
  item,
  position,
  intensity,
  show,
  lead = false,
}: MomentumRowProps) {
  const activity = streamerActivity(item, show);

  return (
    <View className={`flex-row items-center gap-2 ${lead ? 'py-3' : 'py-2.5'}`}>
      <Link href={{ pathname: '/streamer/[twitch]', params: { twitch: item.twitch } }} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${position}. ${item.display}, ${formatEuros(item.deltaCents / 100)} sur la fenêtre`}
          className="flex-1 flex-row items-center gap-3 active:opacity-60"
        >
          <Text
            className={`w-4 text-center text-[13px] font-bold ${lead ? 'text-zevent-300' : 'text-gray-600'}`}
          >
            {position}
          </Text>
          <StreamerAvatar uri={item.profileUrl} size={lead ? 42 : 34} online={item.online} />

          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text
                numberOfLines={1}
                className={`shrink font-semibold text-white ${lead ? 'text-[15px]' : 'text-sm'}`}
              >
                {item.display}
              </Text>
              <View className="flex-1" />
              <Text className={`font-bold text-emerald-400 ${lead ? 'text-base' : 'text-sm'}`}>
                +{formatEuros(item.deltaCents / 100)}
              </Text>
            </View>

            <View className="mt-0.5 flex-row items-center gap-2">
              <View className="flex-1">
                <StreamerActivityLine activity={activity} size={11} />
              </View>
              <RankBadge item={item} />
            </View>

            <IntensityBar intensity={intensity} lead={lead} />
          </View>
        </Pressable>
      </Link>

      {/* Hors ligne, la place du rond reste vide : les lignes gardent la même colonne de fin. */}
      {item.online ? (
        <WatchButton twitch={item.twitch} display={item.display} />
      ) : (
        <View className="h-8 w-8" />
      )}
    </View>
  );
}

export const MomentumRow = memo(MomentumRowComponent);
