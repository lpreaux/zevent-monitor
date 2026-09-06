import { describe, expect, it } from 'vitest';

import type { History2025 } from '@/lib/history-2025';
import {
  buildMillionsTimeline,
  crossingMinutes,
  formatGapMinutes,
  milestoneLabel,
} from '@/lib/millions';
import { buildEditionComparison, OFFSET_2025_MINUTES } from '@/lib/stats-edition';

const MINUTE = 60_000;
const START_2025 = Date.parse('2025-09-05T16:00:00.000Z');
const START_2026 = Date.parse('2026-09-03T18:00:00.000Z');

/**
 * Courbe 2025 factice au pas de 30 min, 500 k€ de plus à chaque relevé. T+0 de la série
 * est son premier point au-dessus du seuil de collecte, soit 500 k€ : elle atteint donc
 * son 1er million une demi-heure après son ouverture, puis un million par heure.
 */
function history(steps = 24): History2025 {
  return {
    provenance: {
      provider: 'test',
      eventId: 'test',
      url: '',
      fetchedAt: '2025-09-08T00:00:00.000Z',
      sha256: '',
      note: '',
    },
    finalEur: steps * 500_000,
    points: Array.from({ length: steps + 1 }, (_, i) => ({
      t: START_2025 + i * 30 * MINUTE,
      eur: i * 500_000,
    })),
  };
}

/** Le millionième palier `rank` de la courbe 2025 factice, depuis l'ouverture de 2025. */
function milestone2025(rank: number): number {
  return 30 + (rank - 1) * 60;
}

/** Courbe 2026 factice au pas de 10 min, `stepEur` de plus à chaque relevé. */
function raw2026(points: number, stepEur: number) {
  return Array.from({ length: points + 1 }, (_, i) => ({
    t: START_2026 + i * 10 * MINUTE,
    eur: i * stepEur,
  }));
}

describe('crossingMinutes', () => {
  it('situe le franchissement entre les deux relevés qui l’encadrent', () => {
    const points = [
      { minutes: 0, eur: 0 },
      { minutes: 10, eur: 200_000 },
    ];
    // Le palier tombe au quart de l'intervalle : le dater au relevé suivant coûterait
    // sept minutes et demie d'erreur, sur chaque ligne de la chronologie.
    expect(crossingMinutes(points, 50_000)).toBeCloseTo(2.5, 6);
    expect(crossingMinutes(points, 100_000)).toBeCloseTo(5, 6);
  });

  it('date au relevé exact quand le palier tombe dessus', () => {
    const points = [
      { minutes: 0, eur: 0 },
      { minutes: 10, eur: 200_000 },
      { minutes: 20, eur: 400_000 },
    ];
    expect(crossingMinutes(points, 200_000)).toBeCloseTo(10, 6);
  });

  it('n’extrapole pas au-delà de ce que la série montre', () => {
    const points = [
      { minutes: 0, eur: 0 },
      { minutes: 10, eur: 200_000 },
    ];
    expect(crossingMinutes(points, 300_000)).toBeNull();
  });

  it('ne date rien sans série', () => {
    expect(crossingMinutes([], 1_000_000)).toBeNull();
  });

  it('s’en tient au premier relevé quand le palier y est déjà franchi', () => {
    // On ne sait rien d'avant le début de la série : la dater plus tôt serait inventé.
    const points = [
      { minutes: 40, eur: 1_500_000 },
      { minutes: 50, eur: 1_700_000 },
    ];
    expect(crossingMinutes(points, 1_000_000)).toBe(40);
  });
});

