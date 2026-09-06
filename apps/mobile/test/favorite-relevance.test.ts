import { describe, expect, it } from 'vitest';

import type { Streamer } from '../src/api/types';
import {
  AFFINITY_HALF_LIFE_MS,
  decayedAffinity,
  noteAffinity,
  pruneAffinity,
  rankFavorites,
  RECENCY_HALF_LIFE_MS,
  type FavoriteSignals,
} from '../src/lib/favorite-relevance';

const NOW = Date.parse('2026-09-05T20:00:00Z');

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
    online: options.online ?? true,
    game: 'Just Chatting',
    viewersAmount: { number: options.viewers ?? 1000, formatted: String(options.viewers ?? 1000) },
    streamlabsId: null,
    donationUrl: 'https://example.test/don',
    ref: twitch,
    donationAmount: { number: donation, formatted: `${donation} €` },
  };
}

const order = (signals: FavoriteSignals[]) =>
  rankFavorites(signals, NOW).map((item) => item.streamer.twitch);

describe('affinité', () => {
  it('amortit le score de moitié à chaque demi-vie', () => {
    const entry = { score: 4, updatedAt: NOW - AFFINITY_HALF_LIFE_MS };
    expect(decayedAffinity(entry, NOW)).toBeCloseTo(2, 6);
  });

  it('cumule les interactions en amortissant l’existant', () => {
    const first = noteAffinity(undefined, 'detail', NOW - AFFINITY_HALF_LIFE_MS);
    const second = noteAffinity(first, 'donation', NOW);
    expect(second.score).toBeCloseTo(5.5, 6);
    expect(second.updatedAt).toBe(NOW);
  });

  it('oublie les entrées devenues négligeables', () => {
    const kept = pruneAffinity(
      {
        vieux: { score: 1, updatedAt: NOW - 10 * AFFINITY_HALF_LIFE_MS },
        frais: { score: 1, updatedAt: NOW },
      },
      NOW,
    );
    expect(Object.keys(kept)).toEqual(['frais']);
  });
});

describe('rankFavorites', () => {
  it('fait passer tout favori en live devant les hors ligne', () => {
    expect(
      order([
        { streamer: streamer('offline', 500_000, { online: false }) },
        { streamer: streamer('online', 1_000) },
      ]),
    ).toEqual(['online', 'offline']);
  });

  it('remonte le streamer ouvert à l’instant devant un favori plus gros', () => {
    expect(
      order([
        { streamer: streamer('gros', 100_000, { viewers: 20_000 }) },
        {
          streamer: streamer('ouvert', 5_000, { viewers: 500 }),
          affinity: { score: 3, updatedAt: NOW },
        },
      ]),
    ).toEqual(['ouvert', 'gros']);
  });

  it('laisse l’affinité s’effacer avec le temps', () => {
    expect(
      order([
        { streamer: streamer('gros', 100_000, { viewers: 20_000 }) },
        {
          streamer: streamer('ouvert', 5_000, { viewers: 500 }),
          affinity: { score: 3, updatedAt: NOW - 40 * AFFINITY_HALF_LIFE_MS },
        },
      ]),
    ).toEqual(['gros', 'ouvert']);
  });

  it('départage deux favoris identiques par leur progression récente', () => {
    expect(
      order([
        { streamer: streamer('calme', 10_000), deltaCents: 0 },
        { streamer: streamer('actif', 10_000), deltaCents: 50_000 },
      ]),
    ).toEqual(['actif', 'calme']);
  });

  it('explique le classement par le signal dominant', () => {
    const [first] = rankFavorites(
      [
        { streamer: streamer('actif', 10_000), deltaCents: 90_000 },
        { streamer: streamer('calme', 10_000), deltaCents: 0 },
      ],
      NOW,
    );
    expect(first.streamer.twitch).toBe('actif');
    expect(first.reason).toBe('momentum');
  });

  it('annonce le show en cours quand c’est lui qui fait la différence', () => {
    const [first] = rankFavorites(
      [
        { streamer: streamer('show', 10_000), planningLive: true },
        { streamer: streamer('calme', 10_000) },
      ],
      NOW,
    );
    expect(first.streamer.twitch).toBe('show');
    expect(first.reason).toBe('planning');
  });

  it('préfère « vu récemment » à « habitué » juste après une ouverture', () => {
    const [first] = rankFavorites(
      [
        {
          streamer: streamer('juste-ouvert', 10_000),
          affinity: { score: 1, updatedAt: NOW - RECENCY_HALF_LIFE_MS / 10 },
        },
        {
          streamer: streamer('habitue', 10_000),
          affinity: { score: 20, updatedAt: NOW - 3 * AFFINITY_HALF_LIFE_MS },
        },
      ],
      NOW,
    );
    expect(first.streamer.twitch).toBe('juste-ouvert');
    expect(first.reason).toBe('recent');
  });

  it('ne dit rien quand aucun signal ne ressort', () => {
    const ranked = rankFavorites([{ streamer: streamer('seul', 10_000, { viewers: 0 }) }], NOW);
    expect(ranked[0].reason).toBeNull();
  });
});
