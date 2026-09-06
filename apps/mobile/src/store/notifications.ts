import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  deleteDevicePushToken,
  getDeviceState,
  putDevice,
  putPreferences,
  type DeviceIdentity,
} from '@/api/device';
import {
  defaultNotificationPreferences,
  mergePreferences,
  type NotificationPreferences,
} from '@/lib/notification-preferences';
import { registerForPushNotifications } from '@/lib/push';
import { zustandStorage } from './storage';

export type PushPermission = 'unknown' | 'granted' | 'denied' | 'unsupported' | 'error';
export type SyncStatus = 'idle' | 'syncing' | 'error';

interface NotificationsState {
  identity: DeviceIdentity | null;
  preferences: NotificationPreferences;
  pushToken: string | null;
  permission: PushPermission;
  permissionReason: string | null;
  sync: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  hydrated: boolean;
  /** Crée au premier lancement l'identité locale utilisée pour authentifier les écritures. */
  ensureIdentity: () => Promise<DeviceIdentity>;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
  setPreferences: (
    update: (current: NotificationPreferences) => NotificationPreferences,
  ) => Promise<void>;
  syncFavorites: (favorites: string[]) => Promise<void>;
  refresh: () => Promise<void>;
  applyAccountPreferences: (preferences: NotificationPreferences) => void;
}

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  } catch {
    return 'Europe/Paris';
  }
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => {
      /** Toute écriture réseau passe par ici : un seul endroit pour l'état de synchro. */
      const withSync = async (run: () => Promise<void>): Promise<void> => {
        set({ sync: 'syncing', syncError: null });
        try {
          await run();
          set({ sync: 'idle', syncError: null, lastSyncedAt: new Date().toISOString() });
        } catch (error) {
          set({
            sync: 'error',
            syncError:
              error instanceof Error ? error.message : 'Synchronisation impossible pour le moment',
          });
        }
      };

      return {
        identity: null,
        preferences: defaultNotificationPreferences(),
        pushToken: null,
        permission: 'unknown',
        permissionReason: null,
        sync: 'idle',
        syncError: null,
        lastSyncedAt: null,
        hydrated: false,

        ensureIdentity: async () => {
          const existing = get().identity;
          if (existing) return existing;
          const identity: DeviceIdentity = {
            installationId: Crypto.randomUUID(),
            secret: toHex(await Crypto.getRandomBytesAsync(32)),
          };
          set({ identity });
          return identity;
        },

        enablePush: async () => {
          const registration = await registerForPushNotifications();
          if (registration.status !== 'granted') {
            set({
              permission: registration.status,
              permissionReason: registration.reason,
              pushToken: null,
            });
            return;
          }

          set({ permission: 'granted', permissionReason: null, pushToken: registration.token });
          await withSync(async () => {
            const identity = await get().ensureIdentity();
            await putDevice(identity, {
              expoPushToken: registration.token,
              timezone: deviceTimezone(),
              platform: Platform.OS,
            });
            await putPreferences(identity, { preferences: get().preferences });
          });
        },

        disablePush: async () => {
          const identity = get().identity;
          set({ pushToken: null });
          if (!identity) return;
          await withSync(() => deleteDevicePushToken(identity));
        },

        setPreferences: async (update) => {
          const preferences = update(get().preferences);
          set({ preferences });
          const identity = get().identity;
          // Sans appareil enregistré les réglages restent locaux : ils partiront
          // au premier enregistrement push.
          if (!identity) return;
          await withSync(async () => {
            await putPreferences(identity, { preferences });
          });
        },

        syncFavorites: async (favorites) => {
          const identity = get().identity;
          if (!identity) return;
          await withSync(async () => {
            await putPreferences(identity, {
              favorites: favorites.map((twitch) => twitch.toLowerCase()),
            });
          });
        },

        refresh: async () => {
          const identity = get().identity;
          if (!identity) return;
          await withSync(async () => {
            const state = await getDeviceState(identity);
            set({
              preferences: mergePreferences(state.preferences),
              pushToken: state.pushEnabled ? get().pushToken : null,
            });
          });
        },
        applyAccountPreferences: (preferences) => {
          set({ preferences: mergePreferences(preferences), lastSyncedAt: new Date().toISOString() });
        },
      };
    },
    {
      name: 'notifications',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        identity: state.identity,
        preferences: state.preferences,
        pushToken: state.pushToken,
        permission: state.permission,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<NotificationsState>;
        return {
          ...current,
          ...saved,
          preferences: mergePreferences(saved.preferences),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/** `true` quand l'appareil est effectivement inscrit aux notifications push. */
export const selectPushEnabled = (state: NotificationsState): boolean =>
  state.permission === 'granted' && Boolean(state.pushToken);
