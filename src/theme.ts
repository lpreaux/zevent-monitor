/**
 * Jetons de couleur partagés entre NativeWind et les vues qui n'acceptent que des
 * valeurs brutes (options de navigation, icônes vectorielles, RefreshControl).
 * Toute couleur ajoutée ici doit rester alignée sur `tailwind.config.js`.
 */
export const colors = {
  background: '#030712',
  surface: '#0b1120',
  surfaceRaised: '#111a2e',
  text: '#f9fafb',
  textMuted: '#9ca3af',
  brand: '#8b5cf6',
  brandBright: '#a78bfa',
  brandSoft: '#c4b5fd',
  /** Onglet inactif du menu du bas. */
  inactive: '#7b8494',
} as const;
