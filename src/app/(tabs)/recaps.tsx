import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  generateRecap,
  getRecaps,
  getRecapSchedules,
  putRecapSchedules,
  type Recap,
} from '@/api/recaps';
import { SwitchRow } from '@/components/settings-row';
import { TimePicker } from '@/components/time-picker';
import { personalizeRecap } from '@/lib/recap-personalization';
import { useRecapIdentity } from '@/lib/use-recap-identity';
import { useFavoritesStore } from '@/store/favorites';
import { useNotificationsStore } from '@/store/notifications';

const DURATIONS = [
  { minutes: 60, label: '1 h' },
  { minutes: 180, label: '3 h' },
  { minutes: 360, label: '6 h' },
  { minutes: 720, label: '12 h' },
  { minutes: 1440, label: '24 h' },
] as const;

const SUGGESTED_TIMES = ['00:00', '09:00', '13:00', '17:00', '20:00'] as const;
const MIN_MINUTES = 15;
const MAX_MINUTES = 7 * 24 * 60;

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const shortDateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** « 45 min », « 4 h 30 », « 3 j » : lu plus vite qu'une date de début calculée. */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % (24 * 60) === 0 && minutes >= 48 * 60) return `${minutes / (24 * 60)} jours`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

function Chip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
      className={`rounded-full border px-4 py-2 active:opacity-70 ${
        active ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-950'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-zevent-200' : 'text-gray-300'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Carte d'historique : le cumul de la période, puis ce qui concerne les favoris. */
function RecapCard({
  recap,
  favorites,
  onPress,
}: {
  recap: Recap;
  favorites: readonly string[];
  onPress: () => void;
}) {
  const { summary, counts } = recap.content;
  const personal = personalizeRecap(recap.content, favorites);
  const partial = summary.coverage ? !summary.coverage.complete : false;

  return (
    <Pressable
      onPress={onPress}
      className="gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-base font-bold text-white">
            +{euros.format(summary.raisedCents / 100)} sur la période
          </Text>
          {summary.endCents !== null ? (
            <Text className="text-xs text-gray-400">
              Cagnotte à {euros.format(summary.endCents / 100)}
            </Text>
          ) : null}
          <Text className="text-xs text-gray-500">
            {shortDateTime.format(new Date(recap.periodStart))} →{' '}
            {shortDateTime.format(new Date(recap.periodEnd))}
          </Text>
        </View>
        <View className="items-end gap-1">
          <View className="rounded-full bg-zevent-500/20 px-2 py-1">
            <Text className="text-xs font-semibold text-zevent-200">
              {recap.kind === 'manual' ? 'Manuel' : 'Programmé'}
            </Text>
          </View>
          {partial ? <Text className="text-[10px] text-amber-400">Période partielle</Text> : null}
        </View>
      </View>

      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-xs text-gray-300">{counts.goalsReached} goals</Text>
        <Text className="text-xs text-gray-300">{counts.liveStarts} lives</Text>
        <Text className="text-xs text-gray-300">
          Pic {summary.peakViewers.toLocaleString('fr-FR')}
        </Text>
      </View>

      {personal.hasFavoriteContent ? (
        <View className="flex-row items-center gap-2 border-t border-gray-800 pt-3">
          <Ionicons name="star" size={13} color="#fbbf24" />
          <Text className="flex-1 text-xs text-amber-200" numberOfLines={1}>
            {personal.favoriteProgressions.length > 0
              ? `${personal.favoriteProgressions[0]?.display} +${euros.format((personal.favoriteProgressions[0]?.raisedCents ?? 0) / 100)}`
              : `${personal.favoriteLiveStarts.length} favori(s) passé(s) en live`}
            {personal.favoriteGoals.length > 0
              ? ` · ${personal.favoriteGoals.length} goal(s)`
              : ''}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function RecapsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { identity, error: identityError } = useRecapIdentity();
  const favorites = useFavoritesStore((s) => s.favorites);
  const preferences = useNotificationsStore((s) => s.preferences);
  const setPreferences = useNotificationsStore((s) => s.setPreferences);

  const scrollRef = useRef<ScrollView>(null);
  const generatorY = useRef(0);
  const [duration, setDuration] = useState<number>(1440);
  const [customMode, setCustomMode] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const recaps = useQuery({
    queryKey: ['recaps', identity?.installationId],
    queryFn: () => getRecaps(identity!),
    enabled: Boolean(identity),
  });
  const schedules = useQuery({
    queryKey: ['recap-schedules', identity?.installationId],
    queryFn: () => getRecapSchedules(identity!),
    enabled: Boolean(identity),
  });
  const generate = useMutation({
    mutationFn: (minutes: number) => generateRecap(identity!, minutes, Crypto.randomUUID()),
    onSuccess: async (recap) => {
      await queryClient.invalidateQueries({ queryKey: ['recaps', identity?.installationId] });
      router.push(`/recap/${recap.id}` as never);
    },
  });
  const saveSchedules = useMutation({
    mutationFn: (times: string[]) => putRecapSchedules(identity!, times),
    onSuccess: (data) =>
      queryClient.setQueryData(['recap-schedules', identity?.installationId], data),
  });

  const times = schedules.data?.times ?? [];
  const setTimes = (next: string[]) => saveSchedules.mutate([...new Set(next)].sort());

  const parsedCustom = Number(customHours.replace(',', '.'));
  const customMinutes =
    Number.isFinite(parsedCustom) && parsedCustom > 0 ? Math.round(parsedCustom * 60) : 0;
  const chosenDuration = customMode ? customMinutes : duration;
  const durationValid = chosenDuration >= MIN_MINUTES && chosenDuration <= MAX_MINUTES;
  const message = identityError ?? (recaps.error instanceof Error ? recaps.error.message : null);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-950"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-6 p-4 pb-24"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={recaps.isRefetching}
            onRefresh={() => void recaps.refetch()}
            tintColor="#a78bfa"
          />
        }
      >
        <View className="gap-1">
          <Text className="text-2xl font-black text-white">Récapitulatifs</Text>
          <Text className="text-sm text-gray-400">
            Les moments importants d’une période, calculés sans IA et mis en avant selon vos
            favoris.
          </Text>
        </View>

        <View
          onLayout={(event) => {
            generatorY.current = event.nativeEvent.layout.y;
          }}
          className="gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4"
        >
          <Text className="text-lg font-bold text-white">Générer maintenant</Text>
          <View className="flex-row flex-wrap gap-2">
            {DURATIONS.map((item) => (
              <Chip
                key={item.minutes}
                label={item.label}
                active={!customMode && duration === item.minutes}
                onPress={() => {
                  setCustomMode(false);
                  setDuration(item.minutes);
                }}
              />
            ))}
            <Chip
              label="Personnalisé"
              active={customMode}
              onPress={() => setCustomMode(true)}
            />
          </View>

          {customMode ? (
            <View className="gap-2">
              <Text className="text-xs text-gray-400">Durée en heures (0,25 à 168)</Text>
              <TextInput
                value={customHours}
                onChangeText={setCustomHours}
                onFocus={() =>
                  // Remonte la carte en haut de l'écran : elle reste visible clavier ouvert.
                  scrollRef.current?.scrollTo({ y: generatorY.current, animated: true })
                }
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="Ex. 4,5"
                placeholderTextColor="#6b7280"
                className="rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white"
              />
            </View>
          ) : null}

          <Text className="text-xs text-gray-500">
            {durationValid
              ? `Période couverte : les ${formatDuration(chosenDuration)} précédant l’instant de génération.`
              : 'Choisissez une durée entre 15 minutes et 7 jours.'}
          </Text>

          <Pressable
            disabled={!identity || generate.isPending || !durationValid}
            onPress={() => generate.mutate(chosenDuration)}
            className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${
              !identity || generate.isPending || !durationValid ? 'bg-gray-800' : 'bg-zevent-500'
            }`}
          >
            {generate.isPending ? <ActivityIndicator color="white" /> : null}
            <Text
              className={`font-bold ${
                !identity || generate.isPending || !durationValid ? 'text-gray-500' : 'text-white'
              }`}
            >
              Créer le récap
            </Text>
          </Pressable>
          {generate.error ? (
            <Text className="text-sm text-red-400">{generate.error.message}</Text>
          ) : null}
        </View>

        <View className="gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <View>
            <Text className="text-lg font-bold text-white">Récaps programmés</Text>
            <Text className="mt-1 text-xs text-gray-400">
              Chaque période commence exactement à l’horaire précédent. Fuseau de l’appareil.
            </Text>
          </View>

          {times.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {times.map((time) => (
                <Pressable
                  key={time}
                  disabled={!identity || saveSchedules.isPending}
                  onPress={() => setTimes(times.filter((value) => value !== time))}
                  accessibilityLabel={`Retirer l’horaire ${time}`}
                  className="flex-row items-center gap-2 rounded-full border border-zevent-500 bg-zevent-500/20 py-2 pl-4 pr-3 active:opacity-70"
                >
                  <Text className="text-sm font-bold text-zevent-200">{time}</Text>
                  <Ionicons name="close-circle" size={16} color="#c4b5fd" />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-xs text-amber-400">
              Aucun horaire : la planification est désactivée, les récaps manuels restent
              disponibles.
            </Text>
          )}

          <Pressable
            disabled={!identity || saveSchedules.isPending || times.length >= 12}
            onPress={() => setPickerOpen(true)}
            className={`flex-row items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-950 py-3 active:opacity-70 ${
              !identity || times.length >= 12 ? 'opacity-50' : ''
            }`}
          >
            <Ionicons name="time-outline" size={18} color="#c4b5fd" />
            <Text className="text-sm font-semibold text-gray-200">Ajouter un horaire</Text>
          </Pressable>
          {saveSchedules.error ? (
            <Text className="text-sm text-red-400">{saveSchedules.error.message}</Text>
          ) : null}

          <View className="gap-3 border-t border-gray-800 pt-4">
            <SwitchRow
              label="Me notifier quand un récap est prêt"
              hint={
                preferences.enabled
                  ? 'Le récap est enregistré dans tous les cas, même sans notification.'
                  : 'Les alertes sont coupées dans le menu Notifications.'
              }
              value={preferences.recaps.enabled}
              disabled={!preferences.enabled}
              onValueChange={(enabled) =>
                void setPreferences((current) => ({
                  ...current,
                  recaps: { ...current.recaps, enabled },
                }))
              }
            />
            <Pressable
              onPress={() => router.push('/settings/notifications' as never)}
              className="flex-row items-center gap-2 active:opacity-70"
            >
              <Ionicons name="options-outline" size={16} color="#9ca3af" />
              <Text className="flex-1 text-xs text-gray-400">
                Son, vibration et plage silencieuse : menu Notifications
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#6b7280" />
            </Pressable>
          </View>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-white">Historique</Text>
            {recaps.data?.cached ? (
              <Text className="text-xs text-amber-400">Copie hors ligne</Text>
            ) : null}
          </View>
          {!identity && !message ? <ActivityIndicator color="#a78bfa" /> : null}
          {message ? (
            <Text className="rounded-xl bg-red-950 p-3 text-sm text-red-300">{message}</Text>
          ) : null}
          {recaps.data?.recaps.map((recap) => (
            <RecapCard
              key={recap.id}
              recap={recap}
              favorites={favorites}
              onPress={() => router.push(`/recap/${recap.id}` as never)}
            />
          ))}
          {recaps.data?.recaps.length === 0 ? (
            <Text className="py-6 text-center text-gray-500">Aucun récap pour le moment.</Text>
          ) : null}
        </View>
      </ScrollView>

      <TimePicker
        visible={pickerOpen}
        value="09:00"
        title="Horaire du récap"
        confirmLabel="Ajouter"
        taken={times}
        presets={SUGGESTED_TIMES}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(time) => {
          setPickerOpen(false);
          setTimes([...times, time]);
        }}
      />
    </KeyboardAvoidingView>
  );
}