describe('buildMillionsTimeline', () => {
  it('date chaque million et l’apparie au même palier en 2025', () => {
    // 200 k€ tous les dix pas : 1 M€ à T+40 min, puis un million toutes les 50 min.
    const model = buildEditionComparison(raw2026(20, 200_000), history());
    const timeline = buildMillionsTimeline(model);

    expect(timeline.stepEur).toBe(1_000_000);
    expect(timeline.crossings.map((c) => c.rank)).toEqual([1, 2, 3, 4]);
    expect(timeline.crossings.map((c) => c.minutes2026)).toEqual([40, 90, 140, 190]);
    // La date 2025 conserve le décalage qui place les mêmes jours et heures en regard.
    expect(timeline.crossings.map((c) => c.minutes2025)).toEqual([
      OFFSET_2025_MINUTES + milestone2025(1),
      OFFSET_2025_MINUTES + milestone2025(2),
      OFFSET_2025_MINUTES + milestone2025(3),
      OFFSET_2025_MINUTES + milestone2025(4),
    ]);
    // Écart positif = 2026 y est arrivée plus tôt dans le week-end. Les écarts de rythme
    // s'ajoutent donc au décalage entre les jours d'ouverture des deux éditions.
    expect(timeline.crossings.map((c) => c.gapMinutes)).toEqual([
      OFFSET_2025_MINUTES - 10,
      OFFSET_2025_MINUTES,
      OFFSET_2025_MINUTES + 10,
      OFFSET_2025_MINUTES + 20,
    ]);
  });

  it('compare le même jour du week-end malgré des jours d’ouverture différents', () => {
    const fridayHistory: History2025 = {
      ...history(),
      finalEur: 1_000_000,
      points: [
        { t: Date.parse('2025-09-05T16:00:00.000Z'), eur: 1_000 },
        // Vendredi 23 h à Paris.
        { t: Date.parse('2025-09-05T21:00:00.000Z'), eur: 1_000_000 },
      ],
    };
    const thursday2026 = [
      // Origine de la courbe 2026, jeudi 19 h 30 à Paris.
      { t: Date.parse('2026-09-03T17:30:00.000Z'), eur: 1_000 },
      // Vendredi 22 h à Paris.
      { t: Date.parse('2026-09-04T20:00:00.000Z'), eur: 1_000_000 },
    ];

    const [firstMillion] = buildMillionsTimeline(
      buildEditionComparison(thursday2026, fridayHistory),
    ).crossings;

    expect(firstMillion.gapMinutes).toBe(60);
  });

  it('n’apparie pas un palier que 2025 n’a jamais atteint', () => {
    // Édition 2025 arrêtée à 3 M€ : le 4e million de 2026 n'a pas de contrepartie.
    const timeline = buildMillionsTimeline(buildEditionComparison(raw2026(20, 200_000), history(6)));
    const fourth = timeline.crossings.at(-1);
    expect(fourth?.rank).toBe(4);
    expect(fourth?.minutes2025).toBeNull();
    expect(fourth?.gapMinutes).toBeNull();
  });

  it('annonce le palier suivant avec son estimation au rythme observé', () => {
    const model = buildEditionComparison(raw2026(20, 200_000), history());
    const timeline = buildMillionsTimeline(model);

    expect(timeline.pending?.rank).toBe(5);
    expect(timeline.pending?.targetEur).toBe(5_000_000);
    expect(timeline.pending?.remainingEur).toBe(1_000_000);
    // 1,2 M€ sur la dernière heure : il reste un million, soit cinquante minutes.
    expect(model.eurPerHour).toBeCloseTo(1_200_000, 5);
    expect(timeline.pending?.etaMinutes).toBeCloseTo(50, 5);
  });

  it('descend le pas sous le million pour ne pas rester vide au démarrage', () => {
    // 700 k€ collectés : un pas d'un million n'aurait pas encore une seule ligne à montrer.
    const timeline = buildMillionsTimeline(
      buildEditionComparison(raw2026(14, 50_000), history()),
    );
    expect(timeline.stepEur).toBe(100_000);
    expect(timeline.crossings.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(timeline.crossings[0].minutes2026).toBeCloseTo(10, 6);
    expect(timeline.pending?.targetEur).toBe(800_000);
  });

  it('ne date aucun palier tant que la collecte n’a pas démarré', () => {
    const timeline = buildMillionsTimeline(buildEditionComparison([], history()));
    expect(timeline.crossings).toEqual([]);
    expect(timeline.pending).toBeNull();
  });

  it('revient sur le palier que la cagnotte officielle a passé avant la courbe', () => {
    // La courbe agrégée s'arrête à 3,8 M€, l'état officiel annonce déjà 4,05 M€ : le
    // 4e million est tombé, il n'est pas encore datable — il reste « à venir », imminent.
    const model = buildEditionComparison(raw2026(19, 200_000), history(), 4_050_000);
    const timeline = buildMillionsTimeline(model);

    expect(timeline.crossings.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(timeline.pending?.rank).toBe(4);
    expect(timeline.pending?.targetEur).toBe(4_000_000);
    expect(timeline.pending?.remainingEur).toBe(0);
    expect(timeline.pending?.etaMinutes).toBe(0);
  });
});

describe('milestoneLabel', () => {
  it('nomme les millions par leur rang', () => {
    expect(milestoneLabel(1, 1_000_000)).toBe('1er million');
    expect(milestoneLabel(12, 1_000_000)).toBe('12e million');
  });

  it('cite le montant tant que le pas est plus fin', () => {
    // Montant rendu par `formatEurosCompact` : espace fine insécable avant l'unité.
    expect(milestoneLabel(7, 100_000)).toBe('700 k€');
  });
});

describe('formatGapMinutes', () => {
  it('dit l’écart comme on le prononce', () => {
    expect(formatGapMinutes(55)).toBe('55 min');
    expect(formatGapMinutes(72)).toBe('1 h 12');
    expect(formatGapMinutes(120)).toBe('2 h');
  });

  it('ignore le sens de l’écart, porté par la phrase qui l’entoure', () => {
    expect(formatGapMinutes(-55)).toBe('55 min');
  });
});
