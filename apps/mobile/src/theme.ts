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

/**
 * Sens des teintes de l'application. Quatre, et une seule chose à la fois :
 *
 * - **Violet (`brand`)** — ce que l'application propose de faire. Un bouton violet mène
 *   quelque part ou engage quelque chose ; le gris du rang `neutral` sert le reste.
 * - **Émeraude** — au-dessus de la référence : une avance sur 2025, un rang qui monte.
 * - **Rouge** — trois emplois, qui ne se confondent pas parce qu'ils ne portent jamais
 *   sur le même objet : le **direct** (pastille, jauge d'émission, repère du planning),
 *   l'**écart négatif** face à 2025, et l'**erreur**. Ce qui n'est aucun des trois n'a
 *   rien à y faire — le bouton « Maintenant » du planning y figurait parce qu'il ramène
 *   au présent, et il se lisait comme une alerte.
 * - **Gris** — le service et le neutre : ni bonne ni mauvaise nouvelle, rien à décider.
 */
export type Tone = 'ahead' | 'behind' | 'idle';

/**
 * Classe de texte d'un écart chiffré.
 *
 * Ces trois classes étaient réécrites dans cinq fichiers — verdict, rythme, paliers,
 * momentum, carte de partage —, avec déjà une divergence : le cas neutre en `gray-400`
 * d'un côté, `gray-300` de l'autre. Une comparaison ne peut pas changer de couleur
 * selon la section qui l'énonce.
 */
export const TONE_TEXT: Record<Tone, string> = {
  ahead: 'text-emerald-400',
  behind: 'text-red-400',
  idle: 'text-gray-300',
};

/** Même teinte en valeur brute, pour une icône vectorielle ou un tracé en `style`. */
export const TONE_COLOR: Record<Tone, string> = {
  ahead: '#34d399',
  behind: '#f87171',
  idle: colors.textMuted,
};

/**
 * Ton d'un écart chiffré. `null` vaut « pas de comparaison possible » et non « zéro » :
 * une absence de référence se dit en gris, jamais en rouge.
 */
export function toneOf(gap: number | null | undefined): Tone {
  if (gap === null || gap === undefined || gap === 0) return 'idle';
  return gap > 0 ? 'ahead' : 'behind';
}
