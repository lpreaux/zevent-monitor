import { describe, expect, it } from 'vitest';

import {
  computeAlwaysOnLayout,
  CYCLE_PRESETS,
  CYCLE_STEP_MS,
  resolvePreset,
  type ResolvedPreset,
} from '../src/lib/always-on-layout';

/** Ratios couverts : 16:9, 9:20, 4:3, petit écran, tablette, avec et sans encoche. */
const SCREENS = [
  { name: 'petit téléphone 320×480 (2:3)', width: 320, height: 480 },
  { name: 'téléphone 16:9 portrait 360×640', width: 360, height: 640 },
  { name: 'téléphone 16:9 paysage 640×360', width: 640, height: 360 },
  { name: 'téléphone 9:20 portrait 412×915', width: 412, height: 915 },
  { name: 'téléphone 9:20 paysage 915×412', width: 915, height: 412 },
  { name: 'tablette 4:3 portrait 768×1024', width: 768, height: 1024 },
  { name: 'tablette 4:3 paysage 1024×768', width: 1024, height: 768 },
] as const;

const PRESETS: ResolvedPreset[] = ['overview', 'amount', 'focus', 'planning', 'activity'];

const NOTCH = { top: 44, bottom: 34, left: 0, right: 0 };
const NOTCH_LANDSCAPE = { top: 0, bottom: 21, left: 44, right: 44 };

/** Largeur occupée par le montant, avec la même hypothèse que le module. */
function amountWidth(fontSize: number, glyphs = 13): number {
  return fontSize * glyphs * 0.6;
}

