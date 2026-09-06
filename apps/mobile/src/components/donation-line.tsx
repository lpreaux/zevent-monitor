import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

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

/**
 * Largeur de la colonne des montants. Le texte y est calé à gauche : aligner à droite
 * ferait certes coïncider les symboles « € », mais la plupart des dons valent quelques
 * euros et le reste de la colonne se serait vidé — une gouttière blanche courant sur toute
 * la liste, à gauche de tout le contenu.
 */
const AMOUNT_COLUMN = 72;

/**
 * Écart entre le bord de la ligne et le début du texte, pour que les filets qui séparent
 * les lignes s'alignent sur la colonne de texte plutôt que de flotter au milieu de rien.
 */
export const DONATION_LINE_INSET = 8 + AMOUNT_COLUMN + 12;

/** Ligne de don du feed et des classements, dans le vocabulaire des listes de l'app :
 * pas de carte encadrée, un filet suffit à séparer. Le montant tient une colonne à lui,
 * d'une ligne à l'autre — c'est ce qui rend un feed de dons lisible en diagonale, bien
 * avant les couleurs.
 *
 * L'heure est renvoyée en bout de première ligne plutôt que sous le montant : sous lui,
 * elle débordait de sa colonne par la gauche et donnait à chaque ligne un bord dentelé.
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
    <Text numberOfLines={1} className="shrink text-sm font-semibold leading-5 text-white">
      {donorLabel(donation)}
      {flag ? ` ${flag}` : ''}
    </Text>
  );

  const badge = mine ? (
    <View className="rounded-full bg-zevent-500/25 px-1.5 py-0.5">
      <Text className="text-[10px] font-bold text-zevent-200">vous</Text>
    </View>
  ) : null;

  // Toujours « pour X », favori ou non : deux formulations pour la même information
  // faisaient lire deux natures de lignes là où seule la couleur change.
  const streamer = target ? (
    <View className="flex-row items-center gap-1">
      <Text className="text-[11px] text-gray-600">pour</Text>
      {favorite ? <Ionicons name="star" size={9} color="#fcd34d" /> : null}
      <Text
        numberOfLines={1}
        className={`shrink text-[11px] ${favorite ? 'text-amber-200' : 'text-gray-500'}`}
      >
        {target}
      </Text>
    </View>
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
      // Le fond de mise en avant court d'un bord à l'autre de la ligne, sans arrondi :
      // arrondi, il redevenait une carte posée au milieu d'une liste qui n'en a plus,
      // et c'est précisément ce dont on sortait.
      className={`px-2 ${tone} ${open ? 'active:opacity-60' : ''}`}
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
            <Text className="w-4 text-center text-[11px] font-bold leading-5 text-gray-600">
              {rank}
            </Text>
          ) : null}

          <Text
            numberOfLines={1}
            style={{ width: AMOUNT_COLUMN }}
            className={`text-[15px] font-bold leading-5 ${amountColor}`}
          >
            {formatEuros(donation.amountCents / 100)}
          </Text>

          <View className="flex-1 gap-0.5">
            <View className="flex-row items-center gap-1.5">
              {donor}
              {badge}
              <View className="flex-1" />
              <Text className="text-[11px] leading-5 text-gray-600">{time}</Text>
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
