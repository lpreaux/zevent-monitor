import { describe, expect, it } from 'vitest';

import type { Recap, RecapContent, RecapDaySummary } from '@/api/recaps';
import {
  buildRecapShareText,
  buildRecapTimeline,
  dayToRecapCard,
  favoriteMarks,
  filterRecaps,
  formatDuration,
  formatPeriod,
  groupFavoriteActivity,
  recapTitle,
  sortRecaps,
  toRhythmBars,
} from '@/lib/recap-view';

/** Espace fine insécable, celle qu'emploie tout le formatage de l'application. */
const NBSP = ' ';

const emptyContent = (): RecapContent => ({
  version: 3,
  summary: { startCents: 0, endCents: 0, raisedCents: 0, peakViewers: 0, shareOfTotal: null },
  counts: { milestones: 0, bigDonations: 0, liveStarts: 0, goalsReached: 0 },
  milestones: [], bigDonations: [], liveStarts: [], goalsReached: [],
  topProgressions: [], progressions: [], highlights: [],
});

const recap = (over: Partial<Recap> = {}): Recap => ({
  id: '1',
  kind: 'manual',
  periodStart: '2026-09-05T10:00:00.000Z',
  periodEnd: '2026-09-05T16:00:00.000Z',
  generatedAt: '2026-09-05T16:00:00.000Z',
  content: emptyContent(),
  ...over,
});

describe('durées et périodes', () => {
  it('dit les durées comme on les lit', () => {
    expect(formatDuration(45)).toBe(`45${NBSP}min`);
    expect(formatDuration(180)).toBe(`3${NBSP}h`);
    expect(formatDuration(270)).toBe(`4${NBSP}h${NBSP}30`);
    expect(formatDuration(4320)).toBe('3 jours');
  });

  it('ne répète le jour que s’il a changé', () => {
    // Heure de Paris : 12:00 → 18:00 le même samedi.
    expect(formatPeriod('2026-09-05T10:00:00.000Z', '2026-09-05T16:00:00.000Z'))
      .toBe('sam. 12:00 → 18:00');
    expect(formatPeriod('2026-09-05T20:00:00.000Z', '2026-09-06T07:00:00.000Z'))
      .toBe('sam. 22:00 → dim. 09:00');
  });
});

describe('titre d’un récap', () => {
  it('reprend le nom du chapitre pour une journée', () => {
    expect(recapTitle(recap({ kind: 'day', title: 'Samedi' }))).toBe('Samedi');
  });

  it('situe un récap programmé par son heure de fin', () => {
    expect(recapTitle(recap({ kind: 'scheduled' }))).toBe('Récap de 18:00');
  });

  it('annonce la durée couverte par un récap manuel', () => {
    expect(recapTitle(recap())).toBe(`Les 6${NBSP}h avant 18:00`);
  });
});

describe('fil de la période', () => {
  const content = (): RecapContent => ({
    ...emptyContent(),
    milestones: [{ thresholdCents: 500_000_000, occurredAt: '2026-09-05T12:00:00.000Z' }],
    bigDonations: [
      { donor: 'Alice', amountCents: 100_000, twitch: 'zerator', occurredAt: '2026-09-05T11:00:00.000Z' },
      { donor: 'Bob', amountCents: 50_000, twitch: null, occurredAt: '2026-09-05T13:00:00.000Z' },
    ],
    goalsReached: [
      { twitch: 'etoiles', display: 'Etoiles', label: 'Rasage', occurredAt: '2026-09-05T10:30:00.000Z' },
    ],
    liveStarts: [
      { twitch: 'zerator', display: 'ZeratoR', occurredAt: '2026-09-05T09:00:00.000Z' },
      { twitch: 'inconnu', display: 'Inconnu', occurredAt: '2026-09-05T09:30:00.000Z' },
    ],
  });

  it('remet les faits dans l’ordre où ils sont arrivés', () => {
    const { items } = buildRecapTimeline(content(), ['zerator']);

    expect(items.map((item) => item.kind)).toEqual([
      'liveStart', 'goal', 'bigDonation', 'milestone', 'bigDonation',
    ]);
  });

  it('n’y fait entrer que les lives des favoris', () => {
    const { items } = buildRecapTimeline(content(), ['zerator']);

    expect(items.filter((item) => item.kind === 'liveStart')).toHaveLength(1);
    expect(buildRecapTimeline(content(), []).items.some((item) => item.kind === 'liveStart'))
      .toBe(false);
  });

  it('signale ce qui concerne un favori', () => {
    const { items } = buildRecapTimeline(content(), ['zerator']);
    const donation = items.find((item) => item.title === 'Alice');

    expect(donation?.favorite).toBe(true);
    expect(items.find((item) => item.title === 'Bob')?.favorite).toBe(false);
  });

  it('garde les faits les plus marquants au-delà de la limite, sans casser l’ordre', () => {
    const { items, hidden } = buildRecapTimeline(content(), ['zerator'], 2);

    expect(hidden).toBe(3);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.kind)).toEqual(['liveStart', 'bigDonation']);
    expect(items.every((item) => item.favorite)).toBe(true);
  });
});

