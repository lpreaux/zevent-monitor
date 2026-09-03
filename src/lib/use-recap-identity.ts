import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { putDevice, type DeviceIdentity } from '@/api/device';
import { useNotificationsStore } from '@/store/notifications';

const timeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch { return 'Europe/Paris'; }
};

/** Garantit que l'identité anonyme locale existe aussi côté serveur, même sans push. */
export function useRecapIdentity(): { identity: DeviceIdentity | null; error: string | null } {
  const hydrated = useNotificationsStore((state) => state.hydrated);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const value = await useNotificationsStore.getState().ensureIdentity();
        await putDevice(value, { timezone: timeZone(), platform: Platform.OS });
        if (!cancelled) setIdentity(value);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Initialisation impossible');
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated]);

  return { identity, error };
}

