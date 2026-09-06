import { describe, expect, it } from 'vitest';

import type { History2025 } from '@/lib/history-2025';
import {
  buildEditionComparison,
  formatElapsedLabel,
  OFFSET_2025_LABEL,
  OFFSET_2025_MINUTES,
} from '@/lib/stats-edition';

const MINUTE = 60_000;

/** Courbe 2025 factice : 0 € à T+0, puis 1 000 € par heure pendant dix heures. */
function history(finalEur = 10_000): History2025 {
  const start = Date.parse('2025-09-05T16:00:00.000Z');
  return {
    provenance: {
      provider: 'test',
      eventId: 'test',
      url: '',
      fetchedAt: '2025-09-08T00:00:00.000Z',
      sha256: '',
      note: '',
    },
    finalEur,
    points: Array.from({ length: 11 }, (_, hour) => ({
      t: start + hour * 60 * MINUTE,
      eur: hour * 1_000,
    })),
  };
}

/** Courbe 2026 factice démarrant au-dessus du seuil de collecte. */
function raw2026(hours: number, eurPerHour: number) {
  const start = Date.parse('2026-09-03T18:00:00.000Z');
  return Array.from({ length: hours + 1 }, (_, hour) => ({
    t: start + hour * 60 * MINUTE,
    eur: 1_000 + hour * eurPerHour,
  }));
}

describe('buildEditionComparison', () => {
  it('décale 2025 pour caler les deux ouvertures sur le même axe', () => {
    const model = buildEditionComparison([], history());
    expect(model.points2025[0]?.minutes).toBe(OFFSET_2025_MINUTES);
    expect(OFFSET_2025_LABEL).toBe('T+22 h 30');
  });

  it('compare 2026 à 2025 au même instant de l’édition', () => {
    // T+0 de la courbe 2025 est son premier point au-dessus du seuil de collecte, soit
    // 1 000 € : une fois décalée, elle vaut 1 000 € à OFFSET, 2 000 € une heure plus
    // tard, et 4 500 € à T+26 h — 3 h 30 après son ouverture.
    const model = buildEditionComparison(raw2026(26, 2_000), history());
    expect(model.eur2025SameElapsed).toBeCloseTo(4_500, 5);
    expect(model.deltaEur).toBeCloseTo(model.current2026Eur - 4_500, 5);
  });

  it('ne compare pas 2026 à une édition qui n’avait pas encore ouvert', () => {
    const model = buildEditionComparison(raw2026(2, 2_000), history());
    expect(model.eur2025SameElapsed).toBe(0);
    // Base nulle : aucune projection ne peut en sortir.
    expect(model.projected2026Eur).toBeNull();
  });

  it('projette le total 2026 depuis le rapport à la courbe 2025', () => {
    // Autant de fois le total final de 2025 que 2026 la dépasse à cet instant.
    const model = buildEditionComparison(raw2026(26, 2_000), history());
    expect(model.projected2026Eur).toBeCloseTo((model.current2026Eur / 4_500) * 10_000, 5);
  });

  it('préfère la cagnotte officielle au dernier point agrégé', () => {
    const model = buildEditionComparison(raw2026(4, 2_000), history(), 123_456);
    expect(model.current2026Eur).toBe(123_456);
  });

  it('n’annonce pas de courbe tant qu’il n’y a pas deux points', () => {
    const model = buildEditionComparison(raw2026(0, 2_000), history());
    expect(model.has2026Curve).toBe(false);
    expect(model.eur2025SameElapsed).toBeNull();
    expect(model.deltaEur).toBeNull();
  });

  it('mesure le rythme sur la dernière heure', () => {
    const model = buildEditionComparison(raw2026(5, 2_000), history());
    expect(model.eurPerHour).toBeCloseTo(2_000, 5);
  });
});

describe('formatElapsedLabel', () => {
  /** Espace fine insécable : celle que pose la fonction, pas celle du clavier. */
  const NBSP = ' ';

  it('cite la position dans l’édition', () => {
    expect(formatElapsedLabel(0)).toBe(`T+0${NBSP}min`);
    expect(formatElapsedLabel(45)).toBe(`T+45${NBSP}min`);
    expect(formatElapsedLabel(120)).toBe(`T+2${NBSP}h`);
    expect(formatElapsedLabel(185)).toBe(`T+3${NBSP}h${NBSP}05`);
  });

  it('ne compte pas en heures sous l’heure, ni en négatif', () => {
    expect(formatElapsedLabel(59.7)).toBe(`T+1${NBSP}h`);
    expect(formatElapsedLabel(-10)).toBe(`T+0${NBSP}min`);
    expect(formatElapsedLabel(Number.NaN)).toBe(`T+0${NBSP}min`);
  });
});
