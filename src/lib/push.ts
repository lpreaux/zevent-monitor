import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type { NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Expo Go ne prend pas en charge les notifications push distantes. On ne les
 * initialise donc que dans une build de production (preview/production EAS).
 */
export const PUSH_NOTIFICATIONS_ENABLED = !__DEV__;

if (PUSH_NOTIFICATIONS_ENABLED) {
  void import('expo-notifications').then((Notifications) => {
    /** Notifications affichées même quand l'app est au premier plan (bannière + son). */
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  });
}

export const ALERTS_CHANNEL_ID = 'alerts';
export const SILENT_CHANNEL_ID = 'alerts-silent';

/**
 * Deux canaux Android : le serveur choisit l'un ou l'autre selon la préférence
 * « vibration », Android ne permettant pas de la changer après création du canal.
 */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await import('expo-notifications');
  await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    name: 'Alertes ZEvent',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#a78bfa',
  });
  await Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
    name: 'Alertes ZEvent (sans vibration)',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: null,
    enableVibrate: false,
  });
}

export type PushRegistration =
  | { status: 'granted'; token: string }
  | { status: 'denied' | 'unsupported' | 'error'; reason: string };

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

/**
 * Demande l'autorisation puis récupère le token Expo Push de cet appareil.
 * Sans permission ni token, l'app reste pleinement utilisable : seules les alertes
 * en arrière-plan sont perdues (cf. PLAN.md §5).
 */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (!PUSH_NOTIFICATIONS_ENABLED) {
    return {
      status: 'unsupported',
      reason: 'Les notifications push sont désactivées en mode développement.',
    };
  }

  if (!Device.isDevice) {
    return { status: 'unsupported', reason: "Les notifications push exigent un appareil réel." };
  }

  try {
    const Notifications = await import('expo-notifications');
    await ensureAndroidChannels();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) {
      return {
        status: 'denied',
        reason: 'Autorisation refusée. Activez les notifications dans les réglages Android.',
      };
    }

    const id = projectId();
    if (!id) {
      return {
        status: 'error',
        reason: "Identifiant de projet EAS absent : lancez `eas init` puis reconstruisez l'APK.",
      };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { status: 'granted', token: token.data };
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'Enregistrement push impossible',
    };
  }
}

/** Route interne à ouvrir au tap sur une notification (fournie par le backend). */
export function notificationUrl(response: NotificationResponse): string | null {
  const data = response.notification.request.content.data as { url?: unknown } | undefined;
  return typeof data?.url === 'string' && data.url.startsWith('/') ? data.url : null;
}
