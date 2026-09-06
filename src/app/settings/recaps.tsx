import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { getRecapSchedules, putRecapSchedules } from '@/api/recaps';
import { AppHeader } from '@/components/app-header';
import { ScreenShell } from '@/components/screen-shell';
import { SectionHeader } from '@/components/section-header';
import { SwitchRow } from '@/components/settings-row';
import { TimePicker } from '@/components/time-picker';
import { useRecapIdentity } from '@/lib/use-recap-identity';
import { useNotificationsStore } from '@/store/notifications';

/** Horaires courants d'un week-end de ZEvent : le réveil, la reprise, la soirée, la nuit. */
const SUGGESTED_TIMES = ['00:00', '09:00', '13:00', '17:00', '20:00'] as const;

/** Au-delà, les récaps se chevauchent plus qu'ils n'informent. */
const MAX_TIMES = 12;

/**
 * Réglages des récaps programmés.
 *
 * Sortis de l'onglet : on choisit ses horaires une fois, en début de week-end, alors qu'on
 * revient lire les récaps vingt fois. Les laisser en tête de l'onglet faisait payer ce
 * réglage unique à chaque consultation.
 */
export default function RecapSettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { identity, error: identityError } = useRecapIdentity();
  const preferences = useNotificationsStore((s) => s.preferences);
  const setPreferences = useNotificationsStore((s) => s.setPreferences);
  const [pickerOpen, setPickerOpen] = useState(false);

  const schedules = useQuery({
    queryKey: ['recap-schedules', identity?.installationId],
    queryFn: () => getRecapSchedules(identity!),
    enabled: Boolean(identity),
  });
  const save = useMutation({
    mutationFn: (times: string[]) => putRecapSchedules(identity!, times),
    onSuccess: (data) =>
      queryClient.setQueryData(['recap-schedules', identity?.installationId], data),
  });

  const times = schedules.data?.times ?? [];
  const setTimes = (next: string[]) => save.mutate([...new Set(next)].sort());

  return (
    <ScreenShell
      header={
        <AppHeader
          title="Réglages des récaps"
          compact
          onBack={() => router.back()}
        />
      }
    >
      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-5 pb-16">
        <View className="gap-3">
          <SectionHeader
            title="Récaps programmés"
            hint="Chaque période commence exactement à l’horaire précédent, dans le fuseau de l’appareil."
          />

          {times.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {times.map((time) => (
                <Pressable
                  key={time}
                  disabled={!identity || save.isPending}
                  onPress={() => setTimes(times.filter((value) => value !== time))}
                  accessibilityRole="button"
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
              Aucun horaire : rien n’est généré automatiquement. Les journées de l’événement et
              les récaps créés à la main restent disponibles.
            </Text>
          )}

          <Pressable
            disabled={!identity || save.isPending || times.length >= MAX_TIMES}
            onPress={() => setPickerOpen(true)}
            className={`flex-row items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 active:opacity-70 ${
              !identity || times.length >= MAX_TIMES ? 'opacity-50' : ''
            }`}
          >
            <Ionicons name="time-outline" size={18} color="#c4b5fd" />
            <Text className="text-sm font-semibold text-gray-200">Ajouter un horaire</Text>
          </Pressable>

          {identityError ? (
            <Text className="text-sm text-red-400">{identityError}</Text>
          ) : save.error ? (
            <Text className="text-sm text-red-400">{save.error.message}</Text>
          ) : null}
        </View>

        <View className="gap-3">
          <SectionHeader
            title="Notification"
            hint="Le récap est enregistré dans tous les cas : seule l’alerte est concernée."
          />
          <SwitchRow
            label="Me prévenir quand un récap est prêt"
            hint={
              preferences.enabled
                ? 'Vous le retrouvez dans l’onglet Récaps même sans notification.'
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

        <View className="gap-3">
          <SectionHeader title="Journées de l’événement" />
          <Text className="text-xs leading-5 text-gray-500">
            En plus de vos récaps, l’application publie une journée par tranche de 9 h à 9 h,
            heure de Paris. Elles sont les mêmes pour tout le monde et couvrent le week-end
            depuis son ouverture : rien à programmer, rien à rattraper.
          </Text>
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
    </ScreenShell>
  );
}
