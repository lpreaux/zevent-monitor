import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PlanningParticipant } from '@/api/types';
import { openTwitchStream } from '@/lib/links';

/** Photo d'un participant, ou une pastille neutre quand le planning n'en donne pas. */
function ParticipantFace({ participant, size }: { participant: PlanningParticipant; size: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (!participant.profileUrl) return <View style={style} className="bg-gray-800" />;
  return <Image source={{ uri: participant.profileUrl }} style={style} className="bg-gray-800" />;
}

interface ParticipantChipProps {
  participant: PlanningParticipant;
  /** Logins présents dans l'état ZEvent : eux ouvrent la fiche interne plutôt que Twitch. */
  knownStreamers: Set<string>;
  /** Participant suivi : la pastille le dit, c'est souvent la raison d'ouvrir l'émission. */
  favorite?: boolean;
}

/** Participant annoncé sur une émission, cliquable quand on sait où l'envoyer. */
export function ParticipantChip({ participant, knownStreamers, favorite }: ParticipantChipProps) {
  const router = useRouter();
  const login = participant.twitch;
  const known = Boolean(login && knownStreamers.has(login.toLowerCase()));

  const onPress = () => {
    if (!login) return;
    if (known) router.push({ pathname: '/streamer/[twitch]', params: { twitch: login } });
    else void openTwitchStream(login);
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!login}
      accessibilityRole={login ? 'button' : 'text'}
      accessibilityLabel={participant.name}
      className={`flex-row items-center gap-2 rounded-full border py-1 pl-1 pr-3 ${
        favorite ? 'border-zevent-500/60 bg-zevent-500/15' : 'border-white/10 bg-white/5'
      } ${login ? 'active:opacity-70' : ''}`}
    >
      <ParticipantFace participant={participant} size={22} />
      <Text
        numberOfLines={1}
        className={`text-xs ${favorite ? 'font-semibold text-zevent-200' : 'text-gray-300'}`}
      >
        {participant.name}
      </Text>
      {favorite ? <Ionicons name="star" size={10} color="#c4b5fd" /> : null}
    </Pressable>
  );
}

interface ParticipantStackProps {
  participants: PlanningParticipant[];
  /** Photos montrées avant de basculer sur un décompte. */
  max?: number;
  size?: number;
}

/**
 * Photos des participants en pile serrée. Une carte de tête d'écran n'a pas la place de
 * nommer douze personnes, mais les visages suffisent à reconnaître une émission — et le
 * décompte dit qu'il y en a d'autres derrière.
 */
export function ParticipantStack({ participants, max = 5, size = 24 }: ParticipantStackProps) {
  if (participants.length === 0) return null;
  const shown = participants.slice(0, max);
  const rest = participants.length - shown.length;

  return (
    <View className="flex-row items-center">
      {shown.map((participant, index) => (
        <View
          key={`${participant.name}:${index}`}
          // Les photos se chevauchent, chacune cerclée du fond de la carte : c'est ce
          // liseré qui les détache les unes des autres.
          style={{ marginLeft: index === 0 ? 0 : -size / 3, zIndex: shown.length - index }}
          className="rounded-full border-2 border-surface-raised"
        >
          <ParticipantFace participant={participant} size={size} />
        </View>
      ))}
      {rest > 0 ? (
        <Text className="ml-2 text-[11px] text-gray-500">{`+${rest}`}</Text>
      ) : null}
    </View>
  );
}
