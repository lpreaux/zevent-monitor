import { describe, expect, it } from 'vitest';

import {
  nextScheduleOccurrence,
  previousScheduleOccurrence,
  zonedDateTimeToUtc,
} from '../src/recaps/schedule.js';

describe('planification des récapitulatifs', () => {
  it('convertit un horaire de Paris en UTC', () => {
    expect(zonedDateTimeToUtc({ year: 2026, month: 9, day: 5 }, '09:00', 'Europe/Paris').toISOString())
      .toBe('2026-09-05T07:00:00.000Z');
  });

  it('programme le lendemain quand l’horaire du jour est passé', () => {
    expect(nextScheduleOccurrence('09:00', 'Europe/Paris', new Date('2026-09-05T08:00:00Z')).toISOString())
      .toBe('2026-09-06T07:00:00.000Z');
  });

  it('conserve 09h locale lors du passage à l’heure d’été', () => {
    expect(nextScheduleOccurrence('09:00', 'Europe/Paris', new Date('2026-03-28T08:01:00Z')).toISOString())
      .toBe('2026-03-29T07:00:00.000Z');
  });

  it('forme des périodes contiguës avec plusieurs horaires, minuit compris', () => {
    const times = ['00:00', '09:00', '17:00', '20:00'];
    const atMidnight = new Date('2026-09-05T22:00:00.000Z');
    expect(previousScheduleOccurrence(times, 'Europe/Paris', atMidnight).toISOString())
      .toBe('2026-09-05T18:00:00.000Z');
    const atNine = new Date('2026-09-06T07:00:00.000Z');
    expect(previousScheduleOccurrence(times, 'Europe/Paris', atNine).toISOString())
      .toBe(atMidnight.toISOString());
  });
});
