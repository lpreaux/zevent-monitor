import { describe, expect, it } from 'vitest';

import type { Goal, PlanningEntry, Streamer } from '../src/api/types';
import {
  entriesForStreamer,
  nextGoalProgress,
  orderFavorites,
  planningFocus,
  resolveFocus,
  stepFocus,
  streamerStanding,
} from '../src/lib/always-on-focus';

function streamer(
  twitch: string,
  donation: number,
  options: { online?: boolean; viewers?: number } = {},
): Streamer {
  return {
    twitch_id: `id-${twitch}`,
    display: twitch,
    twitch,
    profileUrl: `https://example.test/${twitch}.png`,
    online: options.online ?? false,
    game: 'Just Chatting',
    viewersAmount: { number: options.viewers ?? 0, formatted: String(options.viewers ?? 0) },
    streamlabsId: null,
    donationUrl: 'https://example.test/don',
    ref: twitch,
    donationAmount: { number: donation, formatted: `${donation} €` },
  };
}

const ZERATOR = streamer('ZeratoR', 50_000, { online: true, viewers: 30_000 });
const ETOILES = streamer('Etoiles', 80_000, { online: false });
const MISTER_MV = streamer('MisterMV', 20_000, { online: true, viewers: 10_000 });
const AVA = streamer('AvaMind', 120_000, { online: false });

const LIVE = [ZERATOR, ETOILES, MISTER_MV, AVA];

describe('orderFavorites', () => {
  it('place les lives en tête, puis trie par cagnotte décroissante', () => {
    const order = orderFavorites(LIVE, ['zerator', 'etoiles', 'mistermv']);
    expect(order.map((s) => s.twitch)).toEqual(['ZeratoR', 'MisterMV', 'Etoiles']);
  });

  it('ignore la casse des logins et les favoris absents de l’état', () => {
    const order = orderFavorites(LIVE, ['ZERATOR', 'inconnu']);
    expect(order.map((s) => s.twitch)).toEqual(['ZeratoR']);
  });

  it('renvoie une liste vide sans favori', () => {
    expect(orderFavorites(LIVE, [])).toEqual([]);
  });
});

describe('resolveFocus', () => {
  const order = orderFavorites(LIVE, ['zerator', 'etoiles', 'mistermv']);

  it('respecte le streamer épinglé', () => {
    expect(resolveFocus(order, 'etoiles')?.twitch).toBe('Etoiles');
  });

  it('retombe sur le premier de l’ordre quand l’épinglé a disparu', () => {
    expect(resolveFocus(order, 'inconnu')?.twitch).toBe('ZeratoR');
    expect(resolveFocus(order, null)?.twitch).toBe('ZeratoR');
  });

  it('ne renvoie rien sans favori', () => {
    expect(resolveFocus([], 'zerator')).toBeUndefined();
  });
});

describe('stepFocus', () => {
  const order = orderFavorites(LIVE, ['zerator', 'etoiles', 'mistermv']);

  it('avance et recule avec bouclage', () => {
    expect(stepFocus(order, 'zerator', 1)).toBe('mistermv');
    expect(stepFocus(order, 'etoiles', 1)).toBe('zerator');
    expect(stepFocus(order, 'zerator', -1)).toBe('etoiles');
  });

  it('repart du premier quand le courant est inconnu', () => {
    expect(stepFocus(order, null, 1)).toBe('mistermv');
    expect(stepFocus(order, 'inconnu', 1)).toBe('mistermv');
  });

  it('ne renvoie rien sans favori', () => {
    expect(stepFocus([], 'zerator', 1)).toBeNull();
  });
});

