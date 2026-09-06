/**
 * La phrase que l'écran des statistiques doit dire en premier.
 *
 * Une page de comparaison peut toujours afficher deux courbes et laisser conclure ;
 * celle-ci répond d'abord, parce que c'est la seule question qu'on se pose en y
 * arrivant — « on est en avance ou en retard sur 2025 ? ». Le calcul tient en une
 * soustraction, mais l'énoncé, lui, a quatre cas, et c'est pour eux que ce module
 * existe : au tout début de l'édition, l'écart n'a pas de sens, et un « +100 %
 * d'avance » affiché parce que 2025 était encore à zéro décrédibilise tout le reste
 * de la page.
 */

import type { EditionComparison } from './stats-edition';

export type VerdictTone = 'ahead' | 'behind' | 'idle';

export interface Verdict {
  tone: VerdictTone;
  /** Le gros titre de la carte. */
  headline: string;
  /** Ce qui l'appuie, en une phrase. */
  detail: string;
}

/** Signe moins typographique : le tiret du clavier est plus court et se lit mal en gras. */
const MINUS = '−';

export function buildVerdict(
  comparison: EditionComparison,
  formatAmount: (value: number) => string,
): Verdict {
  const { has2026Curve, deltaEur, eur2025SameElapsed } = comparison;

  // Trois façons de n'avoir rien à dire, et la même phrase pour les trois : la courbe
  // 2026 est trop courte, ou l'instant courant tombe hors de la plage couverte par 2025.
  if (!has2026Curve || deltaEur === null || eur2025SameElapsed === null) {
    return {
      tone: 'idle',
      headline: 'Comparaison à venir',
      detail:
        'Elle démarre dès que la collecte a relevé assez de points sur l’édition en cours.',
    };
  }

  // 2025 n'avait pas encore ouvert sa cagnotte à ce stade du week-end : l'écart est
  // réel — tout ce qui est levé est de l'avance — mais le comparer à zéro ne dit rien
  // du rythme. La phrase le précise plutôt que de laisser croire à une performance.
  if (eur2025SameElapsed === 0) {
    return {
      tone: 'ahead',
      headline: `${formatAmount(deltaEur)} d’avance`,
      detail: 'À ce stade du week-end, la cagnotte 2025 n’avait pas encore ouvert.',
    };
  }

  const reference = `2025 était à ${formatAmount(eur2025SameElapsed)} au même moment de l’édition.`;

  return deltaEur >= 0
    ? { tone: 'ahead', headline: `+${formatAmount(deltaEur)} d’avance`, detail: reference }
    : {
        tone: 'behind',
        headline: `${MINUS}${formatAmount(Math.abs(deltaEur))} de retard`,
        detail: reference,
      };
}
