import { describe, expect, it } from 'vitest';

import type { Streamer } from '../src/api/types';
import {
  compareLive,
  groupStreamers,
  matchesStreamer,
  searchNeedle,
  searchStreamers,
  type StreamerGroup,
} from '../src/lib/streamer-sort';

interface Spec {
  twitch: string;
  online?: boolean;
  donation?: number;
  viewers?: number;
}

function streamer({ twitch, online = true, donation = 0, viewers = 0 }: Spec): Streamer {
  return {
    twitch_id: `id-${twitch}`,
    display: twitch,
    twitch,
    profileUrl: `https://example.test/${twitch}.png`,
    online,
    game: '',
    viewersAmount: { number: viewers, formatted: String(viewers) },
    streamlabsId: null,
    donationUrl: 'https://example.test/don',
    ref: twitch.toLowerCase(),
    donationAmount: { number: donation, formatted: `${donation} €` },
  };
}

/** Logins d'un groupe, pour comparer des ordres sans écrire des objets entiers. */
function logins(groups: StreamerGroup[], key: string): string[] {
  return (groups.find((group) => group.key === key)?.data ?? []).map((s) => s.twitch);
}

describe('searchStreamers', () => {
  const pool = [
    streamer({ twitch: 'ZeratoR' }),
    streamer({ twitch: 'Etoiles' }),
    streamer({ twitch: 'MisterMV' }),
  ];

  it('rend la liste telle quelle quand la recherche est vide ou blanche', () => {
    expect(searchStreamers(pool, '')).toBe(pool);
    expect(searchStreamers(pool, '   ')).toBe(pool);
  });

  it('filtre sans tenir compte de la casse', () => {
    expect(searchStreamers(pool, 'zera').map((s) => s.twitch)).toEqual(['ZeratoR']);
    expect(searchStreamers(pool, 'MV').map((s) => s.twitch)).toEqual(['MisterMV']);
  });

  it('ne rend rien quand aucun nom ne correspond', () => {
    expect(searchStreamers(pool, 'inconnu')).toEqual([]);
  });
});

describe('matchesStreamer', () => {
  const zerator = streamer({ twitch: 'ZeratoR' });

  it('accepte tout le monde quand la recherche est vide', () => {
    expect(matchesStreamer(zerator, searchNeedle('  '))).toBe(true);
  });

  it('reconnaît le nom affiché comme le login, casse ignorée', () => {
    expect(matchesStreamer(zerator, searchNeedle(' ZERA '))).toBe(true);
    expect(matchesStreamer(zerator, searchNeedle('tor'))).toBe(true);
    expect(matchesStreamer(zerator, searchNeedle('mv'))).toBe(false);
  });
});

describe('compareLive', () => {
  it('départage les égalités sur la cagnotte, quel que soit le critère', () => {
    const a = streamer({ twitch: 'A', donation: 10, viewers: 500 });
    const b = streamer({ twitch: 'B', donation: 90, viewers: 500 });
    expect([a, b].sort(compareLive('viewers')).map((s) => s.twitch)).toEqual(['B', 'A']);
  });

  it('classe par progression quand un index de momentum est fourni', () => {
    const a = streamer({ twitch: 'A', donation: 900 });
    const b = streamer({ twitch: 'B', donation: 100 });
    const momentum = new Map([['b', 5_000]]);
    expect([a, b].sort(compareLive('momentum', momentum)).map((s) => s.twitch)).toEqual(['B', 'A']);
  });
});

describe('groupStreamers', () => {
  const live = [
    streamer({ twitch: 'Petit', donation: 100, viewers: 9_000 }),
    streamer({ twitch: 'Gros', donation: 9_000, viewers: 100 }),
  ];
  const offline = [
    streamer({ twitch: 'Eteint', online: false, donation: 50_000, viewers: 0 }),
    streamer({ twitch: 'EteintPauvre', online: false, donation: 10, viewers: 0 }),
  ];

  it('sépare les directs des éteints', () => {
    const groups = groupStreamers([...offline, ...live], 'donation');
    expect(groups.map((group) => group.key)).toEqual(['live', 'offline']);
    expect(logins(groups, 'live')).toEqual(['Gros', 'Petit']);
  });

  it('applique le tri choisi aux seuls directs', () => {
    const groups = groupStreamers([...live, ...offline], 'viewers');
    expect(logins(groups, 'live')).toEqual(['Petit', 'Gros']);
    // Les éteints restent par cagnotte : leur audience vaut zéro pour tous.
    expect(logins(groups, 'offline')).toEqual(['Eteint', 'EteintPauvre']);
  });

  it('omet les groupes vides', () => {
    expect(groupStreamers(live, 'donation').map((group) => group.key)).toEqual(['live']);
    expect(groupStreamers(offline, 'donation').map((group) => group.key)).toEqual(['offline']);
    expect(groupStreamers([], 'donation')).toEqual([]);
  });

  it('coupe le tri « en forme » là où le classement du backend s’arrête', () => {
    const classe = streamer({ twitch: 'Classe', donation: 100 });
    const horsClassement = streamer({ twitch: 'HorsClassement', donation: 8_000 });
    const momentum = new Map([['classe', 4_200]]);

    const groups = groupStreamers([classe, horsClassement, ...offline], 'momentum', momentum);

    expect(groups.map((group) => group.key)).toEqual(['ranked', 'rest', 'offline']);
    expect(logins(groups, 'ranked')).toEqual(['Classe']);
    // Progression inconnue n'est pas progression nulle : le reste retombe sur la cagnotte,
    // dans un groupe qui le dit.
    expect(logins(groups, 'rest')).toEqual(['HorsClassement']);
  });

  it('classe le groupe « en forme » par progression décroissante', () => {
    const fort = streamer({ twitch: 'Fort', donation: 1 });
    const faible = streamer({ twitch: 'Faible', donation: 100_000 });
    const momentum = new Map([
      ['fort', 90_000],
      ['faible', 10],
    ]);

    const groups = groupStreamers([faible, fort], 'momentum', momentum);
    expect(logins(groups, 'ranked')).toEqual(['Fort', 'Faible']);
  });

  it('laisse les éteints hors du classement de progression', () => {
    const eteintEnForme = streamer({ twitch: 'EteintEnForme', online: false, donation: 5 });
    const momentum = new Map([['eteintenforme', 999_999]]);

    const groups = groupStreamers([...live, eteintEnForme], 'momentum', momentum);
    expect(logins(groups, 'ranked')).toEqual([]);
    expect(logins(groups, 'offline')).toEqual(['EteintEnForme']);
  });
});
