import { describe, expect, it } from 'vitest';

import { buildEditionsOverview, CURRENT_EDITION_YEAR } from '@/lib/editions';

/**
 * Les tests portent sur le contenu réellement embarqué plutôt que sur des éditions
 * factices : c'est ce contenu qui décide du rang affiché, et une correction de total
 * dans src/content/editions.json doit se voir ici avant de se voir à l'écran.
 */
const TOTAL_2025 = 16_179_096;
const TOTAL_2024 = 10_145_881;

describe('buildEditionsOverview — le classement', () => {
  it('situe l’édition en cours entre deux éditions passées', () => {
    // Juste sous 2024, donc derrière 2025, 2022 et 2024.
    const overview = buildEditionsOverview({ totalEur: 10_100_000, streamers: 350 });

    expect(overview.currentRank).toBe(4);
    expect(overview.target?.year).toBe(2024);
    expect(overview.gapEur).toBe(TOTAL_2024 - 10_100_000);
    expect(overview.runnerUp).toBeNull();
    expect(overview.leadEur).toBeNull();
  });

  it('affiche les éditions de la plus récente à la plus ancienne, l’édition en cours en tête', () => {
    const overview = buildEditionsOverview({ totalEur: 1_000_000, streamers: 350 });

    expect(overview.editions.map((edition) => edition.year)).toEqual([
      2026, 2025, 2024, 2022, 2021, 2020, 2019, 2018, 2017, 2016,
    ]);
    expect(overview.editions[0].live).toBe(true);
    expect(overview.ranked[0].year).toBe(2025);
  });

  it('ne réclame plus rien à dépasser quand 2026 est en tête', () => {
    const overview = buildEditionsOverview({ totalEur: 20_000_000, streamers: 400 });

    expect(overview.currentRank).toBe(1);
    expect(overview.target).toBeNull();
    expect(overview.gapEur).toBeNull();
    expect(overview.runnerUp?.year).toBe(2025);
    expect(overview.leadEur).toBe(20_000_000 - TOTAL_2025);
  });

  it('classe l’édition en cours devant celle qu’elle vient d’égaler', () => {
    const overview = buildEditionsOverview({ totalEur: TOTAL_2024, streamers: 350 });

    expect(overview.currentRank).toBe(3);
    expect(overview.target?.year).toBe(2022);
    expect(overview.ranked[2].year).toBe(CURRENT_EDITION_YEAR);
  });
});

describe('buildEditionsOverview — sans édition en cours', () => {
  it('garde les éditions passées quand la cagnotte est encore à zéro', () => {
    const overview = buildEditionsOverview({ totalEur: 0, streamers: 0 });

    expect(overview.current).toBeNull();
    expect(overview.currentRank).toBeNull();
    expect(overview.target).toBeNull();
    expect(overview.gapEur).toBeNull();
    expect(overview.leadEur).toBeNull();
    // Le point du chantier : neuf éditions restent parfaitement affichables.
    expect(overview.editions).toHaveLength(9);
    expect(overview.editions.every((edition) => !edition.live)).toBe(true);
    expect(overview.editions[0].year).toBe(2025);
  });

  it('se comporte pareil quand le backend n’a rien donné du tout', () => {
    const muet = buildEditionsOverview(null);
    const zero = buildEditionsOverview({ totalEur: 0, streamers: 0 });

    expect(muet.editions).toEqual(zero.editions);
    expect(muet.current).toBeNull();
    expect(muet.previous?.year).toBe(2025);
  });

  it('ignore une cagnotte non chiffrée plutôt que de la classer', () => {
    const overview = buildEditionsOverview({ totalEur: Number.NaN, streamers: 350 });

    expect(overview.current).toBeNull();
    expect(overview.editions).toHaveLength(9);
  });
});

describe('buildEditionsOverview — le pied de section', () => {
  it('relève l’année sans ZEvent', () => {
    expect(buildEditionsOverview(null).missingYears).toEqual([2023]);
  });

  it('relève les éditions comptées deux fois', () => {
    const disputed = buildEditionsOverview(null).disputed;

    expect(disputed.map((edition) => edition.year)).toEqual([2025]);
    expect(disputed[0].totalSource).toBe('zevent.fr');
    expect(disputed[0].altTotalSource).toBe('Streamlabs Charity');
    expect(disputed[0].altTotalEur).toBe(16_636_297);
  });

  it('porte le nom et les dates du contenu figé', () => {
    const editions = buildEditionsOverview(null).editions;
    const first = editions[editions.length - 1];

    expect(first.year).toBe(2016);
    expect(first.label).toBe('Projet Avengers');
    expect(first.dates).toBe('4–6 mars 2016');
  });
});

describe('buildEditionsOverview — euros par streamer', () => {
  it('divise le total par les inscrits', () => {
    const overview = buildEditionsOverview({ totalEur: 1_000_000, streamers: 400 });

    expect(overview.current?.eurPerStreamer).toBe(2_500);
    expect(overview.previous?.eurPerStreamer).toBeCloseTo(TOTAL_2025 / 327);
  });

  it('ne divise pas par des inscrits inconnus', () => {
    const overview = buildEditionsOverview({ totalEur: 1_000_000, streamers: 0 });

    expect(overview.current?.eurPerStreamer).toBeNull();
  });
});
