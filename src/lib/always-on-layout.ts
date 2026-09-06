/**
 * Calcul de mise en page de l'écran AlwaysOn (cf. docs/plans/2026-mobile-app.md §4 P1, « écran secondaire »).
 *
 * Isolé de React pour rester testable sur plusieurs ratios d'écran : téléphones
 * 9:16 et 9:20, paysage 16:9 et 20:9, petits écrans et tablettes 4:3 — et désormais
 * sur les quatre dispositions proposées par l'écran.
 */

/**
 * Dispositions de l'écran secondaire. `cycle` alterne les autres au fil du temps et
 * n'est donc jamais passée telle quelle au calcul de mise en page : cf. `resolvePreset`.
 */
export type AlwaysOnPreset =
  | 'overview'
  | 'amount'
  | 'focus'
  | 'planning'
  | 'activity'
  | 'cycle';

/** Disposition réellement affichée à un instant donné. */
export type ResolvedPreset = Exclude<AlwaysOnPreset, 'cycle'>;

/** Dispositions parcourues par le mode `cycle`, dans l'ordre. */
export const CYCLE_PRESETS: ResolvedPreset[] = ['overview', 'focus', 'planning', 'activity'];

/** Durée d'affichage d'une disposition en mode `cycle`. */
export const CYCLE_STEP_MS = 30_000;

/**
 * Disposition à afficher. Le mode Focus retombe sur la vue d'ensemble quand aucun
 * streamer n'est disponible (favoris vides, ou état non encore chargé), pour ne jamais
 * laisser un écran secondaire vide.
 */
export function resolvePreset(
  preset: AlwaysOnPreset,
  elapsedMs: number,
  options: { hasFocus?: boolean } = {},
): ResolvedPreset {
  const hasFocus = options.hasFocus ?? false;
  if (preset === 'cycle') {
    const candidates = hasFocus ? CYCLE_PRESETS : CYCLE_PRESETS.filter((p) => p !== 'focus');
    const step = Math.floor(Math.max(elapsedMs, 0) / CYCLE_STEP_MS);
    return candidates[step % candidates.length];
  }
  if (preset === 'focus' && !hasFocus) return 'overview';
  return preset;
}

export interface AlwaysOnLayoutInput {
  width: number;
  height: number;
  /** Marges système (encoche, barre de gestes) à retirer de la surface utile. */
  insets?: { top: number; bottom: number; left: number; right: number };
  /** Disposition affichée ; `cycle` doit avoir été résolue au préalable. */
  preset?: ResolvedPreset;
  /** Nombre de favoris disponibles à afficher. */
  favoriteCount?: number;
  /** Nombre d'entrées de planning disponibles à afficher. */
  planningCount?: number;
  /** Nombre de derniers dons disponibles à afficher. */
  donationCount?: number;
  /** Nombre de streamers en progression disponibles à afficher. */
  moverCount?: number;
  /** Nombre de glyphes du montant le plus large attendu, ex. `16 636 297 €`. */
  amountGlyphs?: number;
}

export interface AlwaysOnLayout {
  preset: ResolvedPreset;
  orientation: 'portrait' | 'landscape';
  /** Deux colonnes (bloc principal à gauche, liste à droite) dès qu'il y a la place. */
  twoColumns: boolean;
  paddingH: number;
  paddingV: number;
  /** Largeur utile de la colonne principale. */
  mainWidth: number;
  /** Largeur utile de la colonne latérale, `0` en une seule colonne. */
  sideWidth: number;
  /** Taille du montant mis en avant (cagnotte globale, ou perso en mode Focus). */
  amountFontSize: number;
  deltaFontSize: number;
  statValueFontSize: number;
  captionFontSize: number;
  /** Diamètre de l'avatar de la carte Focus. */
  focusAvatarSize: number;
  /** Nombre de favoris qui tiennent réellement à l'écran (max 5, cf. docs/plans/2026-mobile-app.md). */
  favoriteSlots: number;
  /** Nombre d'entrées de planning qui tiennent réellement à l'écran. */
  planningSlots: number;
  /** Nombre de dons du ticker qui tiennent réellement à l'écran. */
  donationSlots: number;
  /** Nombre de streamers en progression qui tiennent réellement à l'écran. */
  moverSlots: number;
  /** Bloc viewers / live / heure. */
  showStats: boolean;
  /** Barre de progression vers le prochain palier rond. */
  showMilestone: boolean;
  /** Amplitude (px) du déplacement anti burn-in, réservée dans les marges. */
  burnInAmplitude: number;
}

interface PresetMetrics {
  /** Part de la hauteur utile que peut occuper le montant, par orientation. */
  amountHeightRatio: { landscape: number; portrait: number };
  /**
   * Taille du montant relative à la référence commune (cf. `referenceAmount`). C'est ce
   * qui garantit la hiérarchie voulue entre dispositions même quand la largeur de la
   * colonne principale, et donc la borne de largeur, varie de l'une à l'autre.
   */
  relativeCap: number;
  minAmount: number;
  maxAmount: number;
  /** Part de la largeur utile prise par la colonne latérale (`0` = une seule colonne). */
  sideRatio: number;
  sideMin: number;
  sideMax: number;
  showStats: boolean;
  showMilestone: boolean;
  list: 'favorites' | 'planning' | 'donations' | 'none';
}