describe('computeAlwaysOnLayout', () => {
  for (const screen of SCREENS) {
    describe(screen.name, () => {
      const layout = computeAlwaysOnLayout({
        width: screen.width,
        height: screen.height,
        favoriteCount: 8,
      });

      it('détecte la bonne orientation', () => {
        expect(layout.orientation).toBe(screen.width >= screen.height ? 'landscape' : 'portrait');
      });

      it('garde la cagnotte dans sa colonne', () => {
        expect(amountWidth(layout.amountFontSize)).toBeLessThanOrEqual(layout.mainWidth + 1);
      });

      it('reste lisible à distance', () => {
        expect(layout.amountFontSize).toBeGreaterThanOrEqual(26);
        expect(layout.statValueFontSize).toBeGreaterThanOrEqual(13);
        expect(layout.captionFontSize).toBeGreaterThanOrEqual(10);
      });

      it('réserve les marges et le déplacement anti burn-in dans l’écran', () => {
        expect(layout.burnInAmplitude).toBeGreaterThanOrEqual(4);
        expect(layout.paddingH * 2).toBeLessThan(screen.width);
        expect(layout.paddingV * 2).toBeLessThan(screen.height);
        expect(layout.paddingH).toBeGreaterThanOrEqual(layout.burnInAmplitude);
        expect(layout.paddingV).toBeGreaterThanOrEqual(layout.burnInAmplitude);
      });

      it('limite les favoris à ce qui tient réellement', () => {
        expect(layout.favoriteSlots).toBeLessThanOrEqual(5);
        const contentHeight = screen.height - layout.paddingV * 2;
        expect(layout.favoriteSlots * 56).toBeLessThanOrEqual(contentHeight);
      });

      it('garde les colonnes dans la largeur utile', () => {
        const gap = layout.twoColumns ? 24 : 0;
        expect(layout.mainWidth + layout.sideWidth + gap).toBeLessThanOrEqual(
          screen.width - layout.paddingH * 2 + 1,
        );
      });
    });
  }

  it('passe en deux colonnes en paysage seulement', () => {
    expect(computeAlwaysOnLayout({ width: 915, height: 412, favoriteCount: 3 }).twoColumns).toBe(
      true,
    );
    expect(computeAlwaysOnLayout({ width: 1024, height: 768, favoriteCount: 3 }).twoColumns).toBe(
      true,
    );
    expect(computeAlwaysOnLayout({ width: 412, height: 915, favoriteCount: 3 }).twoColumns).toBe(
      false,
    );
    expect(computeAlwaysOnLayout({ width: 768, height: 1024, favoriteCount: 3 }).twoColumns).toBe(
      false,
    );
  });

  it('reste sur une colonne quand la colonne latérale serait illisible', () => {
    // Paysage étroit (multi-fenêtre Android) : pas la place pour deux colonnes.
    const layout = computeAlwaysOnLayout({ width: 520, height: 360, favoriteCount: 3 });
    expect(layout.twoColumns).toBe(false);
    expect(layout.sideWidth).toBe(0);
  });

  it('ne réserve pas de colonne pour une liste vide', () => {
    const layout = computeAlwaysOnLayout({ width: 915, height: 412, favoriteCount: 0 });
    expect(layout.twoColumns).toBe(false);
    expect(layout.sideWidth).toBe(0);
  });

  it('n’affiche pas plus de favoris qu’il n’en existe', () => {
    expect(computeAlwaysOnLayout({ width: 412, height: 915, favoriteCount: 0 }).favoriteSlots).toBe(
      0,
    );
    expect(computeAlwaysOnLayout({ width: 412, height: 915, favoriteCount: 2 }).favoriteSlots).toBe(
      2,
    );
  });

  it('retire les marges système de la surface utile', () => {
    const plain = computeAlwaysOnLayout({ width: 412, height: 915, favoriteCount: 5 });
    const notched = computeAlwaysOnLayout({
      width: 412,
      height: 915,
      insets: NOTCH,
      favoriteCount: 5,
    });
    expect(notched.amountFontSize).toBeLessThanOrEqual(plain.amountFontSize);

    const landscape = computeAlwaysOnLayout({
      width: 915,
      height: 412,
      insets: NOTCH_LANDSCAPE,
      favoriteCount: 5,
    });
    expect(landscape.orientation).toBe('landscape');
    expect(amountWidth(landscape.amountFontSize)).toBeLessThanOrEqual(landscape.mainWidth + 1);
    expect(landscape.mainWidth + landscape.sideWidth + 24).toBeLessThanOrEqual(
      915 - NOTCH_LANDSCAPE.left - NOTCH_LANDSCAPE.right - landscape.paddingH * 2 + 1,
    );
  });

  it('ne renvoie jamais de dimension négative sur une surface dégénérée', () => {
    for (const preset of PRESETS) {
      const layout = computeAlwaysOnLayout({
        width: 1,
        height: 1,
        preset,
        favoriteCount: 5,
        planningCount: 5,
        donationCount: 5,
        moverCount: 5,
      });
      expect(layout.mainWidth).toBeGreaterThan(0);
      expect(layout.favoriteSlots).toBe(0);
      expect(layout.planningSlots).toBe(0);
      expect(layout.donationSlots).toBe(0);
      expect(layout.moverSlots).toBe(0);
      expect(layout.amountFontSize).toBeGreaterThan(0);
    }
  });

  describe('dispositions', () => {
    for (const preset of PRESETS) {
      for (const screen of SCREENS) {
        const layout = computeAlwaysOnLayout({
          width: screen.width,
          height: screen.height,
          preset,
          favoriteCount: 8,
          planningCount: 6,
          donationCount: 8,
          moverCount: 5,
        });

        it(`${preset} — ${screen.name} : le montant tient dans sa colonne`, () => {
          expect(layout.preset).toBe(preset);
          expect(amountWidth(layout.amountFontSize)).toBeLessThanOrEqual(layout.mainWidth + 1);
        });

        it(`${preset} — ${screen.name} : les légendes restent lisibles`, () => {
          expect(layout.captionFontSize).toBeGreaterThanOrEqual(10);
          expect(layout.statValueFontSize).toBeGreaterThanOrEqual(13);
          expect(layout.amountFontSize).toBeGreaterThanOrEqual(20);
        });

        it(`${preset} — ${screen.name} : les listes tiennent dans la hauteur utile`, () => {
          const contentHeight = screen.height - layout.paddingV * 2;
          expect(layout.favoriteSlots * 56).toBeLessThanOrEqual(contentHeight);
          expect(layout.planningSlots * 66).toBeLessThanOrEqual(contentHeight);
          expect(layout.donationSlots * 58).toBeLessThanOrEqual(contentHeight);
          expect(layout.moverSlots * 52).toBeLessThanOrEqual(contentHeight);
          expect(layout.favoriteSlots).toBeLessThanOrEqual(5);
          expect(layout.planningSlots).toBeLessThanOrEqual(4);
          expect(layout.donationSlots).toBeLessThanOrEqual(5);
          expect(layout.moverSlots).toBeLessThanOrEqual(3);
        });

        it(`${preset} — ${screen.name} : « ça bouge » n'apparaît qu'en disposition Activité`, () => {
          if (preset !== 'activity') expect(layout.moverSlots).toBe(0);
        });
      }
    }

    it('n’affiche qu’une seule liste latérale par disposition', () => {
      for (const preset of PRESETS) {
        const layout = computeAlwaysOnLayout({
          width: 1024,
          height: 768,
          preset,
          favoriteCount: 8,
          planningCount: 6,
          donationCount: 8,
          moverCount: 5,
        });
        const used = [layout.favoriteSlots, layout.planningSlots, layout.donationSlots].filter(
          (slots) => slots > 0,
        );
        expect(used.length).toBeLessThanOrEqual(1);
      }
    });

    it('loge « ça bouge » et le ticker ensemble en disposition Activité', () => {
      const layout = computeAlwaysOnLayout({
        width: 1024,
        height: 768,
        preset: 'activity',
        donationCount: 8,
        moverCount: 5,
      });
      expect(layout.moverSlots).toBeGreaterThan(0);
      expect(layout.donationSlots).toBeGreaterThan(0);
      expect(layout.twoColumns).toBe(true);
    });

    it('garde les deux blocs de l’Activité dans la hauteur en une seule colonne', () => {
      const layout = computeAlwaysOnLayout({
        width: 412,
        height: 915,
        preset: 'activity',
        donationCount: 8,
        moverCount: 5,
      });
      expect(layout.twoColumns).toBe(false);
      const contentHeight = 915 - layout.paddingV * 2;
      expect(layout.moverSlots * 52 + layout.donationSlots * 58).toBeLessThanOrEqual(contentHeight);
    });

    it('donne le montant le plus grand en Cagnotte XXL et le plus petit en Planning', () => {
      const sizes = Object.fromEntries(
        PRESETS.map((preset) => [
          preset,
          computeAlwaysOnLayout({
            width: 915,
            height: 412,
            preset,
            favoriteCount: 5,
            planningCount: 4,
          }).amountFontSize,
        ]),
      );
      expect(sizes.amount).toBeGreaterThan(sizes.overview);
      expect(sizes.overview).toBeGreaterThan(sizes.focus);
      expect(sizes.focus).toBeGreaterThan(sizes.planning);
    });

    it('garde des légendes de même taille d’une disposition à l’autre', () => {
      const captions = PRESETS.map(
        (preset) =>
          computeAlwaysOnLayout({
            width: 915,
            height: 412,
            preset,
            favoriteCount: 5,
            planningCount: 4,
          }).captionFontSize,
      );
      expect(new Set(captions).size).toBe(1);
    });

    it('n’affiche stats et palier que là où c’est prévu', () => {
      const amount = computeAlwaysOnLayout({ width: 915, height: 412, preset: 'amount' });
      expect(amount.showStats).toBe(false);
      expect(amount.showMilestone).toBe(true);
      expect(amount.favoriteSlots).toBe(0);

      const focus = computeAlwaysOnLayout({
        width: 915,
        height: 412,
        preset: 'focus',
        favoriteCount: 4,
      });
      expect(focus.showMilestone).toBe(false);
      expect(focus.focusAvatarSize).toBeGreaterThanOrEqual(40);
    });
  });
});