describe('streamerStanding', () => {
  it('classe par cagnotte sur l’ensemble des inscrits', () => {
    expect(streamerStanding(LIVE, AVA, 1_000_000).donationRank).toBe(1);
    expect(streamerStanding(LIVE, ETOILES, 1_000_000).donationRank).toBe(2);
    expect(streamerStanding(LIVE, MISTER_MV, 1_000_000).donationRank).toBe(4);
  });

  it('ne classe en viewers que les streamers en live', () => {
    expect(streamerStanding(LIVE, ZERATOR, 1_000_000).viewersRank).toBe(1);
    expect(streamerStanding(LIVE, MISTER_MV, 1_000_000).viewersRank).toBe(2);
    expect(streamerStanding(LIVE, ETOILES, 1_000_000).viewersRank).toBeNull();
  });

  it('calcule la part de la cagnotte globale, sauf si elle est inconnue', () => {
    expect(streamerStanding(LIVE, ZERATOR, 1_000_000).share).toBeCloseTo(0.05);
    expect(streamerStanding(LIVE, ZERATOR, 0).share).toBeNull();
    expect(streamerStanding(LIVE, ZERATOR, undefined).share).toBeNull();
  });
});

describe('nextGoalProgress', () => {
  const goals: Goal[] = [
    { id: 1, amountCents: 1_000_000, label: 'Rasage', category: null, reached: false },
    { id: 2, amountCents: 5_000_000, label: 'Karaoké', category: null, reached: false },
    { id: 3, amountCents: 20_000_000, label: 'Marathon', category: null, reached: false },
  ];

  it('renvoie le premier palier non atteint et la progression depuis le précédent', () => {
    const progress = nextGoalProgress(goals, 30_000);
    expect(progress?.goal.id).toBe(2);
    expect(progress?.target).toBe(50_000);
    expect(progress?.remaining).toBe(20_000);
    expect(progress?.ratio).toBeCloseTo(0.5);
    expect(progress?.reachedCount).toBe(1);
    expect(progress?.total).toBe(3);
  });

  it('recalcule l’état atteint sur la cagnotte plutôt que sur le champ du snapshot', () => {
    const stale: Goal[] = [
      { id: 1, amountCents: 1_000_000, label: 'Rasage', category: null, reached: true },
    ];
    expect(nextGoalProgress(stale, 5_000)?.goal.id).toBe(1);
  });

  it('ne renvoie rien quand tous les paliers sont franchis, ou sans palier', () => {
    expect(nextGoalProgress(goals, 500_000)).toBeNull();
    expect(nextGoalProgress([], 1_000)).toBeNull();
  });
});

function entry(id: string, startsAt: string, endsAt: string | null, twitch: string[]): PlanningEntry {
  return {
    id,
    title: `Show ${id}`,
    description: '',
    startsAt,
    endsAt,
    allDay: false,
    source: 'ingdoc',
    participants: twitch.map((login) => ({
      name: login,
      twitch: login,
      profileUrl: null,
      role: null,
      broadcaster: true,
    })),
  };
}

describe('entriesForStreamer / planningFocus', () => {
  const entries = [
    entry('b', '2026-09-05T18:00:00Z', '2026-09-05T20:00:00Z', ['ZeratoR']),
    entry('a', '2026-09-05T14:00:00Z', '2026-09-05T15:00:00Z', ['zerator', 'Etoiles']),
    entry('c', '2026-09-05T22:00:00Z', null, ['Etoiles']),
  ];

  it('filtre sur le login sans tenir compte de la casse, et trie chronologiquement', () => {
    expect(entriesForStreamer(entries, 'ZERATOR').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('distingue le show en cours du suivant', () => {
    const now = Date.parse('2026-09-05T18:30:00Z');
    const focus = planningFocus(entries, now);
    expect(focus.current?.id).toBe('b');
    expect(focus.next?.id).toBe('c');
  });

  it('n’a pas de show en cours entre deux créneaux', () => {
    const now = Date.parse('2026-09-05T16:00:00Z');
    const focus = planningFocus(entries, now);
    expect(focus.current).toBeNull();
    expect(focus.next?.id).toBe('b');
  });
});
