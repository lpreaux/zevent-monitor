import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  mergePlanningEntries,
  toOfficialCalendarEntries,
  toPlanningEntries,
} from '../src/jobs/planning-sync.js';
import { showsSchema } from '../src/sources/evenmorestats.js';

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
}

describe('toPlanningEntries', () => {
  it('normalizes EvenMoreStats shows and keeps them chronological', async () => {
    const shows = showsSchema.parse(await fixture('evenmorestats-shows.json'));
    const entries = toPlanningEntries(shows);

    expect(entries.map((entry) => entry.title)).toEqual([
      'Concert ZEvent',
      'Ouverture ZEvent/Place',
      'Pyjama Party',
    ]);
    expect(entries[0]).toMatchObject({
      id: 'ingdoc:01a00b12-eee6-73ae-abb9-2a006ebdc126',
      startsAt: '2026-09-03T18:00:00.000Z',
      endsAt: '2026-09-03T21:30:00.000Z',
      allDay: false,
      source: 'ingdoc',
    });
    expect(entries[0]?.participants[1]).toEqual({
      name: 'LittleBigWhale',
      twitch: 'littlebigwhale',
      profileUrl:
        'https://static-cdn.jtvnw.net/jtv_user_pictures/63ff2bed-9e88-483f-bd4e-cc61d4b43e9c-profile_image-300x300.png',
      role: 'guest',
      broadcaster: false,
    });
  });

  it('ignores shows without a usable start date', () => {
    const entries = toPlanningEntries([
      { id: 'a', name: 'Sans horaire', schedule: { start: 'pas une date' } },
      { id: 'b', name: 'Sans schedule' },
      { id: 'c', name: 'Valide', schedule: { start: '2026-09-05T13:00:00Z', end: null } },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'Valide', endsAt: null });
  });
});

describe('toOfficialCalendarEntries', () => {
  it('accepts the plausible shapes of the undocumented zevent.fr calendar', () => {
    const entries = toOfficialCalendarEntries([
      { id: 12, title: 'Lancement', start: '2026-09-04T16:00:00Z', end: '2026-09-04T16:10:00Z' },
      { name: 'Rush final', start_at: '2026-09-06T18:00:00Z', all_day: false },
      { label: 'Journée', date: '2026-09-05T00:00:00Z', allDay: true },
      { title: 'Sans date' },
      'pas un objet',
    ]);

    expect(entries.map((entry) => entry.title)).toEqual(['Lancement', 'Journée', 'Rush final']);
    expect(entries[0]?.id).toBe('zevent:12');
    expect(entries[1]?.allDay).toBe(true);
    expect(entries.every((entry) => entry.source === 'zevent')).toBe(true);
  });

  it('returns nothing while the official calendar is empty or absent', () => {
    expect(toOfficialCalendarEntries([])).toEqual([]);
    expect(toOfficialCalendarEntries(null)).toEqual([]);
  });
});

describe('mergePlanningEntries', () => {
  it('prefers the official entry over its community duplicate', () => {
    const official = toOfficialCalendarEntries([
      { id: 1, title: 'Concert ZEvent', start: '2026-09-03T18:00:00Z' },
    ]);
    const community = toPlanningEntries([
      { id: 'x', name: 'Concert ZEvent', schedule: { start: '2026-09-03T18:00:00Z' } },
      { id: 'y', name: 'Croc Lanta 4', schedule: { start: '2026-09-05T13:00:00Z' } },
    ]);

    const merged = mergePlanningEntries(official, community);
    expect(merged.map((entry) => [entry.title, entry.source])).toEqual([
      ['Concert ZEvent', 'zevent'],
      ['Croc Lanta 4', 'ingdoc'],
    ]);
  });
});
