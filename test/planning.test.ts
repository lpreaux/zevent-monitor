import { describe, expect, it } from 'vitest';

import type { PlanningEntry } from '../src/api/types';
import {
  entryStatus,
  focusIndex,
  formatCountdown,
  formatParisDayLabel,
  formatParisRange,
  formatParisTime,
  groupPlanningByDay,
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

describe('groupPlanningByDay', () => {
  it('regroupe et ordonne les entrées par journée parisienne', () => {
    const days = groupPlanningByDay([
      entry({ id: 'b', title: 'Rush final', startsAt: '2026-09-06T18:00:00Z' }),
      entry({ id: 'a', title: 'Lancement', startsAt: '2026-09-04T16:00:00Z' }),
      entry({ id: 'c', title: 'Pyjama Party', startsAt: '2026-09-04T20:00:00Z' }),
    ]);

    expect(days.map((day) => [day.key, day.entries.length])).toEqual([
      ['2026-09-04', 2],
      ['2026-09-06', 1],
    ]);
    expect(days[0]?.entries.map((item) => item.title)).toEqual(['Lancement', 'Pyjama Party']);
    expect(days[0]?.label).toBe('vendredi 4 septembre');
  });
});

describe('focusIndex', () => {
  const entries = [
    entry({ id: '1', startsAt: '2026-09-04T16:00:00Z', endsAt: '2026-09-04T16:10:00Z' }),
    entry({ id: '2', startsAt: '2026-09-05T13:00:00Z', endsAt: '2026-09-05T15:00:00Z' }),
    entry({ id: '3', startsAt: '2026-09-06T18:00:00Z', endsAt: '2026-09-06T23:00:00Z' }),
  ];

  it('vise l’entrée en cours, sinon la prochaine, sinon la dernière', () => {
    expect(focusIndex(entries, Date.parse('2026-09-05T14:00:00Z'))).toBe(1);
    expect(focusIndex(entries, Date.parse('2026-09-05T17:00:00Z'))).toBe(2);
    expect(focusIndex(entries, Date.parse('2026-09-07T02:00:00Z'))).toBe(2);
    expect(focusIndex([], Date.now())).toBe(0);
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
