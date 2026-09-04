import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';

import type { Donation } from '@/api/donations';
import { donorLabel, flagEmoji, parisClock } from '@/lib/donations';
import { formatEuros } from '@/lib/format';

interface DonationRowProps {
  donation: Donation;
  /** Montant à partir duquel la ligne est mise en avant (centimes). */
  highlightCents?: number;
  /** Masquer la pastille du streamer (ex. sur sa propre fiche). */
  hideStreamer?: boolean;
  /** Mise en avant « favori » : le don soutient un streamer suivi. */
  favorite?: boolean;
  /** Affiche le rang (top des plus gros dons). */
  rank?: number;
}

function DonationRowComponent({
  donation,
  highlightCents = 50_000,
  hideStreamer,
  favorite,
  rank,
}: DonationRowProps) {
  const big = donation.amountCents >= highlightCents;
  const flag = flagEmoji(donation.country);

  return (
    <View
      className={`gap-1.5 rounded-2xl border p-3 ${
        big ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-800 bg-gray-900/50'
      }`}
    >
      <View className="flex-row items-center gap-2">
        {rank ? (
          <Text className="w-6 text-center text-sm font-bold text-gray-500">{rank}</Text>
        ) : null}
        <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={1}>
          {donorLabel(donation)}
          {flag ? ` ${flag}` : ''}
        </Text>
        <Text className={`text-base font-bold ${big ? 'text-amber-300' : 'text-zevent-300'}`}>
          {formatEuros(donation.amountCents / 100)}
        </Text>
      </View>

      {donation.comment ? (
        <Text className="text-sm text-gray-300" numberOfLines={4}>
          {donation.comment}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between gap-2">
        {!hideStreamer && donation.twitch ? (
          <Link href={{ pathname: '/streamer/[twitch]', params: { twitch: donation.twitch } }} asChild>
            <Pressable
              className={`rounded-full border px-2.5 py-1 active:opacity-70 ${
                favorite ? 'border-amber-400/60 bg-amber-400/10' : 'border-gray-700 bg-gray-900'
              }`}
              accessibilityRole="link"
              accessibilityLabel={`Voir la fiche de ${donation.twitch}`}
            >
              <Text
                className={`text-xs font-semibold ${favorite ? 'text-amber-200' : 'text-gray-300'}`}
                numberOfLines={1}
              >
                {favorite ? '★ ' : ''}
                {donation.twitch}
              </Text>
            </Pressable>
          </Link>
        ) : !hideStreamer ? (
          <Text className="text-xs text-gray-600">Cagnotte globale</Text>
        ) : (
          <View />
        )}
        <Text className="text-xs text-gray-500">{parisClock(donation.createdAt)}</Text>
      </View>
    </View>
  );
}

export const DonationRow = memo(DonationRowComponent);
