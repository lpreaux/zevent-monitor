import { describe, expect, it } from 'vitest';

import {
  buildCandidates,
  buildCompareChart,
  COMPARE_COLORS,
  compareMode,
  defaultSelection,
  displayOf,
  sameSelection,
  splitCandidates,
  toggleCompared,
  type CompareCandidate,
  type CompareSeriesPoint,
  type CompareStreamer,
} from '@/lib/compare-series';
import { formatEuros } from '@/lib/format';
import { formatElapsedLabel } from '@/lib/stats-edition';

/** T+0 de l'édition : l'origine que la page impose à toutes les courbes. */
const ORIGIN = Date.parse('2026-09-03T18:00:00.000Z');
const HOUR = 3_600_000;

/** Deux jours d'axe, comme la page en fournit une fois l'édition lancée. */
const MAX_MINUTES = 48 * 60;

function streamer(twitch: string, display: string, eur: number): CompareStreamer {
  return {
    twitch,
    display,
    profileUrl: `https://cdn.test/${twitch}.png`,
    donationAmount: { number: eur, formatted: `${eur} EUR` },
  };
}

/** Courbe au pas d'une heure : `count` points depuis T+`fromHour`, `startEur` puis `+stepEur`. */
function curve(count: number, startEur: number, stepEur: number, fromHour = 0): CompareSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    bucket: new Date(ORIGIN + (fromHour + index) * HOUR).toISOString(),
    eur: startEur + index * stepEur,
  }));
}

function candidate(login: string, selected = false): CompareCandidate {
  return { login, display: login, profileUrl: null, eur: 0, selected, color: null, fromTop: false };
}

/** L'écart d'échelle qui rendait la section illisible : 800 k€ contre 15 k€. */
const LOPSIDED = {
  live: [streamer('anyme', 'AnyMe', 800_000), streamer('tiny', 'Tiny', 15_000)],
  series: {
    anyme: curve(11, 0, 80_000),
    tiny: curve(11, 0, 1_500),
  } as Record<string, CompareSeriesPoint[]>,
  selection: ['anyme', 'tiny'],
};

function lopsidedChart(mode: 'eur' | 'progress' | 'share') {
  return buildCompareChart({
    selection: LOPSIDED.selection,
    candidates: buildCandidates(LOPSIDED.live, [], LOPSIDED.selection),
    series: LOPSIDED.series,
    mode,
    originAt: ORIGIN,
    maxMinutes: MAX_MINUTES,
  });
}

describe('buildCompareChart — mode « Euros »', () => {
  it('aligne les courbes sur le T+0 de l’édition', () => {
    const chart = lopsidedChart('eur');
    expect(chart.curves.map((c) => c.id)).toEqual(['anyme', 'tiny']);
    expect(chart.curves[0].points.slice(0, 3).map((p) => p.minutes)).toEqual([0, 60, 120]);
    expect(chart.curves[0].points[10].eur).toBe(800_000);
    expect(chart.isEmpty).toBe(false);
  });

  it('nomme et colore chaque courbe d’après l’état officiel', () => {
    const chart = lopsidedChart('eur');
    expect(chart.curves.map((c) => c.label)).toEqual(['AnyMe', 'Tiny']);
    expect(chart.curves.map((c) => c.color)).toEqual([COMPARE_COLORS[0], COMPARE_COLORS[1]]);
    expect(chart.curves[0].value).toBe(formatEuros(800_000));
  });

  it('écrase bel et bien la petite cagnotte : c’est le défaut que les autres modes corrigent', () => {
    const chart = lopsidedChart('eur');
    const tiny = chart.curves[1].points[10].eur;
    expect(tiny / chart.yMax).toBeLessThan(0.02);
  });

  it('n’expose qu’un repère quand les deux porteraient le même libellé', () => {
    const chart = buildCompareChart({
      selection: [],
      candidates: [],
      series: undefined,
      mode: 'eur',
      originAt: ORIGIN,
      maxMinutes: 60,
    });
    expect(chart.referenceLines).toHaveLength(1);
  });
});

