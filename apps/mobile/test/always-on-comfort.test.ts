import { describe, expect, it } from 'vitest';

import {
  AUTO_DIM_LEVEL,
  DIM_STEPS,
  dimBrightness,
  dimOpacity,
  effectiveDimLevel,
  isNightDimActive,
  shouldBatterySave,
} from '../src/lib/always-on-comfort';

describe('gradation', () => {
  it('assombrit de plus en plus à chaque palier', () => {
    for (let level = 1; level < DIM_STEPS.length; level += 1) {
      expect(dimBrightness(level)).toBeLessThan(dimBrightness(level - 1));
      expect(dimOpacity(level, false)).toBeGreaterThan(dimOpacity(level - 1, false));
    }
  });

  it('n’ajoute pas de voile tant que la luminosité réelle suffit', () => {
    expect(dimOpacity(0, true)).toBe(0);
    expect(dimOpacity(1, true)).toBe(0);
    expect(dimOpacity(1, false)).toBeGreaterThan(0);
  });

  it('borne les paliers hors plage', () => {
    expect(dimOpacity(-3, false)).toBe(dimOpacity(0, false));
    expect(dimBrightness(99)).toBe(dimBrightness(DIM_STEPS.length - 1));
  });
});

describe('isNightDimActive', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 8, 5, hour, minute);

  it('couvre une plage qui franchit minuit', () => {
    expect(isNightDimActive(at(23, 30))).toBe(true);
    expect(isNightDimActive(at(3))).toBe(true);
    expect(isNightDimActive(at(7, 59))).toBe(true);
    expect(isNightDimActive(at(8))).toBe(false);
    expect(isNightDimActive(at(14))).toBe(false);
    expect(isNightDimActive(at(22, 59))).toBe(false);
  });

  it('gère aussi une plage dans la même journée', () => {
    expect(isNightDimActive(at(14), 13, 16)).toBe(true);
    expect(isNightDimActive(at(12), 13, 16)).toBe(false);
    expect(isNightDimActive(at(16), 13, 16)).toBe(false);
  });

  it('ne s’active jamais sur une plage vide', () => {
    expect(isNightDimActive(at(9), 9, 9)).toBe(false);
  });
});

describe('shouldBatterySave', () => {
  it('ne s’active que batterie basse et non branchée', () => {
    expect(shouldBatterySave(0.15, false)).toBe(true);
    expect(shouldBatterySave(0.2, false)).toBe(true);
    expect(shouldBatterySave(0.21, false)).toBe(false);
    expect(shouldBatterySave(0.05, true)).toBe(false);
  });

  it('reste inerte tant que le niveau est inconnu', () => {
    expect(shouldBatterySave(null, false)).toBe(false);
  });
});

describe('effectiveDimLevel', () => {
  it('relève le palier manuel sans jamais le baisser', () => {
    expect(effectiveDimLevel(0, { night: true })).toBe(AUTO_DIM_LEVEL);
    expect(effectiveDimLevel(0, { battery: true })).toBe(AUTO_DIM_LEVEL);
    expect(effectiveDimLevel(3, { night: true })).toBe(3);
    expect(effectiveDimLevel(1, {})).toBe(1);
  });

  it('reste dans la plage des paliers connus', () => {
    expect(effectiveDimLevel(99, { night: true })).toBe(DIM_STEPS.length - 1);
  });
});
