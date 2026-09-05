import { Text, View } from 'react-native';

import type { Donation } from '@/api/donations';
import { donationTimeLabel, donorLabel, flagEmoji } from '@/lib/donations';
import { formatEuros } from '@/lib/format';

interface AlwaysOnDonationRowProps {
  donation: Donation;
  /** Montant à partir duquel le don est mis en avant (centimes). */
  highlightCents?: number;
  /** Le don soutient un favori. */
  favorite?: boolean;
  /** Nom affiché du streamer soutenu, `null` pour la cagnotte globale. */
  streamerLabel: string | null;
  now: number;
  valueFontSize: number;
  captionFontSize: number;
}

/**
 * Don du ticker de l'écran secondaire : montant, donateur, destinataire et fraîcheur.
 * Le commentaire n'est pas affiché — il est trop long pour un écran lu de loin, et rien
 * ne garantit qu'il soit lisible en public.
 */
export function AlwaysOnDonationRow({
  donation,
  highlightCents = 50_000,
  favorite,
  streamerLabel,
  now,
  valueFontSize,
  captionFontSize,
}: AlwaysOnDonationRowProps) {
  const big = donation.amountCents >= highlightCents;
  const flag = flagEmoji(donation.country);

  return (
    <View className="py-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text
          style={{ fontSize: valueFontSize }}
          className={`font-bold ${big ? 'text-amber-300' : 'text-zevent-300'}`}
        >
          {formatEuros(donation.amountCents / 100)}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: captionFontSize * 1.15 }}
          className="flex-1 text-gray-300"
        >
          {flag ? `${flag} ` : ''}
          {donorLabel(donation)}
        </Text>
        <Text style={{ fontSize: captionFontSize }} className="text-gray-600">
          {donationTimeLabel(donation.createdAt, now)}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: captionFontSize }} className="text-gray-500">
        {streamerLabel ? `${favorite ? '★ ' : ''}pour ${streamerLabel}` : 'cagnotte globale'}
      </Text>
    </View>
  );
}