describe('rythme de la période', () => {
  it('somme les écarts au lieu de les échantillonner', () => {
    const points = [
      { t: '2026-09-05T10:00:00.000Z', cents: 0 },
      { t: '2026-09-05T10:10:00.000Z', cents: 1_000 },
      { t: '2026-09-05T10:20:00.000Z', cents: 3_000 },
      { t: '2026-09-05T10:30:00.000Z', cents: 3_500 },
      { t: '2026-09-05T10:40:00.000Z', cents: 9_500 },
    ];

    const bars = toRhythmBars(points, 2);

    expect(bars).toHaveLength(2);
    expect(bars[0]?.value).toBe(30); // 1 000 + 2 000 centimes
    expect(bars[1]?.value).toBe(65); // 500 + 6 000 centimes
  });

  it('ne dessine rien sans au moins deux points', () => {
    expect(toRhythmBars([{ t: '2026-09-05T10:00:00.000Z', cents: 10 }])).toEqual([]);
  });
});

describe('rangement de la liste', () => {
  it('met les journées en tête, puis le plus récent', () => {
    const list = [
      recap({ id: 'a', periodEnd: '2026-09-05T10:00:00.000Z' }),
      recap({ id: 'day-1', kind: 'day', periodEnd: '2026-09-04T10:00:00.000Z' }),
      recap({ id: 'b', periodEnd: '2026-09-06T10:00:00.000Z' }),
    ];

    expect(sortRecaps(list).map((item) => item.id)).toEqual(['day-1', 'b', 'a']);
  });

  it('filtre par nature de récap', () => {
    const list = [recap({ id: 'a' }), recap({ id: 'b', kind: 'scheduled' })];

    expect(filterRecaps(list, 'manual').map((item) => item.id)).toEqual(['a']);
    expect(filterRecaps(list, 'day')).toEqual([]);
    expect(filterRecaps(list, 'all')).toHaveLength(2);
  });
});

describe('carte d’une journée', () => {
  const day: RecapDaySummary = {
    id: 'day-2026-09-05',
    kind: 'day',
    title: 'Samedi',
    subtitle: 'sam. 09:00 → dim. 09:00',
    periodStart: '2026-09-05T07:00:00.000Z',
    periodEnd: '2026-09-06T07:00:00.000Z',
    inProgress: false,
    preview: {
      raisedCents: 450_000_000,
      endCents: 900_000_000,
      peakViewers: 180_000,
      shareOfTotal: 0.5,
      counts: { milestones: 2, bigDonations: 40, liveStarts: 120, goalsReached: 12 },
      points: [0, 100, 400],
    },
  };

  it('se lit comme un récap sans avoir chargé son contenu', () => {
    const card = dayToRecapCard(day);

    expect(card.kind).toBe('day');
    expect(card.content.summary.raisedCents).toBe(450_000_000);
    expect(card.content.counts.goalsReached).toBe(12);
    expect(recapTitle(card)).toBe('Samedi');
  });

  it('se partage avec ses bornes et son cumul', () => {
    const text = buildRecapShareText(dayToRecapCard(day));

    expect(text).toContain('ZEvent — Samedi');
    expect(text).toContain('sam. 09:00 → dim. 09:00');
    expect(text).toContain('12 donation goals atteints');
  });
});

