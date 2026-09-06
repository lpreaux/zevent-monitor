import { describe, expect, it } from 'vitest';

import {
  defaultNotificationPreferences,
  formatStepLabel,
  isPauseActive,
  mergePreferences,
  pauseUntil,
  shiftTime,
} from '../src/lib/notification-preferences';

describe('mergePreferences', () => {
  it('complète un enregistrement partiel sans perdre les valeurs connues', () => {
    const merged = mergePreferences({
      bigDonations: { minCents: 25_000 } as never,
      favoriteLive: { enabled: false },
    });

    expect(merged.bigDonations.minCents).toBe(25_000);
    expect(merged.bigDonations.enabled).toBe(true);
    expect(merged.favoriteLive.enabled).toBe(false);
    expect(merged.favoriteGoals.enabled).toBe(true);
  });

  it('retourne les valeurs par défaut sans état enregistré', () => {
    expect(mergePreferences(null)).toEqual(defaultNotificationPreferences());
  });
});

describe('suspension temporaire', () => {
  const now = new Date('2026-09-05T20:00:00.000Z');

  it('calcule une échéance à partir de la durée choisie', () => {
    expect(pauseUntil(3_600_000, now)).toBe('2026-09-05T21:00:00.000Z');
  });

  it('expire d’elle-même', () => {
    const preferences = defaultNotificationPreferences();

    expect(isPauseActive({ ...preferences, pausedUntil: '2026-09-05T21:00:00.000Z' }, now)).toBe(true);
    expect(isPauseActive({ ...preferences, pausedUntil: '2026-09-05T19:00:00.000Z' }, now)).toBe(false);
    expect(isPauseActive(preferences, now)).toBe(false);
  });
});

describe('plage silencieuse', () => {
  it('avance et recule par pas de 30 minutes', () => {
    expect(shiftTime('23:30', 30)).toBe('00:00');
    expect(shiftTime('00:00', -30)).toBe('23:30');
    expect(shiftTime('08:00', 30)).toBe('08:30');
  });
});

describe('formatStepLabel', () => {
  it('abrège les paliers en k€ et M€', () => {
    expect(formatStepLabel(100_000_000)).toBe('1 M€');
    expect(formatStepLabel(25_000_000)).toBe('250 k€');
    expect(formatStepLabel(50_000)).toBe('500 €');
  });
});
