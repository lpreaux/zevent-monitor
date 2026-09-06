import { describe, expect, it } from 'vitest';

import type { Streamer } from '../src/api/types';
import { orderFavorites, resolveFocus, stepFocus } from '../src/lib/always-on-focus';

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