const PRESET_METRICS: Record<ResolvedPreset, PresetMetrics> = {
  overview: {
    relativeCap: 1,
    amountHeightRatio: { landscape: 0.34, portrait: 0.22 },
    minAmount: 26,
    maxAmount: 160,
    sideRatio: 0.34,
    sideMin: 180,
    sideMax: 360,
    showStats: true,
    showMilestone: true,
    list: 'favorites',
  },
  amount: {
    relativeCap: 1.6,
    amountHeightRatio: { landscape: 0.52, portrait: 0.34 },
    minAmount: 32,
    maxAmount: 240,
    sideRatio: 0,
    sideMin: 0,
    sideMax: 0,
    showStats: false,
    showMilestone: true,
    list: 'none',
  },
  focus: {
    relativeCap: 0.62,
    amountHeightRatio: { landscape: 0.24, portrait: 0.15 },
    minAmount: 24,
    maxAmount: 104,
    sideRatio: 0.3,
    sideMin: 170,
    sideMax: 320,
    showStats: false,
    showMilestone: false,
    list: 'favorites',
  },
  activity: {
    relativeCap: 0.34,
    amountHeightRatio: { landscape: 0.14, portrait: 0.1 },
    minAmount: 20,
    maxAmount: 56,
    sideRatio: 0.42,
    sideMin: 240,
    sideMax: 480,
    showStats: false,
    showMilestone: false,
    list: 'donations',
  },
  planning: {
    relativeCap: 0.32,
    amountHeightRatio: { landscape: 0.12, portrait: 0.08 },
    minAmount: 20,
    maxAmount: 48,
    sideRatio: 0.5,
    sideMin: 260,
    sideMax: 560,
    showStats: true,
    showMilestone: false,
    list: 'planning',
  },
};

/** Largeur moyenne d'un glyphe de chiffre en graisse 800, en fraction de la taille de police. */
const DIGIT_WIDTH_RATIO = 0.6;

/** Hauteur d'une ligne de favori (avatar + textes) dans la colonne latérale. */
const FAVORITE_ROW_HEIGHT = 56;

/** Hauteur d'une entrée de planning (titre + créneau + participants). */
const PLANNING_ROW_HEIGHT = 66;

/** Hauteur d'une ligne du ticker de dons (montant + donateur + horodatage). */
const DONATION_ROW_HEIGHT = 58;

/** Hauteur d'une ligne « ça bouge » (avatar + progression + rang). */
const MOVER_ROW_HEIGHT = 52;

/** Trois streamers en progression suffisent : au-delà, la liste ne se lit plus de loin. */
const MAX_MOVER_SLOTS = 3;

/** Le PLAN limite l'écran secondaire au top 5 des favoris. */
const MAX_FAVORITE_SLOTS = 5;

/** Au-delà, le planning devient une liste à lire de près : hors sujet pour cet écran. */
const MAX_PLANNING_SLOTS = 4;

