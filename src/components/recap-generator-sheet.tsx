import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { RecapRequest } from '@/api/recaps';
import { Segmented } from '@/components/segmented';
import { TimePicker } from '@/components/time-picker';
import { Button, ButtonRow } from '@/components/ui/button';
import { icons } from '@/lib/icons';
import { formatDuration } from '@/lib/recap-view';

/** Durées proposées d'un geste, du coup d'œil au bilan de la veille. */
const DURATIONS = [
  { minutes: 60, label: '1 h' },
  { minutes: 180, label: '3 h' },
  { minutes: 360, label: '6 h' },
  { minutes: 720, label: '12 h' },
  { minutes: 1440, label: '24 h' },
] as const;

const MIN_MINUTES = 15;
const MAX_MINUTES = 7 * 24 * 60;
const MINUTE_MS = 60_000;

const dayChip = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const dayFull = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

type Mode = 'duration' | 'period';

const MODES: readonly { key: Mode; label: string }[] = [
  { key: 'duration', label: 'Durée' },
  { key: 'period', label: 'Période' },
];

const pad = (value: number) => String(value).padStart(2, '0');
const timeOf = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Combine un jour civil et une heure locale en un instant. */
function combine(day: Date, time: string): Date {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
}

function Chip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      className={`rounded-full border px-3.5 py-2 active:opacity-70 ${
        active ? 'border-zevent-500 bg-zevent-500/20' : 'border-white/10 bg-white/5'
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-zevent-200' : 'text-gray-400'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Une borne de la période : le jour d'un côté, l'heure de l'autre. */
function Bound({
  label, days, value, onChange, onPickTime,
}: {
  label: string;
  days: readonly Date[];
  value: Date;
  onChange: (next: Date) => void;
  onPickTime: () => void;
}) {
  const selectedDay = startOfDay(value).getTime();
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</Text>
      <View className="flex-row items-center gap-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-2">
          {days.map((day) => (
            <Chip
              key={day.toISOString()}
              label={dayChip.format(day)}
              active={day.getTime() === selectedDay}
              onPress={() => onChange(combine(day, timeOf(value)))}
            />
          ))}
        </ScrollView>
        <Button
          size="sm"
          variant="neutral"
          icon={icons.time}
          label={clock.format(value)}
          accessibilityLabel={`Changer l’heure de ${label.toLowerCase()}`}
          onPress={onPickTime}
        />
      </View>
    </View>
  );
}

interface RecapGeneratorSheetProps {
  visible: boolean;
  /** Fenêtre réellement collectée : elle borne ce qu'on peut demander. */
  window: { start: string; end: string } | null;
  pending: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (request: RecapRequest) => void;
}

/**
 * Demande d'un récap, en deux façons de désigner une période.
 *
 * « Durée » répond à « qu'est-ce que j'ai raté ? » et n'a besoin que d'un chiffre.
 * « Période » répond à « que s'est-il passé samedi soir ? », question qu'aucune durée
 * comptée depuis maintenant ne sait poser une fois la nuit passée. Les deux produisent la
 * même chose : ce sont deux entrées vers un même récap, pas deux objets différents.
 */
export function RecapGeneratorSheet(props: RecapGeneratorSheetProps) {
  // Remonté à l'ouverture : les bornes par défaut se calculent sur l'heure qu'il est.
  if (!props.visible) return null;
  return <Sheet {...props} />;
}

function Sheet({ window: collected, pending, error, onCancel, onSubmit }: RecapGeneratorSheetProps) {
  const now = useMemo(() => new Date(), []);
  const eventStart = useMemo(
    () => (collected ? new Date(collected.start) : null),
    [collected],
  );

  const [mode, setMode] = useState<Mode>('duration');
  const [duration, setDuration] = useState(360);
  const [from, setFrom] = useState<Date>(() => new Date(now.getTime() - 6 * 60 * MINUTE_MS));
  const [to, setTo] = useState<Date>(now);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  /** Jours proposés : ceux que la collecte couvre, pas ceux du calendrier. */
  const days = useMemo(() => {
    const first = startOfDay(eventStart ?? new Date(now.getTime() - 2 * 24 * 60 * MINUTE_MS));
    const last = startOfDay(now);
    const list: Date[] = [];
    for (let day = first; day <= last; day = new Date(day.getTime() + 24 * 60 * MINUTE_MS)) {
      list.push(startOfDay(day));
    }
    return list;
  }, [eventStart, now]);

  const shortcuts = useMemo(() => {
    const today = startOfDay(now);
    const yesterday = new Date(today.getTime() - 24 * 60 * MINUTE_MS);
    return [
      { label: 'La nuit dernière', from: combine(yesterday, '22:00'), to: combine(today, '08:00') },
      { label: 'Hier soir', from: combine(yesterday, '18:00'), to: combine(today, '00:00') },
      { label: 'Journée d’hier', from: combine(yesterday, '09:00'), to: combine(today, '09:00') },
      ...(eventStart ? [{ label: 'Depuis le début', from: eventStart, to: now }] : []),
    ].filter((shortcut) => shortcut.to.getTime() <= now.getTime() + MINUTE_MS);
  }, [now, eventStart]);

  const minutes = mode === 'duration' ? duration : (to.getTime() - from.getTime()) / MINUTE_MS;
  const tooShort = minutes < MIN_MINUTES;
  const tooLong = minutes > MAX_MINUTES;
  const inFuture = mode === 'period' && to.getTime() > now.getTime() + MINUTE_MS;
  const valid = !tooShort && !tooLong && !inFuture;

  const beforeCollection =
    mode === 'period' && eventStart !== null && from.getTime() < eventStart.getTime();

  const notice = tooShort
    ? 'Une période de moins de quinze minutes n’a rien à raconter.'
    : tooLong
      ? 'Sept jours au maximum.'
      : inFuture
        ? 'La fin ne peut pas être dans le futur.'
        : beforeCollection && eventStart
          ? `La collecte n’a démarré que le ${dayFull.format(eventStart)} à ${clock.format(eventStart)} : le début de la période sera vide.`
          : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 justify-end bg-black/70" onPress={onCancel} accessibilityLabel="Fermer">
        <Pressable
          onPress={() => {}}
          className="gap-4 rounded-t-3xl border-t border-white/10 bg-surface p-5 pb-8"
        >
          <View className="items-center gap-2">
            <View className="h-1 w-10 rounded-full bg-gray-700" />
            <Text className="mt-1 text-base font-bold text-white">Nouveau récap</Text>
          </View>

          <Segmented options={MODES} value={mode} onChange={setMode} />

          {mode === 'duration' ? (
            <View className="gap-3">
              <View className="flex-row flex-wrap gap-2">
                {DURATIONS.map((item) => (
                  <Chip
                    key={item.minutes}
                    label={item.label}
                    active={duration === item.minutes}
                    onPress={() => setDuration(item.minutes)}
                  />
                ))}
              </View>
              <Text className="text-xs text-gray-500">
                Les {formatDuration(duration)} qui précèdent maintenant.
              </Text>
            </View>
          ) : (
            <View className="gap-4">
              {shortcuts.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                  {shortcuts.map((shortcut) => (
                    <Chip
                      key={shortcut.label}
                      label={shortcut.label}
                      active={
                        from.getTime() === shortcut.from.getTime() &&
                        to.getTime() === shortcut.to.getTime()
                      }
                      onPress={() => {
                        setFrom(shortcut.from);
                        setTo(shortcut.to);
                      }}
                    />
                  ))}
                </ScrollView>
              ) : null}

              <Bound label="Début" days={days} value={from} onChange={setFrom} onPickTime={() => setPicking('from')} />
              <Bound label="Fin" days={days} value={to} onChange={setTo} onPickTime={() => setPicking('to')} />

              <Text className="text-xs text-gray-500">
                {dayFull.format(from)} {clock.format(from)} → {dayFull.format(to)} {clock.format(to)}
                {valid ? ` · ${formatDuration(minutes)}` : ''}
              </Text>
            </View>
          )}

          {notice ? (
            <View className="flex-row gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
              <Ionicons name="alert-circle-outline" size={15} color="#fbbf24" />
              <Text className="flex-1 text-[11px] leading-4 text-amber-200">{notice}</Text>
            </View>
          ) : null}
          {error ? <Text className="text-sm text-red-400">{error}</Text> : null}

          <ButtonRow>
            <Button grow size="lg" variant="neutral" label="Annuler" onPress={onCancel} />
            <Button
              grow
              size="lg"
              label="Créer"
              disabled={!valid}
              loading={pending}
              onPress={() =>
                onSubmit(
                  mode === 'duration'
                    ? { durationMinutes: duration }
                    : { from: from.toISOString(), to: to.toISOString() },
                )
              }
            />
          </ButtonRow>
        </Pressable>
      </Pressable>

      <TimePicker
        visible={picking !== null}
        value={timeOf(picking === 'to' ? to : from)}
        title={picking === 'to' ? 'Fin de la période' : 'Début de la période'}
        minuteStep={15}
        onCancel={() => setPicking(null)}
        onConfirm={(time) => {
          const target = picking;
          setPicking(null);
          if (target === 'to') setTo((current) => combine(current, time));
          else setFrom((current) => combine(current, time));
        }}
      />
    </Modal>
  );
}
