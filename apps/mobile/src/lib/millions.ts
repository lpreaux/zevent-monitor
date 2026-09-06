/**
 * Chronologie des paliers de la cagnotte : à quel moment de l'édition chaque million est
 * tombé, et avec quelle avance sur 2025 au même palier.
 *
 * C'est la lecture par le temps, celle qui manque à une page qui ne compare que des
 * montants. « +1,2 M€ sur 2025 » ne dit pas si l'édition court plus vite ou si elle a
 * simplement démarré plus tôt ; « le 8e million est tombé 3 h avant » le dit.
 *
 * Rien ici n'appelle le réseau : les deux courbes arrivent déjà alignées sur le même axe
 * par `buildEditionComparison`, il ne reste qu'à les lire — et à défaire son recalage,
 * qui répond à une autre question que celle-ci (voir `buildMillionsTimeline`).
 */

import { formatEurosCompact, formatRank } from './format';
import { milestoneEtaMinutes, milestoneStep, nextMilestone } from './milestones';
import { OFFSET_2025_MINUTES, type EditionComparison } from './stats-edition';
import { COLLECTION_START_THRESHOLD_EUR, type ElapsedPoint } from './timeseries';

export const MILLION_EUR = 1_000_000;

/**
 * Instant du premier franchissement de `targetEur`, en minutes sur l'axe de la série.
 *
 * L'interpolation n'est pas un raffinement : la collecte relève un point toutes les dix
 * minutes, si bien qu'un palier franchi une minute après un relevé serait daté du relevé
 * suivant — dix minutes de retard sur chaque ligne, et des écarts entre éditions faux
 * d'autant. On situe donc le franchissement entre les deux points qui l'encadrent, au
 * prorata du montant, ce qui suppose la collecte régulière sur l'intervalle : c'est faux
 * à la seconde près, mais infiniment plus juste que de coller au relevé.
 *
 * `null` quand la série ne l'atteint jamais — un palier à venir, ou une édition qui s'est
 * arrêtée en dessous.
 */
export function crossingMinutes(points: ElapsedPoint[], targetEur: number): number | null {
  if (points.length === 0 || !Number.isFinite(targetEur)) return null;

  // Déjà franchi au premier relevé : on ne sait rien de ce qui précède le début de la
  // série, la dater plus tôt reviendrait à extrapoler dans le vide.
  if (points[0].eur >= targetEur) return points[0].minutes;

  for (let i = 1; i < points.length; i += 1) {
    const after = points[i];
    if (after.eur < targetEur) continue;
    const before = points[i - 1];
    // `before` est nécessairement sous le palier — la boucle n'a avancé que sur des points
    // qui l'étaient, et le premier relevé a été traité au-dessus : la montée est stricte.
    const ratio = (targetEur - before.eur) / (after.eur - before.eur);
    return before.minutes + (after.minutes - before.minutes) * ratio;
  }

  return null;
}

export interface MilestoneCrossing {
  /** Rang du palier dans la chronologie, 1 pour le premier. */
  rank: number;
  /** Palier franchi, en euros. */
  targetEur: number;
  /** Minutes écoulées entre l'ouverture de la cagnotte 2026 et ce franchissement. */
  minutes2026: number;
  /** Idem pour 2025, depuis sa propre ouverture. `null` si l'édition n'y est jamais allée. */
  minutes2025: number | null;
  /** Minutes gagnées sur 2025 : positif = plus tôt, négatif = plus tard. */
  gapMinutes: number | null;
}

export interface PendingMilestone {
  rank: number;
  targetEur: number;
  remainingEur: number;
  /** Minutes avant le franchissement au rythme observé, `null` si le rythme ne dit rien. */
  etaMinutes: number | null;
}

export interface MillionsTimeline {
  /** Pas de palier retenu pour cette chronologie, en euros. */
  stepEur: number;
  /** Franchissements datés, du plus ancien au plus récent. */
  crossings: MilestoneCrossing[];
  /** Le palier qui se joue, `null` tant que la collecte n'a pas démarré. */
  pending: PendingMilestone | null;
}

/** Le palier en toutes lettres : `3e million` quand le pas est le million, `700 k€` avant. */
export function milestoneLabel(rank: number, stepEur: number): string {
  return stepEur === MILLION_EUR
    ? `${formatRank(rank)} million`
    : formatEurosCompact(rank * stepEur);
}

