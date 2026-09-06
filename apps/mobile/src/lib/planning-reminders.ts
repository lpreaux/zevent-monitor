/**
 * Rappels d'émission, programmés sur l'appareil.
 *
 * Rien ne passe par le backend : un rappel ne dépend que d'une heure déjà connue de
 * l'application, et le faire voyager exigerait d'enregistrer un appareil, de synchroniser
 * des préférences, puis de tenir compte des changements de planning côté serveur. Une
 * notification locale programmée à l'avance donne le même service, hors ligne et sans
 * compte — au prix d'une resynchronisation à chaque ouverture de l'écran, quand le
 * planning a bougé (voir `usePlanningRemindersStore`).
 */

import { Platform } from 'react-native';

import type { PlanningEntry } from '@/api/types';
import { ALERTS_CHANNEL_ID, ensureAndroidChannels } from './push';
import { entryStart, formatParisTime } from './planning';

/** Avance du rappel : de quoi lancer un stream sans quitter ce qu'on faisait. */
export const REMINDER_LEAD_MS = 10 * 60_000;

/** Instant auquel la notification doit partir. */
export function reminderAt(entry: PlanningEntry, lead = REMINDER_LEAD_MS): number {
  return entryStart(entry) - lead;
}

/**
 * Un rappel n'a de sens que s'il reste le temps de le recevoir. La marge évite de
 * programmer une notification pour dans deux secondes, que le système peut aussi bien
 * délivrer après le début de l'émission.
 */
const MIN_LEAD_MS = 30_000;

export function canRemind(entry: PlanningEntry, now: number, lead = REMINDER_LEAD_MS): boolean {
  const at = reminderAt(entry, lead);
  return Number.isFinite(at) && at > now + MIN_LEAD_MS;
}

export type ReminderOutcome =
  | { ok: true; notificationId: string }
  | { ok: false; reason: string };

/**
 * Programme le rappel d'une émission et renvoie l'identifiant de la notification, seul
 * moyen de l'annuler ensuite. Les refus (permission, plateforme) remontent en clair :
 * l'écran doit pouvoir le dire plutôt que d'afficher une cloche qui ne sonnera pas.
 */
export async function scheduleReminder(
  entry: PlanningEntry,
  lead = REMINDER_LEAD_MS,
): Promise<ReminderOutcome> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'Les rappels ne sont disponibles que sur mobile.' };
  }
  const at = reminderAt(entry, lead);
  if (!Number.isFinite(at)) return { ok: false, reason: 'Horaire inconnu.' };

  try {
    const Notifications = await import('expo-notifications');
    await ensureAndroidChannels();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) {
      return { ok: false, reason: 'Autorisez les notifications pour recevoir les rappels.' };
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: entry.title,
        body: `Ça commence à ${formatParisTime(entry.startsAt)}.`,
        data: { url: '/(tabs)/planning' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
        channelId: ALERTS_CHANNEL_ID,
      },
    });
    return { ok: true, notificationId };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Rappel impossible à programmer.',
    };
  }
}

/** Annule un rappel. Un identifiant devenu inconnu du système n'est pas une erreur. */
export async function cancelReminder(notificationId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Rappel déjà parti ou déjà annulé : il n'y a rien à rattraper.
  }
}
