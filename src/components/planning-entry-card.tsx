import { memo, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { PlanningEntry, PlanningParticipant } from '@/api/types';
import { twitchLinks } from '@/lib/format';
import { formatCountdown, formatParisRange, type PlanningStatus } from '@/lib/planning';

async function openTwitch(login: string) {
  const { app, web } = twitchLinks(login);
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web);
  }
}

const ROLE_LABELS: Record<string, string> = {
  host: 'Animation',
  guest: 'Invité·e',
  participant: 'Participant·e',
};

function ParticipantChip({
  participant,
  knownStreamers,
}: {
  participant: PlanningParticipant;
  knownStreamers: Set<string>;
}) {
  const router = useRouter();
  const login = participant.twitch;
  const isKnown = Boolean(login && knownStreamers.has(login));

  const onPress = () => {
    if (!login) return;
    if (isKnown) router.push({ pathname: '/streamer/[twitch]', params: { twitch: login } });
    else void openTwitch(login);
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!login}
      accessibilityRole={login ? 'button' : 'text'}
      className={`flex-row items-center gap-2 rounded-full border border-gray-800 bg-gray-900 py-1 pl-1 pr-3 ${
        login ? 'active:opacity-70' : ''
      }`}
    >
      {participant.profileUrl ? (
        <Image
          source={{ uri: participant.profileUrl }}
          className="h-6 w-6 rounded-full bg-gray-800"
        />
      ) : (
        <View className="h-6 w-6 rounded-full bg-gray-800" />
      )}
      <Text className="text-xs text-gray-300" numberOfLines={1}>
        {participant.name}
      </Text>
    </Pressable>
  );
}

interface PlanningEntryCardProps {
  entry: PlanningEntry;
  status: PlanningStatus;
  now: number;
  /** Logins présents dans l'état ZEvent : eux ouvrent la fiche interne plutôt que Twitch. */
  knownStreamers: Set<string>;
}

function PlanningEntryCardComponent({
  entry,
  status,
  now,
  knownStreamers,
}: PlanningEntryCardProps) {
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const countdown = status === 'upcoming' ? formatCountdown(entry.startsAt, now) : null;
  const hosts = entry.participants.filter((p) => p.role === 'host');
  const others = entry.participants.filter((p) => p.role !== 'host');
  const ordered = [...hosts, ...others];
  const visible = showAllParticipants ? ordered : ordered.slice(0, 6);

  return (
    <View
      className={`gap-3 rounded-2xl border p-4 ${
        status === 'live'
          ? 'border-red-500/50 bg-red-500/10'
          : status === 'past'
            ? 'border-gray-800/60 bg-gray-900/30'
            : 'border-gray-800 bg-gray-900/50'
      }`}
    >
      <View className="flex-row items-start gap-3">
        <View className="w-24">
          <Text
            className={`text-sm font-semibold ${
              status === 'past' ? 'text-gray-500' : 'text-zevent-200'
            }`}
          >
            {formatParisRange(entry.startsAt, entry.endsAt)}
          </Text>
          {countdown ? <Text className="mt-0.5 text-xs text-gray-500">{countdown}</Text> : null}
        </View>
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className={`flex-1 text-base font-semibold ${
                status === 'past' ? 'text-gray-400' : 'text-white'
              }`}
            >
              {entry.title}
            </Text>
            {status === 'live' ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-0.5">
                <View className="h-2 w-2 rounded-full bg-red-500" />
                <Text className="text-xs font-semibold uppercase tracking-wider text-red-400">
                  En cours
                </Text>
              </View>
            ) : null}
          </View>
          {entry.description ? (
            <Text className="text-xs leading-5 text-gray-400">{entry.description}</Text>
          ) : null}
          {hosts.length > 0 ? (
            <Text className="text-xs text-gray-500">
              {ROLE_LABELS.host} : {hosts.map((host) => host.name).join(', ')}
            </Text>
          ) : null}
        </View>
      </View>

      {ordered.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {visible.map((participant) => (
            <ParticipantChip
              key={`${entry.id}:${participant.name}`}
              participant={participant}
              knownStreamers={knownStreamers}
            />
          ))}
          {ordered.length > visible.length ? (
            <Pressable
              onPress={() => setShowAllParticipants(true)}
              className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 active:opacity-70"
            >
              <Text className="text-xs text-gray-400">+{ordered.length - visible.length}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const PlanningEntryCard = memo(PlanningEntryCardComponent);
