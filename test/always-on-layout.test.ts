import { describe, expect, it } from 'vitest';

import { computeAlwaysOnLayout } from '../src/lib/always-on-layout';

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
    expect(computeAlwaysOnLayout({ width: 915, height: 412 }).twoColumns).toBe(true);
    expect(computeAlwaysOnLayout({ width: 1024, height: 768 }).twoColumns).toBe(true);
    expect(computeAlwaysOnLayout({ width: 412, height: 915 }).twoColumns).toBe(false);
    expect(computeAlwaysOnLayout({ width: 768, height: 1024 }).twoColumns).toBe(false);
  });

  it('reste sur une colonne quand la colonne latérale serait illisible', () => {
    // Paysage étroit (multi-fenêtre Android) : pas la place pour deux colonnes.
    const layout = computeAlwaysOnLayout({ width: 520, height: 360 });
    expect(layout.twoColumns).toBe(false);
    expect(layout.sideWidth).toBe(0);
  });

  it('n’affiche pas plus de favoris qu’il n’en existe', () => {
    expect(computeAlwaysOnLayout({ width: 412, height: 915, favoriteCount: 0 }).favoriteSlots).toBe(0);
    expect(computeAlwaysOnLayout({ width: 412, height: 915, favoriteCount: 2 }).favoriteSlots).toBe(2);
  });

  it('retire les marges système de la surface utile', () => {
    const plain = computeAlwaysOnLayout({ width: 412, height: 915 });
    const notched = computeAlwaysOnLayout({ width: 412, height: 915, insets: NOTCH });
    expect(notched.amountFontSize).toBeLessThanOrEqual(plain.amountFontSize);

    const landscape = computeAlwaysOnLayout({
      width: 915,
      height: 412,
      insets: NOTCH_LANDSCAPE,
    });
    expect(landscape.orientation).toBe('landscape');
    expect(amountWidth(landscape.amountFontSize)).toBeLessThanOrEqual(landscape.mainWidth + 1);
    expect(landscape.mainWidth + landscape.sideWidth + 24).toBeLessThanOrEqual(
      915 - NOTCH_LANDSCAPE.left - NOTCH_LANDSCAPE.right - landscape.paddingH * 2 + 1,
    );
  });

  it('ne renvoie jamais de dimension négative sur une surface dégénérée', () => {
    const layout = computeAlwaysOnLayout({ width: 1, height: 1, favoriteCount: 5 });
    expect(layout.mainWidth).toBeGreaterThan(0);
    expect(layout.favoriteSlots).toBe(0);
    expect(layout.amountFontSize).toBeGreaterThan(0);
  });
});
