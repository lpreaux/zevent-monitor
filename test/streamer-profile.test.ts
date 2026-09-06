import { describe, expect, it } from 'vitest';

import type { StreamerSeriesPoint } from '../src/api/donations';
import type { Goal, PlanningEntry, Streamer } from '../src/api/types';
import {
  buildStreamerShareText,
  curveSlice,
  entriesForStreamer,
  lastOnlineAt,
  nextGoalProgress,
  planningFocus,
  recentStreamerDeltaEur,
  splitGoals,
  streamerSchedule,
  streamerStanding,
} from '../src/lib/streamer-profile';

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

  it('mesure l’écart avec les voisins immédiats du classement', () => {
    const middle = streamerStanding(LIVE, ETOILES, 1_000_000);
    expect(middle.behindEuros).toBe(40_000);
    expect(middle.aheadEuros).toBe(30_000);
  });

  it('n’a pas de voisin devant en tête, ni derrière en queue', () => {
    expect(streamerStanding(LIVE, AVA, 1_000_000).behindEuros).toBeNull();
    expect(streamerStanding(LIVE, MISTER_MV, 1_000_000).aheadEuros).toBeNull();
  });
});

const GOALS: Goal[] = [
  { id: 1, amountCents: 1_000_000, label: 'Rasage', category: null, reached: false },
  { id: 2, amountCents: 5_000_000, label: 'Karaoké', category: null, reached: false },
  { id: 3, amountCents: 20_000_000, label: 'Marathon', category: null, reached: false },
];

describe('splitGoals', () => {
  it('range les paliers autour de la cagnotte', () => {
    const split = splitGoals(GOALS, 30_000);
    expect(split.reached.map((goal) => goal.id)).toEqual([1]);
    expect(split.next?.goal.id).toBe(2);
    expect(split.later.map((goal) => goal.id)).toEqual([3]);
  });

  it('trie les paliers reçus dans le désordre', () => {
    const shuffled = [GOALS[2], GOALS[0], GOALS[1]];
    expect(splitGoals(shuffled, 0).later.map((goal) => goal.id)).toEqual([2, 3]);
  });

  it('n’a plus de prochain palier quand ils sont tous franchis', () => {
    const split = splitGoals(GOALS, 500_000);
    expect(split.next).toBeNull();
    expect(split.reached).toHaveLength(3);
    expect(split.later).toEqual([]);
  });
});

