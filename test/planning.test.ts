import { describe, expect, it } from 'vitest';

import type { PlanningEntry } from '../src/api/types';
import {
  entryDurationMs,
  entryProgress,
  entryStatus,
  formatCountdown,
  formatCountdownPrecise,
  formatDuration,
  formatParisDayLabel,
  formatParisDayShort,
  formatParisRange,
  formatParisTime,
  formatRemaining,
  isLongRun,
  parisDayKey,
  parisOffsetMinutes,
} from '../src/lib/planning';

function entry(partial: Partial<PlanningEntry> & { startsAt: string }): PlanningEntry {
  return {
    id: partial.id ?? partial.startsAt,
    title: partial.title ?? 'Émission',
    description: partial.description ?? '',
    endsAt: partial.endsAt ?? null,
    allDay: partial.allDay ?? false,
    source: partial.source ?? 'ingdoc',
    participants: partial.participants ?? [],
    startsAt: partial.startsAt,
  };
}

describe('heure de Paris', () => {
  it('applique la règle européenne de changement d’heure', () => {
    expect(parisOffsetMinutes(Date.parse('2026-01-15T12:00:00Z'))).toBe(60);
    expect(parisOffsetMinutes(Date.parse('2026-09-05T12:00:00Z'))).toBe(120);
    // Bascules 2026 : 29 mars et 25 octobre à 01:00 UTC.
    expect(parisOffsetMinutes(Date.parse('2026-03-29T00:59:00Z'))).toBe(60);
    expect(parisOffsetMinutes(Date.parse('2026-03-29T01:00:00Z'))).toBe(120);
    expect(parisOffsetMinutes(Date.parse('2026-10-25T00:59:00Z'))).toBe(120);
    expect(parisOffsetMinutes(Date.parse('2026-10-25T01:00:00Z'))).toBe(60);
  });

  it('formate les horaires du week-end en heure locale française', () => {
    expect(formatParisTime('2026-09-04T16:00:00Z')).toBe('18h00');
    expect(formatParisRange('2026-09-03T18:00:00Z', '2026-09-03T21:30:00Z')).toBe('20h00 – 23h30');
    expect(formatParisRange('2026-09-06T18:00:00Z', null)).toBe('20h00');
    expect(formatParisDayLabel('2026-09-04T16:00:00Z')).toBe('vendredi 4 septembre');
  });

  it('rattache une émission de fin de soirée au bon jour parisien', () => {
    // 5 septembre 22h30 UTC = 6 septembre 00h30 à Paris.
    expect(parisDayKey('2026-09-05T22:30:00Z')).toBe('2026-09-06');
    expect(formatParisDayLabel('2026-09-05T22:30:00Z')).toBe('dimanche 6 septembre');
  });
});

describe('entryStatus', () => {
  const show = entry({ startsAt: '2026-09-05T13:00:00Z', endsAt: '2026-09-05T15:00:00Z' });

  it('classe une entrée selon son créneau', () => {
    expect(entryStatus(show, Date.parse('2026-09-05T12:59:00Z'))).toBe('upcoming');
    expect(entryStatus(show, Date.parse('2026-09-05T13:00:00Z'))).toBe('live');
    expect(entryStatus(show, Date.parse('2026-09-05T14:59:00Z'))).toBe('live');
    expect(entryStatus(show, Date.parse('2026-09-05T15:00:00Z'))).toBe('past');
  });

  it('limite à une heure les entrées sans horaire de fin', () => {
    const openEnded = entry({ startsAt: '2026-09-05T13:00:00Z' });
    expect(entryStatus(openEnded, Date.parse('2026-09-05T13:30:00Z'))).toBe('live');
    expect(entryStatus(openEnded, Date.parse('2026-09-05T14:01:00Z'))).toBe('past');
  });
});

describe('formatCountdown', () => {
  it('affiche un délai court avant le début', () => {
    const start = '2026-09-05T13:00:00Z';
    expect(formatCountdown(start, Date.parse('2026-09-05T12:35:00Z'))).toBe('dans 25 min');
    expect(formatCountdown(start, Date.parse('2026-09-05T10:00:00Z'))).toBe('dans 3 h');
    expect(formatCountdown(start, Date.parse('2026-09-03T13:00:00Z'))).toBe('dans 2 j');
    expect(formatCountdown(start, Date.parse('2026-09-05T13:30:00Z'))).toBeNull();
  });
});

describe('durée et avancement', () => {
  const show = entry({ startsAt: '2026-09-05T13:00:00Z', endsAt: '2026-09-05T15:00:00Z' });

  it('mesure le créneau, fin implicite comprise', () => {
    expect(entryDurationMs(show)).toBe(2 * 3_600_000);
    expect(entryDurationMs(entry({ startsAt: '2026-09-05T13:00:00Z' }))).toBe(3_600_000);
  });

  it('distingue un rendez-vous d’un créneau au long cours', () => {
    expect(isLongRun(show)).toBe(false);
    expect(
      isLongRun(entry({ startsAt: '2026-09-05T11:00:00Z', endsAt: '2026-09-05T20:00:00Z' })),
    ).toBe(true);
  });

  it('borne l’avancement au créneau', () => {
    expect(entryProgress(show, Date.parse('2026-09-05T14:00:00Z')).ratio).toBe(0.5);
    expect(entryProgress(show, Date.parse('2026-09-05T12:00:00Z')).ratio).toBe(0);
    const after = entryProgress(show, Date.parse('2026-09-05T16:00:00Z'));
    expect(after.ratio).toBe(1);
    expect(after.remainingMs).toBe(0);
  });

  it('formate une durée sans jamais aligner plus de deux nombres', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(65 * 60_000)).toBe('1 h 05');
    expect(formatDuration(9 * 3_600_000)).toBe('9 h');
  });

  it('annonce le temps restant, et la fin imminente autrement', () => {
    expect(formatRemaining(show, Date.parse('2026-09-05T13:55:00Z'))).toBe('il reste 1 h 05');
    expect(formatRemaining(show, Date.parse('2026-09-05T14:59:00Z'))).toBe('se termine');
    expect(formatRemaining(show, Date.parse('2026-09-05T15:00:00Z'))).toBeNull();
  });
});

describe('formatCountdownPrecise', () => {
  const start = '2026-09-05T13:00:00Z';

  it('passe aux secondes dans les dernières minutes', () => {
    expect(formatCountdownPrecise(start, Date.parse('2026-09-05T12:56:12Z'))).toBe('3:48');
    expect(formatCountdownPrecise(start, Date.parse('2026-09-05T12:59:59Z'))).toBe('0:01');
  });

  it('garde le libellé long au-delà du seuil', () => {
    expect(formatCountdownPrecise(start, Date.parse('2026-09-05T12:35:00Z'))).toBe('dans 25 min');
    expect(formatCountdownPrecise(start, Date.parse('2026-09-05T13:30:00Z'))).toBeNull();
  });
});

describe('formatParisDayShort', () => {
  it('abrège la journée pour le rail de navigation', () => {
    expect(formatParisDayShort('2026-09-04T16:00:00Z')).toBe('Ven 4');
    expect(formatParisDayShort('2026-09-05T22:30:00Z')).toBe('Dim 6');
  });
});