describe('buildCompareChart — mode « Progression »', () => {
  /** Streamer relevé à partir de T+10 h seulement : sa courbe démarre sur un socle. */
  const live = [streamer('late', 'Late', 600_000), streamer('small', 'Small', 25_000)];
  const series: Record<string, CompareSeriesPoint[]> = {
    late: curve(6, 500_000, 20_000, 10),
    small: curve(6, 0, 5_000, 10),
  };
  const selection = ['late', 'small'];

  const chart = buildCompareChart({
    selection,
    candidates: buildCandidates(live, [], selection),
    series,
    mode: 'progress',
    originAt: ORIGIN,
    maxMinutes: MAX_MINUTES,
  });

  it('retire le socle déjà acquis à l’ouverture de la fenêtre', () => {
    expect(chart.curves[0].points[0].eur).toBe(0);
    expect(chart.curves[0].points[5].eur).toBe(100_000);
    expect(chart.curves[1].points[0].eur).toBe(0);
    expect(chart.curves[1].points[5].eur).toBe(25_000);
  });

  it('cadre l’axe sur la progression, pas sur les cumuls', () => {
    expect(chart.yMax).toBe(100_000);
  });

  it('chiffre la progression dans la légende', () => {
    expect(chart.curves[0].detail).toBe(`+${formatEuros(100_000)} sur la fenêtre`);
  });
});

