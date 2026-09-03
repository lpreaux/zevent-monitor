/**
 * Calcul de mise en page de l'écran AlwaysOn (cf. PLAN.md §4 P1, « écran secondaire »).
 *
 * Isolé de React pour rester testable sur plusieurs ratios d'écran : téléphones
 * 9:16 et 9:20, paysage 16:9 et 20:9, petits écrans et tablettes 4:3.
 */

export interface AlwaysOnLayoutInput {
  width: number;
  height: number;
  /** Marges système (encoche, barre de gestes) à retirer de la surface utile. */
  insets?: { top: number; bottom: number; left: number; right: number };
  /** Nombre de favoris disponibles à afficher. */
  favoriteCount?: number;
  /** Nombre de glyphes du montant le plus large attendu, ex. `16 636 297 €`. */
  amountGlyphs?: number;
}

export interface AlwaysOnLayout {
  orientation: 'portrait' | 'landscape';
  /** Deux colonnes (cagnotte à gauche, favoris à droite) dès qu'il y a la place. */
  twoColumns: boolean;
  paddingH: number;
  paddingV: number;
  /** Largeur utile de la colonne principale (cagnotte). */
  mainWidth: number;
  /** Largeur utile de la colonne latérale, `0` en une seule colonne. */
  sideWidth: number;
  amountFontSize: number;
  deltaFontSize: number;
  statValueFontSize: number;
  captionFontSize: number;
  /** Nombre de favoris qui tiennent réellement à l'écran (max 5, cf. PLAN.md). */
  favoriteSlots: number;
  /** Amplitude (px) du déplacement anti burn-in, réservée dans les marges. */
  burnInAmplitude: number;
}

/** Largeur moyenne d'un glyphe de chiffre en graisse 800, en fraction de la taille de police. */
const DIGIT_WIDTH_RATIO = 0.6;

/** Hauteur d'une ligne de favori (avatar + textes) dans la colonne latérale. */
const FAVORITE_ROW_HEIGHT = 56;

/** Le PLAN limite l'écran secondaire au top 5 des favoris. */
const MAX_FAVORITE_SLOTS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeAlwaysOnLayout({
  width,
  height,
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
  favoriteCount = 0,
  amountGlyphs = 13,
}: AlwaysOnLayoutInput): AlwaysOnLayout {
  const safeWidth = Math.max(width - insets.left - insets.right, 1);
  const safeHeight = Math.max(height - insets.top - insets.bottom, 1);
  const orientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const shortSide = Math.min(safeWidth, safeHeight);

  const burnInAmplitude = clamp(Math.round(shortSide * 0.015), 4, 16);
  const paddingH = clamp(Math.round(safeWidth * 0.04), 12, 40) + burnInAmplitude;
  const paddingV = clamp(Math.round(safeHeight * 0.04), 10, 32) + burnInAmplitude;

  const contentWidth = Math.max(safeWidth - paddingH * 2, 1);
  const contentHeight = Math.max(safeHeight - paddingV * 2, 1);

  // Deux colonnes seulement si la colonne latérale reste lisible (>= 180 px).
  const twoColumns = orientation === 'landscape' && contentWidth >= 560;
  const columnGap = twoColumns ? 24 : 0;
  const sideWidth = twoColumns
    ? clamp(Math.round(contentWidth * 0.34), 180, 360)
    : 0;
  const mainWidth = Math.max(contentWidth - sideWidth - columnGap, 1);

  // La cagnotte occupe toute la largeur de sa colonne, sans dépasser une part
  // raisonnable de la hauteur (plus généreuse en paysage, où le reste est à côté).
  const byWidth = mainWidth / (amountGlyphs * DIGIT_WIDTH_RATIO);
  const byHeight = contentHeight * (orientation === 'landscape' ? 0.34 : 0.22);
  // Arrondi vers le bas : la largeur calculée est un maximum à ne pas dépasser.
  const amountFontSize = Math.floor(clamp(Math.min(byWidth, byHeight), 26, 160));

  const deltaFontSize = Math.round(clamp(amountFontSize * 0.3, 14, 44));
  const statValueFontSize = Math.round(clamp(amountFontSize * 0.24, 13, 34));
  const captionFontSize = Math.round(clamp(amountFontSize * 0.14, 10, 18));

  // Hauteur restante pour les favoris : en deux colonnes ils occupent la colonne
  // latérale entière (moins son titre), sinon ce qui reste sous le bloc cagnotte.
  // La ligne de fraîcheur en pied de page et l'espace inter-blocs sont déduits.
  const footerHeight = captionFontSize * 2.5;
  const blockGap = 16;
  const favoritesHeight = twoColumns
    ? contentHeight - captionFontSize * 2 - footerHeight
    : contentHeight -
      amountFontSize * 1.3 -
      deltaFontSize * 1.6 -
      statValueFontSize * 2.6 -
      captionFontSize * 4 -
      footerHeight -
      blockGap;
  const favoriteSlots = clamp(
    Math.floor(Math.max(favoritesHeight, 0) / FAVORITE_ROW_HEIGHT),
    0,
    Math.min(MAX_FAVORITE_SLOTS, Math.max(favoriteCount, 0)),
  );

  return {
    orientation,
    twoColumns,
    paddingH,
    paddingV,
    mainWidth,
    sideWidth,
    amountFontSize,
    deltaFontSize,
    statValueFontSize,
    captionFontSize,
    favoriteSlots,
    burnInAmplitude,
  };
}
