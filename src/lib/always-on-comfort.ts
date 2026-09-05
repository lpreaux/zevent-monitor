/**
 * Confort d'un écran laissé allumé des heures : gradation, plage nocturne et
 * économie de batterie. Logique pure (aucun import React Native) pour rester testable ;
 * la prise en main du matériel est dans `@/lib/use-screen-comfort`.
 */

/**
 * Paliers de gradation. On baisse d'abord la luminosité réelle de l'écran — seul moyen
 * d'épargner le rétroéclairage et la batterie — et on n'ajoute un voile noir que sous le
 * plancher matériel. Quand `expo-brightness` est indisponible (web, dev client non
 * reconstruit), `veilOnly` reproduit la gradation d'origine avec le seul voile.
 */
export interface DimStep {
  /** Luminosité de la fenêtre applicative, dans `[0, 1]`. */
  brightness: number;
  /** Opacité du voile noir quand la luminosité réelle est pilotable. */
  veil: number;
  /** Opacité du voile noir quand elle ne l'est pas. */
  veilOnly: number;
}

export const DIM_STEPS: DimStep[] = [
  { brightness: 1, veil: 0, veilOnly: 0 },
  { brightness: 0.4, veil: 0, veilOnly: 0.35 },
  { brightness: 0.12, veil: 0.3, veilOnly: 0.6 },
  { brightness: 0.01, veil: 0.6, veilOnly: 0.8 },
];

export const DIM_STEP_COUNT = DIM_STEPS.length;

/** Palier imposé par la nuit automatique et par l'économie de batterie. */
export const AUTO_DIM_LEVEL = 2;

/** Plage nocturne par défaut (heures locales), franchissant minuit. */
export const NIGHT_DIM_FROM_HOUR = 23;
export const NIGHT_DIM_TO_HOUR = 8;

/** Sous ce niveau de batterie et sans alimentation, l'écran s'assombrit tout seul. */
export const BATTERY_SAVER_THRESHOLD = 0.2;

function dimStep(level: number): DimStep {
  const index = Math.min(Math.max(Math.round(level), 0), DIM_STEPS.length - 1);
  return DIM_STEPS[index] ?? DIM_STEPS[0];
}

/**
 * Opacité du voile de gradation pour l'index de palier courant. `brightnessSupported`
 * indique si la luminosité réelle a pu être prise en main : sinon le voile assure seul
 * toute la gradation.
 */
export function dimOpacity(level: number, brightnessSupported = false): number {
  const step = dimStep(level);
  return brightnessSupported ? step.veil : step.veilOnly;
}

/** Luminosité applicative visée pour l'index de palier courant. */
export function dimBrightness(level: number): number {
  return dimStep(level).brightness;
}

/**
 * Vrai pendant la plage nocturne. La plage franchit minuit (23 h → 8 h) : on teste donc
 * l'union des deux intervalles quand `fromHour > toHour`.
 */
export function isNightDimActive(
  date: Date,
  fromHour = NIGHT_DIM_FROM_HOUR,
  toHour = NIGHT_DIM_TO_HOUR,
): boolean {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (fromHour === toHour) return false;
  return fromHour < toHour
    ? hour >= fromHour && hour < toHour
    : hour >= fromHour || hour < toHour;
}

/** Vrai quand la batterie est basse et l'appareil non alimenté. */
export function shouldBatterySave(level: number | null, charging: boolean): boolean {
  if (charging || level == null) return false;
  return level <= BATTERY_SAVER_THRESHOLD;
}

/**
 * Palier de gradation réellement appliqué : le réglage manuel, relevé au minimum par
 * les gradations automatiques. On ne descend jamais en dessous du choix de l'utilisateur.
 */
export function effectiveDimLevel(
  manualLevel: number,
  auto: { night?: boolean; battery?: boolean } = {},
): number {
  const automatic = auto.night || auto.battery ? AUTO_DIM_LEVEL : 0;
  return Math.min(Math.max(manualLevel, automatic), DIM_STEPS.length - 1);
}