/** Un écart de temps tel qu'on le dit : `55 min`, `1 h 12`, `2 h`. */
export function formatGapMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(Math.abs(minutes)));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

/** Chronologie complète des paliers, prête à s'afficher ligne à ligne. */
export function buildMillionsTimeline(comparison: EditionComparison): MillionsTimeline {
  const current = comparison.current2026Eur;

  // Le pas suit l'ordre de grandeur de la cagnotte, via `milestoneStep` : le million une
  // fois le premier million tombé, la centaine de milliers avant lui.
  //
  // Un pas fixe d'un million laisserait la section vide pendant les premières heures du
  // jeudi soir — précisément le moment où l'on ouvre l'application le plus souvent, et où
  // « est-ce que ça part plus vite qu'en 2025 ? » se demande le plus fort. Un pas dix fois
  // plus fin y fait tomber une ligne tous les quarts d'heure ; le passage au million
  // resserre ensuite la liste sur ce qui fait l'événement, et la remet d'aplomb avec son
  // titre. Cette fonction est aussi celle qui décide du prochain palier affiché ailleurs
  // dans l'app (écran veille, résumé du direct) : deux paliers différents annoncés au même
  // moment pour la même cagnotte, et l'on cesse de croire les deux.
  const stepEur = milestoneStep(Number.isFinite(current) ? current : 0);

  // Sous le seuil de démarrage de collecte, la cagnotte n'est encore que quelques dons
  // isolés : dater un palier là-dessus raconterait n'importe quoi, et la courbe n'a de
  // toute façon pas assez de points pour l'encadrer.
  if (!Number.isFinite(current) || current < COLLECTION_START_THRESHOLD_EUR) {
    return { stepEur, crossings: [], pending: null };
  }

  const crossings: MilestoneCrossing[] = [];
  for (let rank = 1; rank <= Math.floor(current / stepEur); rank += 1) {
    const targetEur = rank * stepEur;
    const minutes2026 = crossingMinutes(comparison.points2026, targetEur);
    // Palier franchi selon la cagnotte officielle, mais que la courbe agrégée ne montre
    // pas encore : il sera daté au prochain relevé, il reste « à venir » d'ici là.
    if (minutes2026 === null) continue;
    // La courbe 2025 arrive décalée de `OFFSET_2025_MINUTES` : le reste de l'écran la lit
    // ainsi pour répondre à « où en était 2025 au même moment du week-end ? ». Ici la
    // question est autre — « laquelle des deux éditions y est arrivée le plus vite ? » —
    // et sur l'axe décalé, chaque écart vaudrait l'offset à quelques minutes près, puisque
    // la cagnotte 2026 a simplement ouvert vingt-deux heures plus tôt. On retire donc le
    // décalage pour compter, des deux côtés, depuis l'ouverture de chaque cagnotte.
    const shifted2025 = crossingMinutes(comparison.points2025, targetEur);
    const minutes2025 = shifted2025 === null ? null : shifted2025 - OFFSET_2025_MINUTES;
    crossings.push({
      rank,
      targetEur,
      minutes2026,
      minutes2025,
      gapMinutes: minutes2025 === null ? null : minutes2025 - minutes2026,
    });
  }

  const next = nextMilestone(current);
  if (!next) return { stepEur, crossings, pending: null };

  // La cagnotte officielle devance la courbe agrégée de dix minutes au plus. Quand elle a
  // déjà passé un palier que la courbe ne date pas encore, `nextMilestone` désigne le
  // suivant : on revient sur celui qui manque — annoncé imminent, puisqu'il est en fait
  // tombé — plutôt que de le sauter et de laisser un trou dans la chronologie.
  const rank = Math.min(Math.round(next.target / stepEur), (crossings.at(-1)?.rank ?? 0) + 1);
  const targetEur = rank * stepEur;

  return {
    stepEur,
    crossings,
    pending: {
      rank,
      targetEur,
      remainingEur: Math.max(0, targetEur - current),
      etaMinutes: milestoneEtaMinutes(targetEur - current, comparison.eurPerHour),
    },
  };
}
