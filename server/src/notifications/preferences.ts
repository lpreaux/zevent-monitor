import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format attendu HH:MM');

/**
 * Préférences de notification d'un appareil. Chaque catégorie est indépendante :
 * la désactivation de l'une ne modifie jamais les réglages des autres (cf. PLAN.md §7).
 */
export const notificationPreferencesSchema = z.object({
  /** Interrupteur global « tout suspendre ». */
  enabled: z.boolean().default(true),
  /** Suspension temporaire ; ISO 8601 ou `null`. */
  pausedUntil: z.iso.datetime({ offset: true }).nullable().default(null),
  sound: z.boolean().default(true),
  vibration: z.boolean().default(true),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: hhmm.default('00:00'),
      end: hhmm.default('08:00'),
    })
    .prefault({}),
  globalMilestones: z
    .object({
      enabled: z.boolean().default(true),
      /** Pas de progression, en centimes (1 M€ par défaut). */
      stepCents: z.number().int().min(100_000).default(100_000_000),
      /** Seuils supplémentaires ponctuels, en centimes. */
      extraCents: z.array(z.number().int().positive()).max(20).default([]),
    })
    .prefault({}),
  /** Passage de l'événement en attente / concert / direct. */
  websiteMode: z.object({ enabled: z.boolean().default(true) }).prefault({}),
  favoriteLive: z.object({ enabled: z.boolean().default(true) }).prefault({}),
  favoriteGoals: z
    .object({
      enabled: z.boolean().default(true),
      /** Alerte « prochain palier proche » en plus du palier atteint. */
      nearEnabled: z.boolean().default(false),
    })
    .prefault({}),
  bigDonations: z
    .object({
      enabled: z.boolean().default(true),
      /** Seuil global, en centimes (500 € par défaut). */
      minCents: z.number().int().min(100).default(50_000),
      favoritesOnly: z.boolean().default(false),
      /** Surcharge du seuil par login Twitch, en centimes. */
      perStreamerMinCents: z.record(z.string(), z.number().int().min(100)).prefault({}),
    })
    .prefault({}),
  /**
   * Récapitulatifs programmés. Les horaires eux-mêmes vivent dans `recap_schedules` :
   * ici on ne règle que la notification envoyée quand un récap devient disponible.
   */
  recaps: z
    .object({
      enabled: z.boolean().default(true),
      /** Respecte la plage silencieuse : le récap est généré, mais sans notification. */
      respectQuietHours: z.boolean().default(true),
    })
    .prefault({}),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const defaultPreferences = (): NotificationPreferences =>
  notificationPreferencesSchema.parse({});

/** Tolère un enregistrement ancien ou partiel : les champs manquants reprennent leur défaut. */
export function parsePreferences(value: unknown): NotificationPreferences {
  const parsed = notificationPreferencesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : defaultPreferences();
}

/** Nombre maximal de paliers notifiés d'un coup après une longue interruption de collecte. */
const MAX_MILESTONES_PER_TICK = 5;

/**
 * Seuils franchis dans l'intervalle `]previousCents, currentCents]`, triés croissants :
 * multiples du pas configuré et seuils supplémentaires.
 */
export function milestonesCrossed(
  previousCents: number,
  currentCents: number,
  preferences: NotificationPreferences,
): number[] {
  const { enabled, stepCents, extraCents } = preferences.globalMilestones;
  if (!enabled || currentCents <= previousCents) return [];

  const thresholds = new Set<number>(extraCents);
  const firstStep = Math.floor(previousCents / stepCents) + 1;
  const lastStep = Math.floor(currentCents / stepCents);
  for (let step = firstStep; step <= lastStep; step += 1) {
    thresholds.add(step * stepCents);
  }

  const crossed = [...thresholds]
    .filter((threshold) => threshold > previousCents && threshold <= currentCents)
    .sort((a, b) => a - b);

  // Après une panne prolongée on ne garde que les derniers paliers, pour ne pas noyer l'appareil.
  return crossed.slice(-MAX_MILESTONES_PER_TICK);
}

function minutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return (hour % 24) * 60 + minute;
}

function toMinutes(hhmmValue: string): number {
  const [hours, minutes] = hhmmValue.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Plage silencieuse évaluée dans le fuseau de l'appareil, passage de minuit compris. */
export function isQuietHour(
  now: Date,
  timeZone: string,
  preferences: NotificationPreferences,
): boolean {
  const { enabled, start, end } = preferences.quietHours;
  if (!enabled) return false;

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === endMinutes) return false;

  const current = minutesOfDay(now, timeZone);
  return startMinutes < endMinutes
    ? current >= startMinutes && current < endMinutes
    : current >= startMinutes || current < endMinutes;
}

export function isPaused(now: Date, preferences: NotificationPreferences): boolean {
  if (!preferences.enabled) return true;
  if (!preferences.pausedUntil) return false;
  const until = Date.parse(preferences.pausedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/** Seuil applicable à un don, en tenant compte de la surcharge par streamer. */
export function donationThresholdCents(
  twitch: string | null,
  preferences: NotificationPreferences,
): number {
  const override = twitch
    ? preferences.bigDonations.perStreamerMinCents[twitch.toLowerCase()]
    : undefined;
  return override ?? preferences.bigDonations.minCents;
}
