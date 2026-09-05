import { memo } from 'react';
import { Text, View } from 'react-native';

import type { TopDonor } from '@/api/donations';
import { medalFor } from '@/lib/donations';
import { formatCount, formatEuros, formatRelativeTime } from '@/lib/format';

interface DonorRowProps {
  donor: TopDonor;
  /** Part du total du premier, entre 0 et 1 : situe la ligne dans le classement. */
  intensity: number;
  /** Podium : un cran plus grand, il ouvre la liste. */
  lead?: boolean;
  /** Le nom correspond à celui que l'utilisateur a déclaré comme le sien. */
  mine?: boolean;
  now?: number;
}

/** Couleurs de la jauge en dur : la piste et son remplissage doivent arriver ensemble ou pas du tout. */
const TRACK = 'rgba(255, 255, 255, 0.07)';
const FILL_LEAD = '#a78bfa';
const FILL = 'rgba(167, 139, 250, 0.5)';

/**
 * Une place du classement des donateurs, en ligne dense plutôt qu'en carte : rang, nom,
 * cumul, et sous le tout une jauge à l'échelle du premier — un montant seul ne dit pas
 * s'il est gros.
 *
 * Les trois premiers gardent leur médaille, mais c'est la taille qui fait le podium : au
 * milieu d'un classement long, un emoji ne suffit pas à marquer une rupture.
 */
function DonorRowComponent({ donor, intensity, lead = false, mine = false, now }: DonorRowProps) {
  const medal = medalFor(donor.rank);
  const ratio = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;

  return (
    <View
      className={`rounded-2xl px-2 ${lead ? 'py-3' : 'py-2.5'} ${mine ? 'bg-zevent-500/10' : ''}`}
      accessibilityLabel={`${donor.rank}. ${donor.donor}, ${formatEuros(donor.totalCents / 100)} en ${formatCount(donor.count)} dons`}
    >
      <View className="flex-row items-center gap-2.5">
        <Text
          className={`w-6 text-center font-bold ${
            lead ? 'text-base' : 'text-[13px]'
          } ${lead ? 'text-zevent-300' : 'text-gray-600'}`}
        >
          {medal ?? donor.rank}
        </Text>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className={`shrink font-semibold text-white ${lead ? 'text-[15px]' : 'text-sm'}`}
            >
              {donor.donor}
            </Text>
            {mine ? (
              <View className="rounded-full bg-zevent-500/25 px-1.5 py-0.5">
                <Text className="text-[10px] font-bold text-zevent-200">vous</Text>
              </View>
            ) : null}
            <View className="flex-1" />
            <Text className={`font-bold text-zevent-300 ${lead ? 'text-base' : 'text-sm'}`}>
              {formatEuros(donor.totalCents / 100)}
            </Text>
          </View>

          <View
            style={{
              marginTop: 5,
              height: 3,
              borderRadius: 999,
              overflow: 'hidden',
              backgroundColor: TRACK,
            }}
          >
            <View
              style={{
                // Plancher visible : un cumul réel mais minuscule mérite un trait, pas rien.
                width: `${Math.max(3, Math.round(ratio * 100))}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: lead ? FILL_LEAD : FILL,
              }}
            />
          </View>

          <Text numberOfLines={1} className="mt-1 text-[11px] text-gray-600">
            {formatCount(donor.count)} don{donor.count > 1 ? 's' : ''} · plus gros{' '}
            {formatEuros(donor.largestCents / 100)} · dernier {formatRelativeTime(donor.lastAt, now)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export const DonorRow = memo(DonorRowComponent);
