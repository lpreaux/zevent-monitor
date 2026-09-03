import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ChoiceChips } from '@/components/choice-chips';
import { SettingsSection, SwitchRow } from '@/components/settings-row';
import {
  BIG_DONATION_THRESHOLDS_CENTS,
  MILESTONE_STEPS_CENTS,
  PAUSE_DURATIONS,
  formatCents,
  formatStepLabel,
  isPauseActive,
  pauseUntil,
  shiftTime,
  type NotificationPreferences,
} from '@/lib/notification-preferences';
import { useFavoritesStore } from '@/store/favorites';
import { selectPushEnabled, useNotificationsStore } from '@/store/notifications';

const stepOptions = MILESTONE_STEPS_CENTS.map((cents) => ({
  key: String(cents),
  label: formatStepLabel(cents),
  value: cents,
}));

const donationOptions = BIG_DONATION_THRESHOLDS_CENTS.map((cents) => ({
  key: String(cents),
  label: formatCents(cents),
  value: cents,
}));

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const preferences = useNotificationsStore((s) => s.preferences);
  const permission = useNotificationsStore((s) => s.permission);
  const permissionReason = useNotificationsStore((s) => s.permissionReason);
  const sync = useNotificationsStore((s) => s.sync);
  const syncError = useNotificationsStore((s) => s.syncError);
  const pushEnabled = useNotificationsStore(selectPushEnabled);
  const enablePush = useNotificationsStore((s) => s.enablePush);
  const disablePush = useNotificationsStore((s) => s.disablePush);
  const setPreferences = useNotificationsStore((s) => s.setPreferences);
  const refresh = useNotificationsStore((s) => s.refresh);
  const favorites = useFavoritesStore((s) => s.favorites);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    (patch: (current: NotificationPreferences) => NotificationPreferences) => {
      void setPreferences(patch);
    },
    [setPreferences],
  );

  const paused = isPauseActive(preferences);
  const alertsOff = !preferences.enabled || paused;

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-12 pt-4">
        <View className="gap-3 rounded-3xl border border-zevent-500/40 bg-zevent-500/10 p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons
              name={pushEnabled ? 'notifications' : 'notifications-off-outline'}
              size={18}
              color="#c4b5fd"
            />
            <Text className="text-base font-bold text-white">
              {pushEnabled ? 'Notifications activées' : 'Notifications désactivées'}
            </Text>
          </View>
          <Text className="text-xs text-gray-300">
            Les alertes sont détectées et envoyées par le backend : elles arrivent même quand
            l’application est fermée.
          </Text>
          {permissionReason ? (
            <Text className="text-xs text-amber-300">{permissionReason}</Text>
          ) : null}
          {syncError ? (
            <Text className="text-xs text-red-300">
              Réglages non synchronisés : {syncError}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void (pushEnabled ? disablePush() : enablePush())}
            accessibilityRole="button"
            className={`items-center rounded-2xl py-3 active:opacity-80 ${
              pushEnabled ? 'border border-gray-700 bg-gray-900' : 'bg-zevent-500'
            }`}
          >
            <Text
              className={`text-sm font-bold ${pushEnabled ? 'text-gray-200' : 'text-white'}`}
            >
              {sync === 'syncing'
                ? 'Synchronisation…'
                : pushEnabled
                  ? 'Désactiver sur cet appareil'
                  : permission === 'denied'
                    ? 'Redemander l’autorisation'
                    : 'Activer les notifications'}
            </Text>
          </Pressable>
        </View>

        <SettingsSection
          title="Interrupteur général"
          description="Suspend toutes les catégories sans perdre leurs réglages."
        >
          <SwitchRow
            label="Recevoir des alertes"
            value={preferences.enabled}
            onValueChange={(enabled) => update((current) => ({ ...current, enabled }))}
          />
          <View className="gap-2">
            <Text className="text-xs text-gray-500">
              {paused
                ? `Suspendu jusqu’au ${new Date(preferences.pausedUntil ?? '').toLocaleString('fr-FR')}`
                : 'Suspendre temporairement'}
            </Text>
            <View className="flex-row gap-2">
              {PAUSE_DURATIONS.map((duration) => (
                <Pressable
                  key={duration.key}
                  onPress={() =>
                    update((current) => ({ ...current, pausedUntil: pauseUntil(duration.ms) }))
                  }
                  className="flex-1 items-center rounded-full border border-gray-800 bg-gray-900 py-2 active:opacity-70"
                >
                  <Text className="text-xs font-semibold text-gray-300">{duration.label}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => update((current) => ({ ...current, pausedUntil: null }))}
                disabled={!paused}
                className={`flex-1 items-center rounded-full border py-2 active:opacity-70 ${
                  paused ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900 opacity-50'
                }`}
              >
                <Text className="text-xs font-semibold text-zevent-200">Reprendre</Text>
              </Pressable>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection
          title="Cagnotte globale"
          description="Une alerte à chaque franchissement du pas choisi."
        >
          <SwitchRow
            label="Paliers de la cagnotte"
            hint={`Actuellement tous les ${formatStepLabel(preferences.globalMilestones.stepCents)}`}
            value={preferences.globalMilestones.enabled}
            disabled={alertsOff}
            onValueChange={(enabled) =>
              update((current) => ({
                ...current,
                globalMilestones: { ...current.globalMilestones, enabled },
              }))
            }
          />
          <ChoiceChips
            options={stepOptions}
            value={preferences.globalMilestones.stepCents}
            disabled={alertsOff || !preferences.globalMilestones.enabled}
            onChange={(stepCents) =>
              update((current) => ({
                ...current,
                globalMilestones: { ...current.globalMilestones, stepCents },
              }))
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Statut de l’événement"
          description="Le badge affiché en haut du dashboard (attente, concert, direct)."
        >
          <SwitchRow
            label="Changement de statut"
            hint="Ouverture du concert, passage en direct, retour en attente"
            value={preferences.websiteMode.enabled}
            disabled={alertsOff}
            onValueChange={(enabled) =>
              update((current) => ({ ...current, websiteMode: { enabled } }))
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Favoris"
          description="Ces alertes ne concernent que les streamers mis en favori."
        >
          <SwitchRow
            label="Démarrage de live"
            value={preferences.favoriteLive.enabled}
            disabled={alertsOff}
            onValueChange={(enabled) =>
              update((current) => ({ ...current, favoriteLive: { enabled } }))
            }
          />
          <SwitchRow
            label="Palier atteint"
            value={preferences.favoriteGoals.enabled}
            disabled={alertsOff}
            onValueChange={(enabled) =>
              update((current) => ({
                ...current,
                favoriteGoals: { ...current.favoriteGoals, enabled },
              }))
            }
          />
          <SwitchRow
            label="Palier bientôt atteint"
            hint="À partir de 90 % du prochain palier"
            value={preferences.favoriteGoals.nearEnabled}
            disabled={alertsOff || !preferences.favoriteGoals.enabled}
            onValueChange={(nearEnabled) =>
              update((current) => ({
                ...current,
                favoriteGoals: { ...current.favoriteGoals, nearEnabled },
              }))
            }
          />
          {favorites.length === 0 ? (
            <Text className="text-xs text-gray-500">
              Aucun favori pour l’instant : ajoutez-en depuis l’onglet Streamers.
            </Text>
          ) : null}
        </SettingsSection>

        <SettingsSection title="Gros dons" description="Seuil global, surchargeable par favori.">
          <SwitchRow
            label="Alerter sur les gros dons"
            hint={`Seuil actuel : ${formatCents(preferences.bigDonations.minCents)}`}
            value={preferences.bigDonations.enabled}
            disabled={alertsOff}
            onValueChange={(enabled) =>
              update((current) => ({
                ...current,
                bigDonations: { ...current.bigDonations, enabled },
              }))
            }
          />
          <ChoiceChips
            options={donationOptions}
            value={preferences.bigDonations.minCents}
            disabled={alertsOff || !preferences.bigDonations.enabled}
            onChange={(minCents) =>
              update((current) => ({
                ...current,
                bigDonations: { ...current.bigDonations, minCents },
              }))
            }
          />
          <SwitchRow
            label="Uniquement pour mes favoris"
            value={preferences.bigDonations.favoritesOnly}
            disabled={alertsOff || !preferences.bigDonations.enabled}
            onValueChange={(favoritesOnly) =>
              update((current) => ({
                ...current,
                bigDonations: { ...current.bigDonations, favoritesOnly },
              }))
            }
          />

          {favorites.map((twitch) => {
            const override = preferences.bigDonations.perStreamerMinCents[twitch];
            return (
              <View key={twitch} className="gap-2 border-t border-gray-800 pt-3">
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {twitch}
                </Text>
                <ChoiceChips
                  options={[
                    { key: 'default', label: 'Seuil global', value: 0 },
                    ...donationOptions,
                  ]}
                  value={override ?? 0}
                  disabled={alertsOff || !preferences.bigDonations.enabled}
                  onChange={(value) =>
                    update((current) => {
                      const perStreamerMinCents = { ...current.bigDonations.perStreamerMinCents };
                      if (value === 0) delete perStreamerMinCents[twitch];
                      else perStreamerMinCents[twitch] = value;
                      return {
                        ...current,
                        bigDonations: { ...current.bigDonations, perStreamerMinCents },
                      };
                    })
                  }
                />
              </View>
            );
          })}
        </SettingsSection>

        <SettingsSection
          title="Récapitulatifs"
          description="Les horaires se règlent dans l’onglet Récaps ; ici, seule la notification."
        >
          <SwitchRow
            label="Prévenir quand un récap est prêt"
            hint="Le récap reste enregistré dans l’historique même sans notification."
            value={preferences.recaps.enabled}
            disabled={alertsOff}
            onValueChange={(enabled) =>
              update((current) => ({ ...current, recaps: { ...current.recaps, enabled } }))
            }
          />
          <SwitchRow
            label="Respecter la plage silencieuse"
            hint="Un récap généré la nuit attend sans faire sonner le téléphone."
            value={preferences.recaps.respectQuietHours}
            disabled={alertsOff || !preferences.recaps.enabled}
            onValueChange={(respectQuietHours) =>
              update((current) => ({
                ...current,
                recaps: { ...current.recaps, respectQuietHours },
              }))
            }
          />
          <Pressable
            onPress={() => router.push('/(tabs)/recaps' as never)}
            accessibilityRole="button"
            className="flex-row items-center gap-2 active:opacity-70"
          >
            <Ionicons name="newspaper-outline" size={16} color="#9ca3af" />
            <Text className="flex-1 text-xs text-gray-400">Gérer les horaires des récaps</Text>
            <Ionicons name="chevron-forward" size={16} color="#6b7280" />
          </Pressable>
        </SettingsSection>

        <SettingsSection
          title="Plage silencieuse"
          description="Aucune notification pendant cette plage, dans le fuseau de l’appareil."
        >
          <SwitchRow
            label="Activer la plage silencieuse"
            value={preferences.quietHours.enabled}
            onValueChange={(enabled) =>
              update((current) => ({
                ...current,
                quietHours: { ...current.quietHours, enabled },
              }))
            }
          />
          <View className="flex-row gap-3">
            {(['start', 'end'] as const).map((bound) => (
              <View key={bound} className="flex-1 gap-2">
                <Text className="text-xs text-gray-500">
                  {bound === 'start' ? 'Début' : 'Fin'}
                </Text>
                <View className="flex-row items-center justify-between rounded-2xl border border-gray-800 bg-gray-900 px-3 py-2">
                  <Pressable
                    accessibilityLabel={`Reculer ${bound === 'start' ? 'le début' : 'la fin'} de 30 minutes`}
                    onPress={() =>
                      update((current) => ({
                        ...current,
                        quietHours: {
                          ...current.quietHours,
                          [bound]: shiftTime(current.quietHours[bound], -30),
                        },
                      }))
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="remove" size={18} color="#c4b5fd" />
                  </Pressable>
                  <Text className="text-base font-bold text-white">
                    {preferences.quietHours[bound]}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Avancer ${bound === 'start' ? 'le début' : 'la fin'} de 30 minutes`}
                    onPress={() =>
                      update((current) => ({
                        ...current,
                        quietHours: {
                          ...current.quietHours,
                          [bound]: shiftTime(current.quietHours[bound], 30),
                        },
                      }))
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="add" size={18} color="#c4b5fd" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </SettingsSection>

        <SettingsSection title="Son et vibration">
          <SwitchRow
            label="Son"
            value={preferences.sound}
            onValueChange={(sound) => update((current) => ({ ...current, sound }))}
          />
          <SwitchRow
            label="Vibration"
            value={preferences.vibration}
            onValueChange={(vibration) => update((current) => ({ ...current, vibration }))}
          />
        </SettingsSection>

        <Text className="px-1 text-xs text-gray-600">
          Les réglages sont enregistrés sur cet appareil puis synchronisés avec le backend, qui
          n’envoie qu’une seule notification par événement.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
