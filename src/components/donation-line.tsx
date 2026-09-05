import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Donation } from '@/api/donations';
import { donationTimeLabel, donorLabel, flagEmoji } from '@/lib/donations';
import { formatEuros } from '@/lib/format';

interface DonationLineProps {
  donation: Donation;
  /** Montant à partir duquel le don est mis en avant (centimes). */
  highlightCents?: number;
  /** Masquer le destinataire, sur sa propre fiche. */
  hideStreamer?: boolean;
  /** Le don soutient un streamer suivi. */
  favorite?: boolean;
  /** Le don est signé du nom que l'utilisateur a déclaré comme le sien. */
  mine?: boolean;
  /** Rang, sur les classements de plus gros dons. */
  rank?: number;
  /** Instant de référence pour « il y a … » ; fourni par l'écran pour vieillir sans refetch. */
  now?: number;
  /**
   * Le message passe devant et s'affiche en entier : c'est le mode « mur des messages »,
   * où l'on vient lire ce que les gens écrivent, pas comparer des montants.
   */
  messageFirst?: boolean;
  /** Appui long : partage du don. Absent, la ligne ne réagit qu'au tap. */
  onShare?: (donation: Donation) => void;
}

/** Largeur de la colonne des montants : alignés à droite, ils se comparent d'un coup d'œil. */
const AMOUNT_COLUMN = 86;

/** Ligne de don du feed et des classements, dans le vocabulaire des listes de l'app :
 * pas de carte encadrée, un filet suffit à séparer. Le montant tient une colonne à lui,
 * alignée à droite d'une ligne à l'autre — c'est ce qui rend un feed de dons lisible en
 * diagonale, bien avant les couleurs.
 *
 * Trois mises en avant, jamais cumulées à l'excès : le gros don passe en ambre, le don de
 * l'utilisateur en violet, et le reste ne porte aucun fond.
 */
function DonationLineComponent({
  donation,
  highlightCents = 50_000,
  hideStreamer,
  favorite,
  mine,
  rank,
  now,
  messageFirst,
  onShare,
}: DonationLineProps) {
  const router = useRouter();
  const big = donation.amountCents >= highlightCents;
  const flag = flagEmoji(donation.country);
  const time = donationTimeLabel(donation.createdAt, now);
  const target = hideStreamer ? null : donation.twitch;

  const open = target
    ? () => router.push({ pathname: '/streamer/[twitch]', params: { twitch: target } })
    : undefined;

  const tone = mine
    ? 'bg-zevent-500/10'
    : big
      ? 'bg-amber-500/[0.07]'
      : '';

  const amountColor = big ? 'text-amber-300' : mine ? 'text-zevent-200' : 'text-zevent-300';

  const donor = (
    <Text numberOfLines={1} className="shrink text-sm font-semibold text-white">
      {donorLabel(donation)}
      {flag ? ` ${flag}` : ''}
    </Text>
  );

  const badge = mine ? (
    <View className="rounded-full bg-zevent-500/25 px-1.5 py-0.5">
      <Text className="text-[10px] font-bold text-zevent-200">vous</Text>
    </View>
  ) : null;

  const streamer = target ? (
    <Text numberOfLines={1} className={`text-[11px] ${favorite ? 'text-amber-200' : 'text-gray-500'}`}>
      {favorite ? '★ ' : 'pour '}
      {target}
    </Text>
  ) : hideStreamer ? null : (
    <Text className="text-[11px] text-gray-600">cagnotte globale</Text>
  );

  return (
    <Pressable
      onPress={open}
      onLongPress={onShare ? () => onShare(donation) : undefined}
      delayLongPress={350}
      accessibilityRole={open ? 'button' : undefined}
      accessibilityLabel={`${formatEuros(donation.amountCents / 100)} de ${donorLabel(donation)}${
        target ? ` pour ${target}` : ''
      }, ${time}`}
      accessibilityHint={onShare ? 'Appui long pour partager ce don' : undefined}
      className={`rounded-2xl px-2 ${tone} ${open ? 'active:opacity-60' : ''}`}
    >
      {messageFirst && donation.comment ? (
        <View className="gap-1.5 py-3">
          <Text className="text-[15px] leading-5 text-gray-100">{donation.comment}</Text>
          <View className="flex-row items-center gap-2">
            <Text className={`text-sm font-bold ${amountColor}`}>
              {formatEuros(donation.amountCents / 100)}
            </Text>
            {donor}
            {badge}
            <View className="flex-1" />
            <Text className="text-[11px] text-gray-600">{time}</Text>
          </View>
          {streamer}
        </View>
      ) : (
        <View className="flex-row gap-3 py-2.5">
          {rank ? (
            <Text className="w-4 pt-0.5 text-center text-[11px] font-bold text-gray-600">
              {rank}
            </Text>
          ) : null}

          <View style={{ width: AMOUNT_COLUMN }} className="items-end">
            <Text className={`text-[15px] font-bold ${amountColor}`}>
              {formatEuros(donation.amountCents / 100)}
            </Text>
            <Text className="text-[10px] text-gray-600">{time}</Text>
          </View>

          <View className="flex-1 gap-0.5">
            <View className="flex-row items-center gap-1.5">
              {donor}
              {badge}
            </View>
            {donation.comment ? (
              <Text numberOfLines={3} className="text-[13px] leading-[18px] text-gray-300">
                {donation.comment}
              </Text>
            ) : null}
            {streamer}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export const DonationLine = memo(DonationLineComponent);
