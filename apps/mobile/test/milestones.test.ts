import { describe, expect, it } from 'vitest';

import { formatEta, milestoneEtaMinutes, milestoneStep, nextMilestone } from '../src/lib/milestones';

describe('milestoneStep', () => {
  it('suit l’ordre de grandeur de la cagnotte', () => {
    expect(milestoneStep(500)).toBe(1_000);
    expect(milestoneStep(42_000)).toBe(10_000);
    expect(milestoneStep(650_000)).toBe(100_000);
    expect(milestoneStep(12_400_000)).toBe(1_000_000);
  });
});

describe('nextMilestone', () => {
  it('vise le prochain million une fois le premier franchi', () => {
    const milestone = nextMilestone(12_400_000);
    expect(milestone?.previous).toBe(12_000_000);
    expect(milestone?.target).toBe(13_000_000);
    expect(milestone?.remaining).toBe(600_000);
    expect(milestone?.ratio).toBeCloseTo(0.4);
  });

  it('vise le palier suivant quand on est pile dessus', () => {
    const milestone = nextMilestone(3_000_000);
    expect(milestone?.target).toBe(4_000_000);
    expect(milestone?.ratio).toBe(0);
  });

  it('vise le premier million en toute fin de montée', () => {
    const milestone = nextMilestone(985_000);
    expect(milestone?.target).toBe(1_000_000);
    expect(milestone?.remaining).toBe(15_000);
    expect(milestone?.ratio).toBeCloseTo(0.85);
  });

  it('refuse les montants invalides', () => {
    expect(nextMilestone(Number.NaN)).toBeNull();
    expect(nextMilestone(-1)).toBeNull();
  });
});

describe('milestoneEtaMinutes', () => {
  it('convertit le reste au rythme horaire', () => {
    expect(milestoneEtaMinutes(300_000, 600_000)).toBeCloseTo(30);
    expect(milestoneEtaMinutes(0, 1_000)).toBe(0);
  });

  it('n’estime rien sans rythme exploitable', () => {
    expect(milestoneEtaMinutes(500_000, null)).toBeNull();
    expect(milestoneEtaMinutes(500_000, 0)).toBeNull();
    expect(milestoneEtaMinutes(500_000, -1_000)).toBeNull();
  });

  it('n’extrapole pas au-delà de deux jours', () => {
    expect(milestoneEtaMinutes(1_000_000, 100)).toBeNull();
  });
});

describe('formatEta', () => {
  it('rend une estimation lisible', () => {
    expect(formatEta(0)).toBe('≈ imminent');
    expect(formatEta(25)).toBe('≈ 25 min');
    expect(formatEta(190)).toBe('≈ 3 h 10');
    expect(formatEta(120)).toBe('≈ 2 h');
    expect(formatEta(1_440)).toBe('≈ 1 j');
    expect(formatEta(1_680)).toBe('≈ 1 j 4 h');
  });

  it('ne rend rien sans estimation', () => {
    expect(formatEta(null)).toBeNull();
  });
});
