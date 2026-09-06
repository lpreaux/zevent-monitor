import { describe, expect, it } from 'vitest';

import type { Recap, RecapContent } from '@/api/recaps';
import { allProgressions, coverageNotice, personalizeRecap } from '@/lib/recap-personalization';

const content = (overrides: Partial<RecapContent> = {}): RecapContent => ({
  version: 2,
  summary: {
    startCents: 1_000_00,
    endCents: 1_500_00,
    raisedCents: 500_00,
    peakViewers: 1234,
    coverage: { start: '2026-09-05T00:00:00.000Z', end: '2026-09-05T09:00:00.000Z', complete: true },
  },
  counts: { milestones: 0, bigDonations: 1, liveStarts: 2, goalsReached: 1 },
  milestones: [],
  bigDonations: [
    { donor: 'Alice', amountCents: 50_000, twitch: 'zerator', occurredAt: '2026-09-05T02:00:00.000Z' },
    { donor: 'Bob', amountCents: 20_000, twitch: 'etoiles', occurredAt: '2026-09-05T03:00:00.000Z' },
  ],
  liveStarts: [
    { twitch: 'zerator', display: 'ZeratoR', occurredAt: '2026-09-05T01:00:00.000Z' },
    { twitch: 'zerator', display: 'ZeratoR', occurredAt: '2026-09-05T05:00:00.000Z' },
    { twitch: 'etoiles', display: 'Etoiles', occurredAt: '2026-09-05T04:00:00.000Z' },
  ],
  goalsReached: [
    { twitch: 'zerator', display: 'ZeratoR', label: 'Rasage', occurredAt: '2026-09-05T06:00:00.000Z' },
  ],
  topProgressions: [{ twitch: 'etoiles', display: 'Etoiles', raisedCents: 300_00 }],
  progressions: [
    { twitch: 'etoiles', display: 'Etoiles', raisedCents: 300_00 },
    { twitch: 'zerator', display: 'ZeratoR', raisedCents: 120_00 },
    { twitch: 'mistermv', display: 'MisterMV', raisedCents: 80_00 },
  ],
  highlights: [],
  ...overrides,
});

const recap = (value: RecapContent): Recap => ({
  id: '1',
  kind: 'manual',
  periodStart: '2026-09-05T00:00:00.000Z',
  periodEnd: '2026-09-05T09:00:00.000Z',
  generatedAt: '2026-09-05T09:00:00.000Z',
  content: value,
});

describe('personnalisation des récaps', () => {
  it('remonte uniquement ce qui concerne les favoris', () => {
    const personal = personalizeRecap(content(), ['ZeratoR']);

    expect(personal.favoriteProgressions.map((item) => item.twitch)).toEqual(['zerator']);
    expect(personal.favoriteGoals).toHaveLength(1);
    expect(personal.favoriteDonations.map((item) => item.donor)).toEqual(['Alice']);
    expect(personal.hasFavoriteContent).toBe(true);
  });

  it('ne garde qu’un démarrage de live par favori', () => {
    const personal = personalizeRecap(content(), ['zerator']);

    expect(personal.favoriteLiveStarts).toHaveLength(1);
    expect(personal.favoriteLiveStarts[0]?.occurredAt).toBe('2026-09-05T01:00:00.000Z');
  });

  it('exclut les favoris du classement général', () => {
    const personal = personalizeRecap(content(), ['etoiles']);

    expect(personal.otherProgressions.map((item) => item.twitch)).toEqual(['zerator', 'mistermv']);
  });

  it('sans favori, aucune section personnalisée', () => {
    const personal = personalizeRecap(content(), []);

    expect(personal.hasFavoriteContent).toBe(false);
    expect(personal.otherProgressions).toHaveLength(3);
  });

  it('retombe sur topProgressions pour un récap généré avant la v2', () => {
    const legacy = content({ progressions: undefined, version: undefined });

    expect(allProgressions(legacy).map((item) => item.twitch)).toEqual(['etoiles']);
  });
});

describe('couverture de la période', () => {
  it('reste silencieuse quand la période est entièrement couverte', () => {
    expect(coverageNotice(recap(content()))).toBeNull();
  });

  it('annonce la date de début réelle quand la collecte a démarré en cours de période', () => {
    const partial = content({
      summary: {
        ...content().summary,
        coverage: {
          start: '2026-09-05T04:00:00.000Z',
          end: '2026-09-05T09:00:00.000Z',
          complete: false,
        },
      },
    });

    expect(coverageNotice(recap(partial))).toContain('à partir du');
  });

  it('signale l’absence totale de données', () => {
    const empty = content({
      summary: {
        ...content().summary,
        coverage: { start: null, end: null, complete: false },
      },
    });

    expect(coverageNotice(recap(empty))).toContain('Aucune donnée');
  });

  it('considère un récap sans champ de couverture comme complet', () => {
    const legacy = content({ summary: { ...content().summary, coverage: undefined } });

    expect(coverageNotice(recap(legacy))).toBeNull();
  });
});
