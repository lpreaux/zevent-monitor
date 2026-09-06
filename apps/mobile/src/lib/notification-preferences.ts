/**
 * Miroir des préférences de notification du backend (`apps/api/src/notifications/preferences.ts`).
 * Le serveur reste l'autorité : il valide et complète tout objet reçu.
 */
export interface NotificationPreferences {
  enabled: boolean;
  /** ISO 8601, ou `null` si aucune suspension temporaire n'est active. */
  pausedUntil: string | null;
  sound: boolean;
  vibration: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  globalMilestones: { enabled: boolean; stepCents: number; extraCents: number[] };
  /** Passage de l'événement en attente / concert / direct. */
  websiteMode: { enabled: boolean };
  favoriteLive: { enabled: boolean };
  favoriteGoals: { enabled: boolean; nearEnabled: boolean };
  bigDonations: {
    enabled: boolean;
    minCents: number;
    favoritesOnly: boolean;
    perStreamerMinCents: Record<string, number>;
  };
  /** Un don dépasse le plus gros don observé jusque-là (plancher fixé côté serveur). */
  recordDonations: { enabled: boolean };
  /** Notification envoyée quand un récapitulatif programmé devient disponible. */
  recaps: { enabled: boolean; respectQuietHours: boolean };
}

export const defaultNotificationPreferences = (): NotificationPreferences => ({
  enabled: true,
  pausedUntil: null,
  sound: true,
  vibration: true,
  quietHours: { enabled: false, start: '00:00', end: '08:00' },
  globalMilestones: { enabled: true, stepCents: 100_000_000, extraCents: [] },
  websiteMode: { enabled: true },
  favoriteLive: { enabled: true },
  favoriteGoals: { enabled: true, nearEnabled: false },
  bigDonations: { enabled: true, minCents: 50_000, favoritesOnly: false, perStreamerMinCents: {} },
  recordDonations: { enabled: true },
  recaps: { enabled: true, respectQuietHours: true },
});

/** Fusion tolérante : un réglage absent (ancienne version, réponse partielle) reprend son défaut. */
export function mergePreferences(
  value: Partial<NotificationPreferences> | null | undefined,
): NotificationPreferences {
  const defaults = defaultNotificationPreferences();
  if (!value) return defaults;
  return {
    ...defaults,
    ...value,
    quietHours: { ...defaults.quietHours, ...value.quietHours },
    globalMilestones: { ...defaults.globalMilestones, ...value.globalMilestones },
    websiteMode: { ...defaults.websiteMode, ...value.websiteMode },
    favoriteLive: { ...defaults.favoriteLive, ...value.favoriteLive },
    favoriteGoals: { ...defaults.favoriteGoals, ...value.favoriteGoals },
    bigDonations: { ...defaults.bigDonations, ...value.bigDonations },
    recordDonations: { ...defaults.recordDonations, ...value.recordDonations },
    recaps: { ...defaults.recaps, ...value.recaps },
  };
}

/** Pas de progression proposés pour les paliers de la cagnotte globale. */
export const MILESTONE_STEPS_CENTS = [
  25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000,
] as const;

/** Seuils de « gros don » proposés. */
export const BIG_DONATION_THRESHOLDS_CENTS = [
  10_000, 25_000, 50_000, 100_000, 500_000,
] as const;

const eurosCompact = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function formatCents(cents: number): string {
  return eurosCompact.format(cents / 100);
}

/** Étiquette courte pour un pas de palier (« 1 M€ », « 250 k€ »). */
export function formatStepLabel(cents: number): string {
  const euros = cents / 100;
  if (euros >= 1_000_000) return `${(euros / 1_000_000).toLocaleString('fr-FR')} M€`;
  if (euros >= 1_000) return `${(euros / 1_000).toLocaleString('fr-FR')} k€`;
  return `${euros.toLocaleString('fr-FR')} €`;
}

export const PAUSE_DURATIONS = [
  { key: '1h', label: '1 h', ms: 3_600_000 },
  { key: '3h', label: '3 h', ms: 10_800_000 },
  { key: '12h', label: '12 h', ms: 43_200_000 },
] as const;

export function pauseUntil(durationMs: number, now = new Date()): string {
  return new Date(now.getTime() + durationMs).toISOString();
}

/** `true` tant que la suspension temporaire enregistrée est encore valide. */
export function isPauseActive(
  preferences: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  if (!preferences.pausedUntil) return false;
  const until = Date.parse(preferences.pausedUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/** Décalage horaire d'une plage silencieuse, par pas de 30 minutes. */
export function shiftTime(value: string, minutes: number): string {
  const [hours = '0', mins = '0'] = value.split(':');
  const total = (((Number(hours) * 60 + Number(mins) + minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
