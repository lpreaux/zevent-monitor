import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import { notificationUrl, PUSH_NOTIFICATIONS_ENABLED } from '@/lib/push';
import { useFavoritesStore } from '@/store/favorites';
import { useNotificationsStore } from '@/store/notifications';

/**
 * Ouvre l'écran visé par une notification (deep link fourni par le backend),
 * qu'elle soit reçue app ouverte ou qu'elle ait démarré l'application.
 */
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    if (!PUSH_NOTIFICATIONS_ENABLED) return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    void import('expo-notifications').then(async (Notifications) => {
      if (cancelled) return;

      const response = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && response) {
        const url = notificationUrl(response);
        if (url) router.push(url as never);
      }

      if (cancelled) return;
      subscription = Notifications.addNotificationResponseReceivedListener((nextResponse) => {
        const url = notificationUrl(nextResponse);
        if (url) router.push(url as never);
      });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);
}

/**
 * Rafraîchit le token push au démarrage (il peut être révoqué ou changer) et pousse
 * les favoris au backend dès qu'ils changent, puisque les alertes en dépendent.
 */
export function useNotificationsSync(): void {
  const favorites = useFavoritesStore((s) => s.favorites);
  const favoritesHydrated = useFavoritesStore((s) => s.hydrated);
  const hydrated = useNotificationsStore((s) => s.hydrated);
  const permission = useNotificationsStore((s) => s.permission);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || permission !== 'granted') return;
    void useNotificationsStore.getState().enablePush();
  }, [hydrated, permission]);

  useEffect(() => {
    if (!hydrated || !favoritesHydrated) return;
    const { identity, syncFavorites } = useNotificationsStore.getState();
    if (!identity) return;

    const signature = [...favorites].sort().join(',');
    if (lastSent.current === signature) return;
    lastSent.current = signature;
    void syncFavorites(favorites);
  }, [favorites, favoritesHydrated, hydrated]);
}