describe('activité des favoris', () => {
  const content = (): RecapContent => ({
    ...emptyContent(),
    progressions: [
      { twitch: 'zerator', display: 'ZeratoR', raisedCents: 1_200_000 },
      { twitch: 'etoiles', display: 'Etoiles', raisedCents: 400_000 },
      { twitch: 'autre', display: 'Autre', raisedCents: 9_000_000 },
    ],
    goalsReached: [
      { twitch: 'zerator', display: 'ZeratoR', label: 'Rasage', occurredAt: '2026-09-05T11:00:00.000Z' },
      { twitch: 'zerator', display: 'ZeratoR', label: 'Karaoké', occurredAt: '2026-09-05T14:00:00.000Z' },
    ],
    liveStarts: [
      { twitch: 'zerator', display: 'ZeratoR', occurredAt: '2026-09-05T09:00:00.000Z' },
      { twitch: 'zerator', display: 'ZeratoR', occurredAt: '2026-09-05T18:00:00.000Z' },
    ],
    bigDonations: [
      { donor: 'Alice', amountCents: 50_000, twitch: 'zerator', occurredAt: '2026-09-05T12:00:00.000Z' },
      { donor: 'Bob', amountCents: 300_000, twitch: 'zerator', occurredAt: '2026-09-05T13:00:00.000Z' },
    ],
  });

  it('rassemble tout ce qui concerne un favori sous une seule entrée', () => {
    const digests = groupFavoriteActivity(content(), ['zerator', 'etoiles']);

    expect(digests).toHaveLength(2);
    const [first] = digests;
    expect(first?.twitch).toBe('zerator');
    expect(first?.raisedCents).toBe(1_200_000);
    expect(first?.goals).toHaveLength(2);
    expect(first?.bigDonations).toHaveLength(2);
  });

  it('ne retient que le premier passage en direct', () => {
    const [first] = groupFavoriteActivity(content(), ['zerator']);

    expect(first?.liveStartedAt).toBe('2026-09-05T09:00:00.000Z');
  });

  it('écarte ce qui ne concerne aucun favori', () => {
    const digests = groupFavoriteActivity(content(), ['zerator']);

    expect(digests.map((item) => item.twitch)).toEqual(['zerator']);
    expect(groupFavoriteActivity(content(), [])).toEqual([]);
  });

  it('classe par progression décroissante', () => {
    const digests = groupFavoriteActivity(content(), ['etoiles', 'zerator']);

    expect(digests.map((item) => item.twitch)).toEqual(['zerator', 'etoiles']);
  });

  it('garde un favori qui n’a pas progressé mais a fait quelque chose', () => {
    const withoutProgression: RecapContent = {
      ...emptyContent(),
      goalsReached: [
        { twitch: 'kameto', display: 'Kameto', label: 'Palier', occurredAt: '2026-09-05T11:00:00.000Z' },
      ],
    };

    const digests = groupFavoriteActivity(withoutProgression, ['kameto']);

    expect(digests).toHaveLength(1);
    expect(digests[0]?.raisedCents).toBe(0);
  });
});

describe('marques sous un favori', () => {
  const digest = {
    twitch: 'zerator',
    display: 'ZeratoR',
    raisedCents: 100,
    goals: [
      { label: 'A', occurredAt: '2026-09-05T11:00:00.000Z' },
      { label: 'B', occurredAt: '2026-09-05T12:00:00.000Z' },
    ],
    liveStartedAt: '2026-09-05T07:00:00.000Z',
    bigDonations: [
      { donor: 'Alice', amountCents: 50_000, occurredAt: '2026-09-05T12:00:00.000Z' },
      { donor: 'Bob', amountCents: 300_000, occurredAt: '2026-09-05T13:00:00.000Z' },
    ],
  };

  it('dit le présent plutôt que le passé quand le direct tient toujours', () => {
    expect(favoriteMarks(digest, true)[0]).toBe('en direct');
    expect(favoriteMarks(digest, false)[0]).toBe('direct lancé à 09:00');
  });

  it('compte les paliers et retient le plus gros don', () => {
    const marks = favoriteMarks(digest, true);

    expect(marks).toContain('2 paliers');
    expect(marks.some((mark) => mark.startsWith('don de') && mark.includes('3'))).toBe(true);
  });

  it('ne dit rien d’une période sans fait marquant', () => {
    expect(
      favoriteMarks({ ...digest, goals: [], liveStartedAt: null, bigDonations: [] }, false),
    ).toEqual([]);
  });
});