/** Le ticker doit rester un aperçu, pas un journal à faire défiler. */
const MAX_DONATION_SLOTS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeAlwaysOnLayout({
  width,
  height,
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
  preset = 'overview',
  favoriteCount = 0,
  planningCount = 0,
  donationCount = 0,
  moverCount = 0,
  amountGlyphs = 13,
}: AlwaysOnLayoutInput): AlwaysOnLayout {
  const metrics = PRESET_METRICS[preset];
  const safeWidth = Math.max(width - insets.left - insets.right, 1);
  const safeHeight = Math.max(height - insets.top - insets.bottom, 1);
  const orientation = safeWidth >= safeHeight ? 'landscape' : 'portrait';
  const shortSide = Math.min(safeWidth, safeHeight);

  const burnInAmplitude = clamp(Math.round(shortSide * 0.015), 4, 16);
  const paddingH = clamp(Math.round(safeWidth * 0.04), 12, 40) + burnInAmplitude;
  const paddingV = clamp(Math.round(safeHeight * 0.04), 10, 32) + burnInAmplitude;

  const contentWidth = Math.max(safeWidth - paddingH * 2, 1);
  const contentHeight = Math.max(safeHeight - paddingV * 2, 1);

  // Deux colonnes seulement si la colonne latérale reste lisible et si la disposition
  // a effectivement quelque chose à y mettre.
  const listCount =
    metrics.list === 'planning'
      ? planningCount
      : metrics.list === 'donations'
        ? donationCount
        : favoriteCount;
  const twoColumns =
    orientation === 'landscape' && contentWidth >= 560 && metrics.sideRatio > 0 && listCount > 0;
  const columnGap = twoColumns ? 24 : 0;
  const sideWidth = twoColumns
    ? clamp(Math.round(contentWidth * metrics.sideRatio), metrics.sideMin, metrics.sideMax)
    : 0;
  const mainWidth = Math.max(contentWidth - sideWidth - columnGap, 1);

  // Le montant occupe toute la largeur de sa colonne, sans dépasser la part de hauteur
  // que la disposition lui accorde (plus généreuse en paysage, où le reste est à côté).
  // Référence commune à toutes les dispositions : le montant tel que la vue d'ensemble
  // l'afficherait sur toute la largeur. Elle sert d'étalon aux tailles secondaires — les
  // légendes restent lisibles même quand le montant passe au second plan (Focus,
  // Planning) — et à la hiérarchie entre dispositions.
  const referenceAmount = Math.floor(
    clamp(
      Math.min(
        contentWidth / (amountGlyphs * DIGIT_WIDTH_RATIO),
        contentHeight * PRESET_METRICS.overview.amountHeightRatio[orientation],
      ),
      PRESET_METRICS.overview.minAmount,
      PRESET_METRICS.overview.maxAmount,
    ),
  );

  const byWidth = mainWidth / (amountGlyphs * DIGIT_WIDTH_RATIO);
  const byHeight = contentHeight * metrics.amountHeightRatio[orientation];
  // Arrondi vers le bas : la largeur calculée est un maximum à ne pas dépasser.
  const amountFontSize = Math.floor(
    clamp(
      Math.min(byWidth, byHeight, referenceAmount * metrics.relativeCap),
      metrics.minAmount,
      metrics.maxAmount,
    ),
  );

  const deltaFontSize = Math.round(clamp(amountFontSize * 0.3, 14, 44));
  const statValueFontSize = Math.round(clamp(referenceAmount * 0.24, 13, 34));
  const captionFontSize = Math.round(clamp(referenceAmount * 0.14, 10, 18));
  const focusAvatarSize = Math.round(
    clamp(Math.min(shortSide * 0.16, amountFontSize * 1.6), 40, 128),
  );

  // Hauteur restante pour la liste : en deux colonnes elle occupe la colonne latérale
  // entière (moins son titre), sinon ce qui reste sous le bloc principal. La ligne de
  // fraîcheur en pied de page et l'espace inter-blocs sont déduits.
  const footerHeight = captionFontSize * 2.5;
  const blockGap = 16;
  const mainBlockHeight =
    captionFontSize * 2 +
    amountFontSize * 1.3 +
    deltaFontSize * 1.6 +
    (metrics.showStats ? statValueFontSize * 2.6 + captionFontSize * 2 : 0) +
    (metrics.showMilestone ? captionFontSize * 2 + 8 : 0) +
    (preset === 'focus' ? focusAvatarSize + captionFontSize * 6 : 0) +
    // La disposition Activité loge le classement « ça bouge » dans la colonne
    // principale : son titre est réservé ici, ses lignes juste en dessous.
    (preset === 'activity' ? captionFontSize * 2 : 0);

  // Les streamers en progression passent avant le ticker : ils tiennent dans ce qui
  // reste de la colonne principale, le ticker se contente du solde.
  const moverRoom = contentHeight - mainBlockHeight - footerHeight - blockGap;
  const moverSlots =
    preset === 'activity'
      ? clamp(
          Math.floor(Math.max(moverRoom, 0) / MOVER_ROW_HEIGHT),
          0,
          Math.min(MAX_MOVER_SLOTS, Math.max(moverCount, 0)),
        )
      : 0;

  const listHeight = twoColumns
    ? contentHeight - captionFontSize * 2 - footerHeight
    : contentHeight -
      mainBlockHeight -
      moverSlots * MOVER_ROW_HEIGHT -
      footerHeight -
      blockGap * (moverSlots > 0 ? 2 : 1);

  const rowHeight =
    metrics.list === 'planning'
      ? PLANNING_ROW_HEIGHT
      : metrics.list === 'donations'
        ? DONATION_ROW_HEIGHT
        : FAVORITE_ROW_HEIGHT;
  const maxSlots =
    metrics.list === 'planning'
      ? MAX_PLANNING_SLOTS
      : metrics.list === 'donations'
        ? MAX_DONATION_SLOTS
        : MAX_FAVORITE_SLOTS;
  const slots =
    metrics.list === 'none'
      ? 0
      : clamp(
          Math.floor(Math.max(listHeight, 0) / rowHeight),
          0,
          Math.min(maxSlots, Math.max(listCount, 0)),
        );

  return {
    preset,
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
    focusAvatarSize,
    favoriteSlots: metrics.list === 'favorites' ? slots : 0,
    planningSlots: metrics.list === 'planning' ? slots : 0,
    donationSlots: metrics.list === 'donations' ? slots : 0,
    moverSlots,
    showStats: metrics.showStats,
    showMilestone: metrics.showMilestone,
    burnInAmplitude,
  };
}
