import { describe, expect, it } from 'vitest';

import type { PlanningEntry, Streamer } from '../src/api/types';
import { liveShowIndex, streamerActivity } from '../src/lib/streamer-activity';

const NOW = Date.parse('2026-09-05T20:00:00Z');

function streamer(overrides: Partial<Streamer> = {}): Streamer {
  return {
    twitch_id: 'id',
    display: 'ZeratoR',
    twitch: 'ZeratoR',
    profileUrl: 'https://example.test/z.png',
    online: true,
    game: 'Trackmania',
    viewersAmount: { number: 1000, formatted: '1000' },
    streamlabsId: null,
    donationUrl: 'https://example.test/don',
    ref: 'zerator',
    donationAmount: { number: 1000, formatted: '1000 €' },
    ...overrides,
  };
}

function entry(id: string, startsAt: string, endsAt: string | null, logins: string[]): PlanningEntry {
  return {
    id,
    title: `Show ${id}`,
    description: '',
    startsAt,
    endsAt,
    allDay: false,
    source: 'ingdoc',
    participants: logins.map((twitch) => ({
      name: twitch,
      twitch,
      profileUrl: null,
      role: null,
      broadcaster: true,
    })),
  };
}

describe('liveShowIndex', () => {
  it('n’indexe que les shows en cours, par login en minuscules', () => {
    const index = liveShowIndex(
      [
        entry('passe', '2026-09-05T17:00:00Z', '2026-09-05T18:00:00Z', ['ZeratoR']),
        entry('encours', '2026-09-05T19:30:00Z', '2026-09-05T21:00:00Z', ['MisterMV']),
        entry('avenir', '2026-09-05T22:00:00Z', '2026-09-05T23:00:00Z', ['Etoiles']),
      ],
      NOW,
    );
    expect([...index.keys()]).toEqual(['mistermv']);
    expect(index.get('mistermv')?.title).toBe('Show encours');
  });

  it('ignore les participants sans compte Twitch', () => {
    const show = entry('encours', '2026-09-05T19:30:00Z', '2026-09-05T21:00:00Z', []);
    show.participants = [{ name: 'Invité', twitch: null, profileUrl: null, role: null, broadcaster: false }];
    expect(liveShowIndex([show], NOW).size).toBe(0);
  });
});

describe('streamerActivity', () => {
  it('annonce le show du planning avant le jeu', () => {
    const show = entry('encours', '2026-09-05T19:30:00Z', '2026-09-05T21:00:00Z', ['ZeratoR']);
    expect(streamerActivity(streamer(), show)).toEqual({
      kind: 'planning',
      label: 'Show encours',
      icon: 'calendar',
    });
  });

  it('retombe sur le jeu en cours', () => {
    expect(streamerActivity(streamer())).toMatchObject({ kind: 'game', label: 'Trackmania' });
  });

  it('reste lisible sans jeu renseigné', () => {
    expect(streamerActivity(streamer({ game: '  ' }))).toMatchObject({
      kind: 'live',
      label: 'En stream',
    });
  });

  it('ignore le planning quand le streamer est éteint', () => {
    const show = entry('encours', '2026-09-05T19:30:00Z', '2026-09-05T21:00:00Z', ['ZeratoR']);
    expect(streamerActivity(streamer({ online: false }), show)).toMatchObject({
      kind: 'offline',
      label: 'Hors ligne',
    });
  });
});
