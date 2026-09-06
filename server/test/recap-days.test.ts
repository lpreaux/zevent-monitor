import { describe, expect, it } from 'vitest';

import { buildRecapDays } from '../src/recaps/days.js';
import { resolvePeriod } from '../src/routes/recaps.js';
import { sparkline } from '../src/routes/recap-days.js';

const at = (iso: string) => new Date(iso);

/** Week-end 2026 tel qu'il est annoncé : ouverture vendredi 18 h, clôture lundi au petit matin. */
const opening = at('2026-09-04T16:00:00.000Z'); // vendredi 18 h à Paris
const summary = (days: ReturnType<typeof buildRecapDays>) =>
  days.map((day) => [day.title, day.periodStart.toISOString(), day.periodEnd.toISOString()]);

describe('découpage en journées', () => {
  it('coupe à 9 h de Paris et nomme chaque journée', () => {
    const days = buildRecapDays(opening, at('2026-09-07T03:00:00.000Z'), at('2026-09-07T03:05:00.000Z'));

    expect(summary(days)).toEqual([
      ['Ouverture', '2026-09-04T16:00:00.000Z', '2026-09-05T07:00:00.000Z'],
      ['Samedi', '2026-09-05T07:00:00.000Z', '2026-09-06T07:00:00.000Z'],
      ['Dimanche', '2026-09-06T07:00:00.000Z', '2026-09-07T03:00:00.000Z'],
    ]);
  });

  it('marque la dernière journée en cours tant que la collecte tourne', () => {
    const days = buildRecapDays(opening, at('2026-09-05T20:00:00.000Z'), at('2026-09-05T20:00:30.000Z'));

    expect(days.map((day) => day.inProgress)).toEqual([false, true]);
  });

  it('clôt la dernière journée une fois la collecte arrêtée', () => {
    const days = buildRecapDays(opening, at('2026-09-07T03:00:00.000Z'), at('2026-09-09T12:00:00.000Z'));

    expect(days.every((day) => !day.inProgress)).toBe(true);
  });

  it('reverse une ouverture trop courte dans la journée qu’elle annonce', () => {
    // Collecte démarrée à 8 h de Paris : une heure ne fait pas un chapitre.
    const days = buildRecapDays(at('2026-09-05T06:00:00.000Z'), at('2026-09-06T20:00:00.000Z'), at('2026-09-06T20:00:30.000Z'));

    expect(summary(days)).toEqual([
      ['Samedi', '2026-09-05T06:00:00.000Z', '2026-09-06T07:00:00.000Z'],
      ['Dimanche', '2026-09-06T07:00:00.000Z', '2026-09-06T20:00:00.000Z'],
    ]);
  });

  it('donne une clé stable dérivée du jour de début', () => {
    const days = buildRecapDays(opening, at('2026-09-07T03:00:00.000Z'), at('2026-09-07T03:05:00.000Z'));

    expect(days.map((day) => day.key)).toEqual([
      'day-2026-09-04', 'day-2026-09-05', 'day-2026-09-06',
    ]);
  });

  it('ne propose rien tant que la collecte n’a rien à raconter', () => {
    expect(buildRecapDays(null, null)).toEqual([]);
    expect(buildRecapDays(opening, at('2026-09-04T16:05:00.000Z'), at('2026-09-04T16:05:00.000Z'))).toEqual([]);
  });
});

describe('période demandée à la main', () => {
  const now = at('2026-09-05T12:34:56.000Z');

  it('remonte depuis maintenant quand seule une durée est donnée', () => {
    const period = resolvePeriod({ durationMinutes: 180 }, now);

    expect(period).toEqual({
      periodStart: at('2026-09-05T09:34:00.000Z'),
      periodEnd: at('2026-09-05T12:34:00.000Z'),
    });
  });

  it('accepte des bornes explicites, alignées sur la minute', () => {
    const period = resolvePeriod(
      { from: '2026-09-04T18:12:30.000Z', to: '2026-09-05T02:47:45.000Z' },
      now,
    );

    expect(period).toEqual({
      periodStart: at('2026-09-04T18:12:00.000Z'),
      periodEnd: at('2026-09-05T02:47:00.000Z'),
    });
  });

  it('ramène une fin dans le futur à l’instant présent', () => {
    const period = resolvePeriod({ from: '2026-09-05T10:00:00.000Z', to: '2026-09-06T00:00:00.000Z' }, now);

    expect(period).toEqual({
      periodStart: at('2026-09-05T10:00:00.000Z'),
      periodEnd: at('2026-09-05T12:34:00.000Z'),
    });
  });

  it('refuse une plage vide ou hors limites', () => {
    expect(resolvePeriod({ from: '2026-09-05T12:00:00.000Z', to: '2026-09-05T12:05:00.000Z' }, now))
      .toEqual({ error: 'period_too_short' });
    expect(resolvePeriod({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-05T00:00:00.000Z' }, now))
      .toEqual({ error: 'period_too_long' });
  });
});

describe('vignette de courbe', () => {
  it('garde la dernière valeur, celle qui porte le total', () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ cents: index }));

    const reduced = sparkline(points, 10);

    expect(reduced).toHaveLength(10);
    expect(reduced[0]).toBe(0);
    expect(reduced.at(-1)).toBe(99);
  });

  it('laisse une courte série intacte', () => {
    expect(sparkline([{ cents: 1 }, { cents: 2 }], 10)).toEqual([1, 2]);
  });
});
