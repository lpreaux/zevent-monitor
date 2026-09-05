import { useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/expo';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { putDevice, syncAccount } from '@/api/device';
import { useFavoritesStore } from '@/store/favorites';
import { useNotificationsStore } from '@/store/notifications';

export type AccountSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

type TokenGetter = () => Promise<string | null>;

interface AccountSyncState {
  status: AccountSyncStatus;
  error: string | null;
  /** Installations rattachées au compte, d'après la dernière fusion serveur. */
  deviceCount: number;
  lastSyncedAt: string | null;
  /** Dernier compte tenté, réussi ou non : évite une boucle de retry à chaque rendu. */
  lastAttemptedUserId: string | null;
  /** Dernier compte fusionné : empêche un second écran de relancer la fusion. */
  syncedUserId: string | null;
  run: (userId: string, getToken: TokenGetter) => Promise<void>;
  reset: () => void;
}

/**
 * L'état vit dans un store partagé : la racine de l'application et l'écran de
 * profil observent la même synchronisation au lieu d'en déclencher chacun une.
 */
const useAccountSyncStore = create<AccountSyncState>((set, get) => ({
  status: 'idle',
  error: null,
  deviceCount: 0,
  lastSyncedAt: null,
  lastAttemptedUserId: null,
  syncedUserId: null,
  run: async (userId, getToken) => {
    if (get().status === 'syncing') return;
    set({ status: 'syncing', error: null, lastAttemptedUserId: userId });
    try {
      const token = await getToken();
      if (!token) throw new Error('Session Clerk indisponible');
      const notifications = useNotificationsStore.getState();
      const identity = await notifications.ensureIdentity();
      // Un compte fonctionne aussi sans notifications : l'installation doit donc
      // être enregistrée indépendamment du token push.
      await putDevice(identity, {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: Platform.OS,
      });
      const result = await syncAccount(identity, token, {
        preferences: notifications.preferences,
        favorites: useFavoritesStore.getState().favorites,
      });
      notifications.applyAccountPreferences(result.preferences);
      useFavoritesStore.getState().replace(result.favorites);
      set({
        status: 'synced',
        error: null,
        deviceCount: result.deviceCount,
        lastSyncedAt: new Date().toISOString(),
        syncedUserId: userId,
      });
    } catch (cause) {
      set({
        status: 'error',
        error: cause instanceof Error ? cause.message : 'Synchronisation impossible',
      });
    }
  },
  reset: () => set({
    status: 'idle',
    error: null,
    deviceCount: 0,
    lastSyncedAt: null,
    lastAttemptedUserId: null,
    syncedUserId: null,
  }),
}));

export interface AccountSync {
  status: AccountSyncStatus;
  error: string | null;
  deviceCount: number;
  lastSyncedAt: string | null;
  synchronize: () => Promise<void>;
}

/** Rattache automatiquement l'installation après connexion et hydrate les stores locaux. */
export function useAccountSync(): AccountSync {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const status = useAccountSyncStore((s) => s.status);
  const error = useAccountSyncStore((s) => s.error);
  const deviceCount = useAccountSyncStore((s) => s.deviceCount);
  const lastSyncedAt = useAccountSyncStore((s) => s.lastSyncedAt);

  useEffect(() => {
    if (!isLoaded) return;
    const store = useAccountSyncStore.getState();
    if (!isSignedIn || !userId) {
      if (store.lastAttemptedUserId) store.reset();
      return;
    }
    // Une erreur reste visible jusqu'à une action explicite sur « Actualiser ».
    // Sans cette garde, une nouvelle identité de `getToken` peut relancer l'effet
    // après chaque mise à jour Zustand et maintenir artificiellement `syncing`.
    if (store.lastAttemptedUserId === userId) return;
    void store.run(userId, getToken);
  }, [getToken, isLoaded, isSignedIn, userId]);

  const synchronize = useCallback(async () => {
    if (!isSignedIn || !userId) return;
    await useAccountSyncStore.getState().run(userId, getToken);
  }, [getToken, isSignedIn, userId]);

  return {
    status: isSignedIn ? status : 'idle',
    error: isSignedIn ? error : null,
    deviceCount: isSignedIn ? deviceCount : 0,
    lastSyncedAt: isSignedIn ? lastSyncedAt : null,
    synchronize,
  };
}
