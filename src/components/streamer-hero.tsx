import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { PlanningEntry, Streamer } from '@/api/types';
import { AnimatedEuros } from '@/components/animated-euros';
import { FavoriteButton } from '@/components/favorite-button';
import { Metric, MetricDivider } from '@/components/metric';
import { StreamerActivityLine } from '@/components/streamer-activity-line';
import { StreamerAvatar } from '@/components/streamer-avatar';
import { Button, ButtonRow } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { formatCount, formatEuros, formatPercent, formatRank, formatRelativeTime } from '@/lib/format';
import { iconSizes, icons } from '@/lib/icons';
import { openDonationPage, openTwitchStream } from '@/lib/links';
import { streamerActivity } from '@/lib/streamer-activity';
import type { StreamerStanding } from '@/lib/streamer-profile';
import { useAlwaysOnStore } from '@/store/always-on';

interface StreamerHeroProps {
  streamer: Streamer;
  /** Show du planning en cours pour ce streamer, s'il y en a un. */
  show?: PlanningEntry;
  /** Progression de la cagnotte sur la fenêtre courte (centimes). */
  deltaCents: number;
  /** Durée de cette fenêtre, pour légender le « +X € ». */
  windowMinutes: number;
  standing: StreamerStanding;
  /** Dernier relevé où la collecte l'a vu en direct, pour une fiche éteinte. */
  lastOnline: string | null;
  /** Horloge de l'écran : « vu il y a 2 h » doit vieillir sans refetch. */
  now: number;
}

/**
 * Tête de la fiche : qui c'est, ce qu'il fait, ce qu'il a levé, et ce qu'on peut en faire.
 *
 * Tout ce qui répond à « dois-je ouvrir ce direct maintenant » tient dans cette carte,
 * sans défilement : le reste de la page creuse, elle décide. Le montant y est doublé de
 * sa progression récente et de la place qu'elle vaut au classement — une cagnotte seule
 * ne dit pas si elle bouge, et un rang seul ne dit pas s'il se joue à 200 € près.
 */
export function StreamerHero({
  streamer,
  show,
  deltaCents,
  windowMinutes,
  standing,
  lastOnline,
  now,
}: StreamerHeroProps) {
  const router = useRouter();
  const setFocusTwitch = useAlwaysOnStore((s) => s.setFocusTwitch);
  const setPreset = useAlwaysOnStore((s) => s.setPreset);
  const activity = streamerActivity(streamer, show);
  const online = streamer.online;

  const focusOnSecondScreen = () => {
    setFocusTwitch(streamer.twitch);
    setPreset('focus');
    router.push('/always-on');
  };

  return (
    <View className="gap-4 rounded-3xl border border-white/10 bg-surface-raised p-4">
      <View className="flex-row items-center gap-3">
        <StreamerAvatar uri={streamer.profileUrl} size={52} online={online} dim={!online} />
        <View className="flex-1">
          <Text numberOfLines={1} className="text-lg font-extrabold text-white">
            {streamer.display}
          </Text>
          <View className="mt-0.5">
            <StreamerActivityLine activity={activity} size={12} />
          </View>
        </View>
        {/* Suivre, envoyer sur l'écran secondaire et partager sont trois choses que l'on
            fait *de* ce streamer : elles se rangent ensemble en haut à droite, comme sur
            la carte de verdict et sur l'écran d'un récap. En bas ne restent que les deux
            actions qui font quelque chose *avec* lui — le regarder, lui donner —, et
            elles se partagent la largeur à parts égales. La rangée du bas alignait
            jusqu'ici deux boutons pleins et deux ronds, ce qui donnait quatre choses de
            même rang là où il n'y en a que deux. */}
        <View className="flex-row items-center gap-1">
          <IconButton
            size="sm"
            icon={icons.alwaysOn}
            label="Afficher sur l’écran secondaire"
            onPress={focusOnSecondScreen}
          />
          {/* Le partage ouvre sa propre page : une carte en image demande d'être vue avant
              d'être envoyée, et le texte y reste disponible en repli. */}
          <IconButton
            size="sm"
            icon={icons.share}
            label={`Partager la fiche de ${streamer.display}`}
            onPress={() =>
              router.push({
                pathname: '/streamer/[twitch]/share',
                params: { twitch: streamer.twitch },
              })
            }
          />
          <FavoriteButton twitch={streamer.twitch} size={iconSizes.button} />
        </View>
      </View>

      <View>
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
          Cagnotte personnelle
        </Text>
        {/* Montant et progression sur la même ligne de base, comme sur la carte de
            l'accueil : ce que vaut la cagnotte et ce qu'elle vient de prendre se lisent
            d'un seul regard. */}
        <View className="mt-0.5 flex-row items-end justify-between gap-3">
          <AnimatedEuros value={streamer.donationAmount.number} style={{ fontSize: 32 }} />
          {deltaCents > 0 ? (
            <Text className="pb-1 text-base font-bold text-emerald-400">
              +{formatEuros(deltaCents / 100)}
              <Text className="text-[11px] font-normal text-gray-500">{` / ${windowMinutes} min`}</Text>
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-start">
        <Metric
          label="Classement"
          value={`${formatRank(standing.donationRank)} / ${formatCount(standing.total)}`}
          hint={
            standing.behindEuros === null
              ? 'en tête du plateau'
              : `à ${formatEuros(standing.behindEuros)} du ${formatRank(standing.donationRank - 1)}`
          }
        />
        <MetricDivider />
        <Metric
          label="Part du total"
          value={standing.share === null ? '—' : formatPercent(standing.share)}
          hint="de la cagnotte 2026"
        />
        <MetricDivider />
        <Metric
          label="Viewers"
          value={online ? formatCount(streamer.viewersAmount.number) : '—'}
          hint={
            online
              ? standing.viewersRank === null
                ? undefined
                : `${formatRank(standing.viewersRank)} audience`
              : lastOnline
                ? `vu en direct ${formatRelativeTime(lastOnline, now)}`
                : 'pas vu en direct'
          }
        />
      </View>

      <ButtonRow>
        <Button
          grow
          size="sm"
          icon={online ? icons.watch : icons.channel}
          label={online ? 'Regarder' : 'Sa chaîne'}
          accessibilityLabel={
            online
              ? `Regarder ${streamer.display} sur Twitch`
              : `Ouvrir la chaîne de ${streamer.display}`
          }
          onPress={() => void openTwitchStream(streamer.twitch)}
        />
        <Button
          grow
          size="sm"
          variant="secondary"
          icon={icons.donate}
          label="Faire un don"
          accessibilityLabel={`Faire un don à ${streamer.display}`}
          onPress={() => void openDonationPage(streamer.donationUrl, streamer.twitch)}
        />
      </ButtonRow>
    </View>
  );
}