describe('resolvePreset', () => {
  it('laisse passer les dispositions fixes', () => {
    expect(resolvePreset('overview', 0)).toBe('overview');
    expect(resolvePreset('planning', 999_999)).toBe('planning');
  });

  it('retombe sur la vue d’ensemble quand aucun streamer n’est disponible', () => {
    expect(resolvePreset('focus', 0)).toBe('overview');
    expect(resolvePreset('focus', 0, { hasFocus: true })).toBe('focus');
  });

  it('alterne les dispositions en mode cycle', () => {
    const seen = CYCLE_PRESETS.map((_, index) =>
      resolvePreset('cycle', index * CYCLE_STEP_MS, { hasFocus: true }),
    );
    expect(seen).toEqual(CYCLE_PRESETS);
    expect(resolvePreset('cycle', CYCLE_PRESETS.length * CYCLE_STEP_MS, { hasFocus: true })).toBe(
      CYCLE_PRESETS[0],
    );
  });

  it('saute le Focus dans le cycle quand il n’y a personne à afficher', () => {
    const seen = [0, 1, 2, 3, 4, 5].map((step) => resolvePreset('cycle', step * CYCLE_STEP_MS));
    expect(seen).not.toContain('focus');
    expect(new Set(seen)).toEqual(new Set(CYCLE_PRESETS.filter((p) => p !== 'focus')));
  });
});