describe('buildCompareChart — mode « Part »', () => {
  it('ramène chaque courbe à sa propre cagnotte, quelles que soient les échelles', () => {
    const chart = lopsidedChart('share');
    for (const c of chart.curves) {
      expect(c.points[0].eur).toBeCloseTo(0);
      expect(c.points[10].eur).toBeCloseTo(1);
      expect(Math.max(...c.points.map((p) => p.eur))).toBeLessThanOrEqual(1);
    }
  });

  it('fige l’axe un peu au-dessus de 100 %, repères en pourcentage', () => {
    const chart = lopsidedChart('share');
    expect(chart.yMax).toBeGreaterThan(1);
    expect(chart.yMax).toBeLessThan(1.1);
    expect(chart.referenceLines.map((line) => line.value)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(chart.referenceLines[3].label).toContain('100');
    // La lecture au doigt suit le mode : des pourcentages ici, des euros ailleurs.
    expect(chart.format(0.5)).toContain('50');
    expect(lopsidedChart('eur').format(1_500)).toBe(formatEuros(1_500));
  });

  it('annonce en légende le moment où la moitié du total a été atteinte', () => {
    // Collecte linéaire sur dix heures : la moitié tombe à T+5 h. Le repère est cité tel
    // que `formatElapsedLabel` le rend, espaces insécables comprises.
    expect(lopsidedChart('share').curves[0].detail).toBe(
      `moitié atteinte à ${formatElapsedLabel(5 * 60)}`,
    );
  });
});

describe('buildCompareChart — séries absentes ou hors cadre', () => {
  it('reste vide sans la moindre sélection, sans axe dégénéré pour autant', () => {
    const chart = buildCompareChart({
      selection: [],
      candidates: [],
      series: undefined,
      mode: 'eur',
      originAt: ORIGIN,
      // Une édition qui vient d'ouvrir : l'axe de la page ne fait encore qu'une heure.
      maxMinutes: 60,
    });
    expect(chart.curves).toEqual([]);
    expect(chart.isEmpty).toBe(true);
    expect(chart.spanMinutes).toBe(60);
    expect(chart.xTicks).toEqual([{ minutes: 0, label: '0 h' }]);
  });

  it('garde la courbe dans la légende même sans point à tracer', () => {
    const live = [streamer('anyme', 'AnyMe', 800_000)];
    const chart = buildCompareChart({
      selection: ['anyme'],
      candidates: buildCandidates(live, [], ['anyme']),
      series: {},
      mode: 'eur',
      originAt: ORIGIN,
      maxMinutes: MAX_MINUTES,
    });
    expect(chart.curves).toHaveLength(1);
    expect(chart.curves[0].points).toEqual([]);
    expect(chart.curves[0].value).toBe(formatEuros(800_000));
    expect(chart.isEmpty).toBe(true);
  });

  it('ne trace rien tant que l’édition n’a pas de T+0', () => {
    const chart = buildCompareChart({
      selection: LOPSIDED.selection,
      candidates: buildCandidates(LOPSIDED.live, [], LOPSIDED.selection),
      series: LOPSIDED.series,
      mode: 'eur',
      originAt: null,
      maxMinutes: MAX_MINUTES,
    });
    expect(chart.isEmpty).toBe(true);
  });

  it('écarte les relevés antérieurs au T+0 de l’édition', () => {
    const live = [streamer('anyme', 'AnyMe', 6_000)];
    const chart = buildCompareChart({
      selection: ['anyme'],
      candidates: buildCandidates(live, [], ['anyme']),
      series: { anyme: curve(6, 1_000, 1_000, -3) },
      mode: 'eur',
      originAt: ORIGIN,
      maxMinutes: MAX_MINUTES,
    });
    expect(chart.curves[0].points.map((p) => p.minutes)).toEqual([0, 60, 120]);
    expect(chart.curves[0].points[0].eur).toBe(4_000);
  });

  it('préfère la cagnotte officielle au dernier point agrégé, en retard de dix minutes', () => {
    const live = [streamer('anyme', 'AnyMe', 810_000)];
    const chart = buildCompareChart({
      selection: ['anyme'],
      candidates: buildCandidates(live, [], ['anyme']),
      series: { anyme: LOPSIDED.series.anyme },
      mode: 'eur',
      originAt: ORIGIN,
      maxMinutes: MAX_MINUTES,
    });
    expect(chart.curves[0].value).toBe(formatEuros(810_000));
  });
});

describe('toggleCompared', () => {
  it('coche et décoche sans rien évincer tant qu’il reste de la place', () => {
    expect(toggleCompared(['a'], 'b')).toEqual({ selection: ['a', 'b'], evicted: null });
    expect(toggleCompared(['a', 'b'], 'a')).toEqual({ selection: ['b'], evicted: null });
  });

  it('libère le plus ancien au quatrième coché, et dit lequel', () => {
    expect(toggleCompared(['a', 'b', 'c'], 'd')).toEqual({
      selection: ['b', 'c', 'd'],
      evicted: 'a',
    });
  });

  it('travaille en minuscules, comme le reste des logins', () => {
    expect(toggleCompared(['A'], 'B').selection).toEqual(['a', 'b']);
    expect(toggleCompared(['a'], 'A').selection).toEqual([]);
  });
});

describe('sélection par défaut et pastilles', () => {
  const live = [
    streamer('big', 'Big', 500_000),
    streamer('mid', 'Mid', 300_000),
    streamer('small', 'Small', 100_000),
    streamer('tiny', 'Tiny', 50_000),
  ];

  it('retient les favoris les mieux dotés', () => {
    expect(defaultSelection(live, ['tiny', 'small', 'mid'])).toEqual(['mid', 'small', 'tiny']);
  });

  it('se rabat sur le classement quand aucun favori n’est enregistré', () => {
    expect(defaultSelection(live, [])).toEqual(['big', 'mid', 'small']);
  });

  it('garde un favori que l’état officiel ne connaît pas', () => {
    expect(defaultSelection(live, ['ghost'])).toEqual(['ghost']);
  });

  it('range les favoris devant, puis ce que le classement ajoute', () => {
    const candidates = buildCandidates(live, ['tiny'], ['tiny', 'big']);
    expect(candidates.map((c) => c.login)).toEqual(['tiny', 'big', 'mid', 'small']);
    expect(candidates.map((c) => c.fromTop)).toEqual([false, true, true, true]);
  });

  it('donne à chaque pastille cochée la couleur de sa courbe', () => {
    const candidates = buildCandidates(live, ['tiny'], ['tiny', 'big']);
    expect(candidates.map((c) => c.selected)).toEqual([true, true, false, false]);
    expect(candidates.map((c) => c.color)).toEqual([
      COMPARE_COLORS[0],
      COMPARE_COLORS[1],
      null,
      null,
    ]);
  });

  it('porte le nom affiché et la photo, pas le login brut', () => {
    const candidates = buildCandidates(live, ['tiny'], []);
    expect(candidates[0].display).toBe('Tiny');
    expect(candidates[0].profileUrl).toBe('https://cdn.test/tiny.png');
    expect(displayOf(candidates, 'BIG')).toBe('Big');
  });

  it('se contente du login pour un streamer inconnu de l’état officiel', () => {
    const candidates = buildCandidates([], ['ghost'], ['ghost']);
    expect(candidates[0]).toMatchObject({ display: 'ghost', profileUrl: null, eur: 0 });
  });
});

describe('splitCandidates', () => {
  const pool = 'abcdefghij'.split('').map((login) => candidate(login, login === 'i' || login === 'j'));

  it('garde les pastilles cochées visibles malgré la coupe', () => {
    const { shown, hidden } = splitCandidates(pool, false);
    expect(shown.map((c) => c.login)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'i', 'j']);
    expect(hidden).toBe(2);
  });

  it('rend tout une fois déplié', () => {
    expect(splitCandidates(pool, true).hidden).toBe(0);
    expect(splitCandidates(pool.slice(0, 4), false).hidden).toBe(0);
  });
});

describe('sameSelection', () => {
  it('ignore l’ordre et la casse', () => {
    expect(sameSelection(['a', 'b'], ['B', 'a'])).toBe(true);
    expect(sameSelection(['a'], ['a', 'b'])).toBe(false);
    expect(sameSelection([], [])).toBe(true);
  });
});

describe('compareMode', () => {
  it('retrouve le mode courant et son explication', () => {
    expect(compareMode('share').label).toBe('Part');
    expect(compareMode('eur').hint.length).toBeGreaterThan(0);
  });
});
