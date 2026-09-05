import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { openTwitchStream } from '@/lib/links';
import {
  entryProgress,
  formatCountdownPrecise,
  formatDuration,
  formatParisRange,
  formatParisTime,
  formatRemaining,
  entryDurationMs,
  PRECISE_COUNTDOWN_MS,
} from '@/lib/planning';
import { broadcastLogin, type PlanningEntryItem } from '@/lib/planning-view';
import { useNow } from '@/lib/use-now';
import { ParticipantStack } from './participant-chips';
import { ReminderBell } from './reminder-bell';

/** Pastille de contexte posée en tête de carte (parallèle, favoris, créneau au long cours). */
function Tag({
  icon,
  label,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'neutral' | 'brand';
}) {
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full border px-2 py-0.5 ${
        tone === 'brand' ? 'border-zevent-500/50 bg-zevent-500/15' : 'border-white/10 bg-white/5'
      }`}
    >
      <Ionicons name={icon} size={10} color={tone === 'brand' ? '#c4b5fd' : '#9ca3af'} />
      <Text
        className={`text-[10px] font-semibold ${
          tone === 'brand' ? 'text-zevent-200' : 'text-gray-400'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

function Tags({ item }: { item: PlanningEntryItem }) {
  const favorites = item.favorites.length;
  if (item.parallel === 0 && favorites === 0 && !item.longRun) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {favorites > 0 ? (
        <Tag
          icon="star"
          tone="brand"
          label={favorites === 1 ? '1 favori' : `${favorites} favoris`}
        />
      ) : null}
      {item.longRun ? <Tag icon="infinite-outline" label="en continu" /> : null}
      {item.parallel > 0 ? (
        <Tag icon="git-branch-outline" label={`${item.parallel + 1} en parallèle`} />
      ) : null}
    </View>
  );
}

/** Bouton d'ouverture du direct, seulement quand le planning nomme une chaîne. */
function WatchButton({ login }: { login: string }) {
  return (
    <Pressable
      onPress={() => void openTwitchStream(login)}
      accessibilityRole="button"
      accessibilityLabel={`Regarder ${login} sur Twitch`}
      className="flex-row items-center gap-1.5 rounded-full bg-zevent-500 px-3.5 py-2 active:opacity-80"
    >
      <Ionicons name="play" size={13} color="#ffffff" />
      <Text className="text-xs font-bold text-white">Regarder</Text>
    </Pressable>
  );
}

/**
 * Jauge d'avancement d'une émission en cours. Le temps qui reste est la seule chose
 * qu'on veuille savoir d'un direct commencé : « 20h00 – 23h30 » oblige à faire le calcul,
 * une barre le donne d'un coup d'œil.
 */
function Progress({ ratio }: { ratio: number }) {
  return (
    <View className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <View
        style={{ width: `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%` }}
        className="h-full rounded-full bg-red-500"
      />
    </View>
  );
}

interface PlanningFocusCardProps {
  item: PlanningEntryItem;
  /** Horloge de l'écran : la carte l'affine seule quand l'émission devient imminente. */
  now: number;
}

/**
 * Carte de tête d'écran : l'émission en cours, ou celle qui arrive.
 *
 * C'est la réponse à la question qu'on se pose en ouvrant l'onglet — qu'est-ce qui passe,
 * et dans combien de temps. Elle porte donc ce que le fil ne peut pas donner sans être
 * déplié : la jauge de temps restant, les visages, et le bouton qui lance le direct.
 */
export function PlanningFocusCard({ item, now: coarse }: PlanningFocusCardProps) {
  const { entry, status } = item;
  const start = Date.parse(entry.startsAt);

  // Dans les dernières minutes, le compte à rebours s'affiche à la seconde : c'est le
  // moment où l'on garde l'écran ouvert en attendant, et où une valeur figée sur
  // « dans 4 min » ferait croire que l'application a décroché.
  const imminent = status === 'upcoming' && start - coarse < PRECISE_COUNTDOWN_MS;
  const now = useNow(imminent ? 1_000 : 30_000);

  const live = status === 'live';
  const { ratio } = entryProgress(entry, now);
  const countdown = formatCountdownPrecise(entry.startsAt, now);
  const login = broadcastLogin(entry);

  return (
    <View
      className={`gap-3 rounded-3xl border p-4 ${
        live ? 'border-red-500/40 bg-red-500/[0.07]' : 'border-white/10 bg-surface-raised'
      }`}
    >
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${live ? 'bg-red-500' : 'bg-zevent-400'}`} />
        <Text
          className={`text-[10px] font-bold uppercase tracking-[1.4px] ${
            live ? 'text-red-400' : 'text-zevent-300'
          }`}
        >
          {live ? 'À l’antenne' : 'Juste après'}
        </Text>
        <View className="flex-1" />
        <Text className="text-xs font-semibold text-gray-400">
          {live ? formatParisRange(entry.startsAt, entry.endsAt) : formatParisTime(entry.startsAt)}
        </Text>
        {live ? null : (
          <Text className="text-xs text-gray-600">{formatDuration(entryDurationMs(entry))}</Text>
        )}
        <ReminderBell entry={entry} now={now} size={17} />
      </View>

      <View className="gap-1.5">
        <Text numberOfLines={2} className="text-xl font-extrabold leading-6 text-white">
          {entry.title}
        </Text>
        <Tags item={item} />
      </View>

      {live ? (
        <View className="gap-1.5">
          <Progress ratio={ratio} />
          <View className="flex-row items-baseline justify-between">
            <Text className="text-[11px] text-gray-500">
              {/* Un créneau au long cours n'a pas de fin qu'on attend : on dit jusqu'à quand
                  il tient plutôt que d'égrener des heures restantes. */}
              {item.longRun
                ? `jusqu’à ${formatParisTime(entry.endsAt ?? entry.startsAt)}`
                : `commencé à ${formatParisTime(entry.startsAt)}`}
            </Text>
            <Text className="text-xs font-semibold text-red-300">
              {formatRemaining(entry, now) ?? ''}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="text-2xl font-extrabold text-zevent-200">{countdown ?? 'imminent'}</Text>
      )}

      {entry.description ? (
        <Text numberOfLines={2} className="text-xs leading-5 text-gray-400">
          {entry.description}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <ParticipantStack participants={entry.participants} />
        {login ? <WatchButton login={login} /> : <View />}
      </View>
    </View>
  );
}