describe('nextGoalProgress', () => {
  it('renvoie le premier palier non atteint et la progression depuis le précédent', () => {
    const progress = nextGoalProgress(GOALS, 30_000);
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
    expect(nextGoalProgress(GOALS, 500_000)).toBeNull();
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

const ENTRIES = [
  entry('b', '2026-09-05T18:00:00Z', '2026-09-05T20:00:00Z', ['ZeratoR']),
  entry('a', '2026-09-05T14:00:00Z', '2026-09-05T15:00:00Z', ['zerator', 'Etoiles']),
  entry('c', '2026-09-05T22:00:00Z', null, ['Etoiles']),
];

describe('entriesForStreamer / planningFocus', () => {
  it('filtre sur le login sans tenir compte de la casse, et trie chronologiquement', () => {
    expect(entriesForStreamer(ENTRIES, 'ZERATOR').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('distingue le show en cours du suivant', () => {
    const now = Date.parse('2026-09-05T18:30:00Z');
    const focus = planningFocus(ENTRIES, now);
    expect(focus.current?.id).toBe('b');
    expect(focus.next?.id).toBe('c');
  });

  it('n’a pas de show en cours entre deux créneaux', () => {
    const now = Date.parse('2026-09-05T16:00:00Z');
    const focus = planningFocus(ENTRIES, now);
    expect(focus.current).toBeNull();
    expect(focus.next?.id).toBe('b');
  });
});

describe('streamerSchedule', () => {
  const entries = [
    ...ENTRIES,
    entry('d', '2026-09-05T18:30:00Z', '2026-09-05T19:00:00Z', ['ZeratoR']),
  ];

  it('sépare ce qui passe, ce qui suit et ce qui est fini', () => {
    const schedule = streamerSchedule(entries, 'zerator', Date.parse('2026-09-05T18:40:00Z'));
    // Deux créneaux se chevauchent : celui qui se termine le plus tôt vient en tête.
    expect(schedule.live.map((e) => e.id)).toEqual(['d', 'b']);
    expect(schedule.upcoming).toEqual([]);
    expect(schedule.past.map((e) => e.id)).toEqual(['a']);
  });

  it('remonte le temps sur les émissions passées', () => {
    const schedule = streamerSchedule(entries, 'zerator', Date.parse('2026-09-06T00:00:00Z'));
    expect(schedule.past.map((e) => e.id)).toEqual(['d', 'b', 'a']);
  });

  it('ignore les émissions où le streamer n’est pas annoncé', () => {
    const schedule = streamerSchedule(entries, 'etoiles', Date.parse('2026-09-05T18:40:00Z'));
    expect(schedule.upcoming.map((e) => e.id)).toEqual(['c']);
  });
});

/** Points espacés de 10 min, du plus ancien au plus récent. */
function series(values: number[], online = true): StreamerSeriesPoint[] {
  const start = Date.parse('2026-09-05T12:00:00Z');
  return values.map((eur, index) => ({
    bucket: new Date(start + index * 600_000).toISOString(),
    eur,
    viewers: 0,
    online,
  }));
}

describe('curveSlice', () => {
  const points = series([1_000, 1_100, 1_200, 1_300, 1_400, 1_500, 1_600]);
  const now = Date.parse('2026-09-05T13:00:00Z');

  it('ne garde que la fenêtre demandée et la recale sur son premier point', () => {
    const slice = curveSlice(points, 30, now);
    expect(slice?.points.map((p) => p.eur)).toEqual([1_300, 1_400, 1_500, 1_600]);
    expect(slice?.points.map((p) => p.minutes)).toEqual([0, 10, 20, 30]);
    expect(slice?.spanMinutes).toBe(30);
    expect(slice?.deltaEur).toBe(300);
  });

  it('prend toute la série quand aucune fenêtre n’est demandée', () => {
    const slice = curveSlice(points, null, now);
    expect(slice?.points).toHaveLength(7);
    expect(slice?.minEur).toBe(1_000);
    expect(slice?.maxEur).toBe(1_600);
  });

  it('ne trace rien avec moins de deux points dans la fenêtre', () => {
    expect(curveSlice(points, 5, now)).toBeNull();
    expect(curveSlice([], null, now)).toBeNull();
  });
});

describe('lastOnlineAt', () => {
  it('renvoie le dernier relevé où le streamer diffusait', () => {
    const points = [...series([10, 20], true), ...series([30, 40], false)];
    expect(lastOnlineAt(points)).toBe(points[1].bucket);
  });

  it('ne renvoie rien si la collecte ne l’a jamais vu en direct', () => {
    expect(lastOnlineAt(series([10, 20], false))).toBeNull();
    expect(lastOnlineAt([])).toBeNull();
  });
});

describe('recentStreamerDeltaEur', () => {
  it('mesure la progression sur la fenêtre demandée', () => {
    // 7 points = une heure pile entre le premier et le dernier.
    expect(recentStreamerDeltaEur(series([1_000, 1_100, 1_200, 1_300, 1_400, 1_500, 1_600]), 60)).toBe(600);
  });

  it('préfère la cagnotte officielle, plus fraîche que le dernier point agrégé', () => {
    const points = series([1_000, 1_100, 1_200, 1_300, 1_400, 1_500, 1_600]);
    expect(recentStreamerDeltaEur(points, 60, 1_650)).toBe(650);
  });

  it('ne dépend pas du seuil d’ouverture de la collecte globale', () => {
    // Une cagnotte perso peut rester très en dessous des 1 000 € du seuil global.
    expect(recentStreamerDeltaEur(series([10, 20, 30, 40, 50, 60, 70]), 60)).toBe(60);
  });

  it('ne renvoie rien tant que la courbe ne couvre pas la fenêtre', () => {
    expect(recentStreamerDeltaEur(series([1_000, 1_100]), 60)).toBeNull();
    expect(recentStreamerDeltaEur([], 60)).toBeNull();
  });

  it('ignore les horodatages illisibles', () => {
    expect(recentStreamerDeltaEur([{ bucket: 'pas-une-date', eur: 10 }], 60)).toBeNull();
  });
});

describe('buildStreamerShareText', () => {
  it('annonce la cagnotte, le rang et le lien de la chaîne', () => {
    const text = buildStreamerShareText(ZERATOR, streamerStanding(LIVE, ZERATOR, 1_000_000));
    expect(text).toContain('ZeratoR a récolté');
    expect(text).toContain('3e sur 4 streamers');
    expect(text).toContain('https://www.twitch.tv/zerator');
  });

  it('se contente du montant quand le classement est inconnu', () => {
    const text = buildStreamerShareText(ZERATOR);
    expect(text.split('\n')).toHaveLength(2);
    expect(text).not.toContain('sur 4');
  });

  it('ajoute la progression et le prochain palier quand ils sont fournis', () => {
    const text = buildStreamerShareText(ZERATOR, null, {
      delta: { eur: 320, windowMinutes: 10 },
      nextGoal: { label: 'Rasage', remaining: 1_500 },
    });
    expect(text).toContain('sur les 10 dernières minutes');
    expect(text).toContain('Prochain palier : Rasage');
  });

  it('tait une progression nulle plutôt que d’annoncer « +0 € »', () => {
    const text = buildStreamerShareText(ZERATOR, null, { delta: { eur: 0, windowMinutes: 10 } });
    expect(text).not.toContain('dernières minutes');
  });
});
