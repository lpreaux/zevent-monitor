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
  /**
   * Couleurs des comparaisons chiffrées. L'édition en cours prend le violet de marque
   * (`brand`), les éditions passées cet ambre, et une troisième série — comparer trois
   * streamers — ce cyan. Elles sont posées ici parce qu'une même teinte doit signifier
   * la même chose d'une section à l'autre : l'ambre de la courbe 2025, celui des barres
   * d'éditions closes et celui du repère de rythme sont le même fait, vu trois fois.
   */
  editionPast: '#f59e0b',
  compareThird: '#22d3ee',
} as const;
