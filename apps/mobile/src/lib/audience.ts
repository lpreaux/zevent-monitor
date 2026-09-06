/**
 * Audience du week-end : la courbe des viewers, son pic, et le rapport entre ce que
 * l'événement fait regarder et ce qu'il fait donner.
 *
 * Deux grandeurs de nature opposée se croisent ici, et c'est tout l'enjeu du module : la
 * cagnotte est un stock qui ne redescend jamais, l'audience un instantané qui monte le
 * soir et s'effondre chaque nuit. Les rapprocher sans le dire produirait des chiffres qui
 * ressemblent à des statistiques sans en être — d'où les conversions explicites, les
 * `null` rendus dès qu'un dénominateur manque, et les commentaires qui nomment ce que
 * chaque nombre mesure vraiment.
 *
 * Sans React ni React Native, pour rester testable sans monter de composant.
 */

import type { RatePoint } from '@/api/donations';
import { formatParisTime } from './planning';
import type { ElapsedPoint } from './timeseries';

export interface AudienceSample {
  /** Horodatage (ms epoch) du relevé. */
  t: number;
  /** Viewers additionnés sur toutes les chaînes du plateau à cet instant. */
  viewers: number;
}

export interface AudiencePeak {
  viewers: number;
  /** Horodatage (ms epoch) du relevé le plus haut. */
  at: number;
}

export interface AudienceCurve {
  /**
   * Points prêts pour `OverlayChart`. Son type `ElapsedPoint` nomme son ordonnée `eur`
   * parce qu'il a été écrit pour des cagnottes ; le composant n'y lit que l'unité de son
   * axe Y et ne suppose rien de sa nature. Ici, `eur` porte des viewers.
   */
  points: ElapsedPoint[];
  /** Étendue de l'axe X, en minutes écoulées depuis T+0. */
  spanMinutes: number;
  /** Pic relevé sur la portion tracée, `null` tant qu'aucun relevé n'est positif. */
  peak: AudiencePeak | null;
}

/**
 * Courbe d'audience calée sur le T+0 de la collecte.
 *
 * Elle repart de la même origine que la cagnotte — celle de `EditionComparison` — pour que
 * les deux tracés de l'écran parlent du même axe : « le pic d'audience tombe ici » n'a de
 * sens que si « ici » désigne le même instant sur les deux courbes. Les relevés antérieurs
 * à T+0 sont écartés plutôt que dessinés en minutes négatives : `OverlayChart` ramène ses
 * abscisses dans le cadre, ils s'empileraient tous sur le bord gauche en une falaise que
 * l'événement n'a jamais connue.
 */
export function buildAudienceCurve(
  samples: readonly AudienceSample[],
  originAt: number | null,
): AudienceCurve {
  if (originAt === null) return { points: [], spanMinutes: 0, peak: null };

  const kept = samples
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.viewers) && s.t >= originAt)
    .sort((a, b) => a.t - b.t);

  const points: ElapsedPoint[] = [];
  let peak: AudiencePeak | null = null;

  for (const sample of kept) {
    // Comparaison stricte : sur un plateau, le premier relevé l'emporte. C'est l'instant
    // où l'audience est arrivée en haut qui raconte quelque chose, pas celui où elle a
    // fini par en redescendre.
    if (sample.viewers > 0 && (peak === null || sample.viewers > peak.viewers)) {
      peak = { viewers: sample.viewers, at: sample.t };
    }
    points.push({ minutes: (sample.t - originAt) / 60_000, eur: sample.viewers });
  }

  return {
    points,
    spanMinutes: points.length ? points[points.length - 1].minutes : 0,
    peak,
  };
}

/** Espacement des graduations de l'axe des temps, en heures. */
const TICK_STEP_HOURS = 12;

/**
 * Graduations en heure de Paris. Une cagnotte se lit en « T+12 h » — ce qui compte est le
 * temps écoulé depuis l'ouverture ; une audience, non : ce qui explique la forme de la
 * courbe, ce sont les soirées et les nuits. Le pas de douze heures fait apparaître leur
 * alternance sans que les libellés se marchent dessus sur un écran de téléphone.
 */
export function audienceTicks(
  originAt: number | null,
  spanMinutes: number,
  stepHours = TICK_STEP_HOURS,
): { minutes: number; label: string }[] {
  if (originAt === null || spanMinutes <= 0 || stepHours <= 0) return [];

  const ticks: { minutes: number; label: string }[] = [];
  // Le dernier huitième de l'axe reste nu : un libellé posé au bord droit déborderait.
  for (let minutes = 0; minutes <= spanMinutes; minutes += stepHours * 60) {
    ticks.push({
      minutes,
      label: formatParisTime(new Date(originAt + minutes * 60_000).toISOString()),
    });
  }
  return ticks;
}

export interface AudienceHour {
  /** Début de la tranche, ISO tel que rendu par le backend. */
  bucket: string;
  raisedEur: number;
  /** Pic d'audience relevé pendant la tranche : le backend n'en garde pas la moyenne. */
  peakViewers: number;
}

function toHour(point: RatePoint): AudienceHour {
  return {
    bucket: point.bucket,
    raisedEur: point.raisedCents / 100,
    peakViewers: point.peakViewers,
  };
}

/**
 * Tranches déjà closes, dans l'ordre chronologique.
 *
 * L'heure en cours n'a fini ni de compter ses dons ni de voir son audience monter : la
 * comparer aux précédentes la ferait passer pour la plus creuse du week-end, à chaque heure
 * et indéfiniment. Le tri ne dépend pas de l'ordre du backend — l'appelant qui prend « la
 * dernière » doit pouvoir le faire sans se demander comment la réponse était rangée.
 */
export function completeHours(
  points: readonly RatePoint[],
  bucketMinutes: number,
  now = Date.now(),
): RatePoint[] {
  if (!Number.isFinite(bucketMinutes) || bucketMinutes <= 0) return [];
  return points
    .filter((point) => {
      const start = Date.parse(point.bucket);
      return Number.isFinite(start) && start + bucketMinutes * 60_000 <= now;
    })
    .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
}

/** Tranches les plus regardées, la plus haute d'abord. */
export function mostWatchedHours(points: readonly RatePoint[], limit = 5): AudienceHour[] {
  return points
    .filter((point) => point.peakViewers > 0)
    .map(toHour)
    .sort((a, b) => b.peakViewers - a.peakViewers)
    .slice(0, limit);
}

export interface AudienceContrast {
  mostWatched: AudienceHour;
  mostGenerous: AudienceHour;
  /** Les deux désignent la même tranche. */
  sameHour: boolean;
}

/**
 * Le croisement qui fait l'histoire du week-end : l'heure la plus regardée n'est pas
 * forcément celle qui collecte le plus. Une soirée d'événements rassemble l'audience ;
 * un palier franchi à trois heures du matin, devant dix fois moins de monde, peut lever
 * davantage. C'est ce décalage qu'on veut pouvoir énoncer — ou démentir, les week-ends où
 * les deux pics tombent bien sur la même heure.
 */
export function audienceContrast(points: readonly RatePoint[]): AudienceContrast | null {
  let watched: RatePoint | null = null;
  let generous: RatePoint | null = null;

  for (const point of points) {
    if (point.peakViewers > 0 && (watched === null || point.peakViewers > watched.peakViewers)) {
      watched = point;
    }
    if (point.raisedCents > 0 && (generous === null || point.raisedCents > generous.raisedCents)) {
      generous = point;
    }
  }

  // Sans audience relevée ou sans un euro levé, il n'y a pas deux pics à confronter.
  if (watched === null || generous === null) return null;

  return {
    mostWatched: toHour(watched),
    mostGenerous: toHour(generous),
    sameHour: watched.bucket === generous.bucket,
  };
}

/** Unité du dénominateur : mille spectateurs connectés pendant une heure. */
const VIEWERS_UNIT = 1_000;

export interface AudienceGenerosity {
  /** Euros levés pour mille spectateurs connectés pendant une heure. */
  eurPerThousandViewerHours: number;
  /** Euros levés sur les tranches retenues. */
  raisedEur: number;
  /** Milliers de viewers-heure cumulés sur ces mêmes tranches. */
  thousandViewerHours: number;
  /** Nombre de tranches prises en compte. */
  hours: number;
}

/**
 * Rapport entre ce qui est donné et ce qui est regardé.
 *
 * Le dénominateur est une exposition, pas une population : le compteur officiel additionne
 * les viewers de toutes les chaînes à un instant donné, une même personne y compte une fois
 * par onglet ouvert et disparaît dès qu'elle le ferme. Diviser la cagnotte totale par ce
 * nombre donnerait des « euros par spectateur » qui n'existent pas — un stock accumulé
 * depuis jeudi rapporté à un instantané de dimanche soir, et un chiffre qui grimperait
 * toute la nuit précisément parce que plus personne ne regarde.
 *
 * On met donc en rapport deux flux mesurés sur la même tranche : les euros levés pendant
 * l'heure, et l'audience connectée pendant cette même heure, comptée en viewers-heure.
 * Ramenée à mille viewers, faute de quoi le ratio se lirait en centimes.
 *
 * Le backend ne retient que le pic d'audience de chaque tranche, jamais sa moyenne : le
 * dénominateur est donc majoré et le résultat est un plancher. C'est le bon sens de
 * l'erreur pour un chiffre affiché — il ne flatte pas la générosité du public. Les tranches
 * sans audience relevée sont écartées en entier, numérateur compris : leurs euros
 * gonfleraient un rapport dont elles ne paient pas le dénominateur.
 */
export function audienceGenerosity(
  points: readonly RatePoint[],
  bucketMinutes: number,
): AudienceGenerosity | null {
  if (!Number.isFinite(bucketMinutes) || bucketMinutes <= 0) return null;

  const hoursPerBucket = bucketMinutes / 60;
  let raisedEur = 0;
  let thousandViewerHours = 0;
  let hours = 0;

  for (const point of points) {
    if (!Number.isFinite(point.peakViewers) || point.peakViewers <= 0) continue;
    raisedEur += point.raisedCents / 100;
    thousandViewerHours += (point.peakViewers / VIEWERS_UNIT) * hoursPerBucket;
    hours += 1;
  }

  // Audience nulle ou pas encore relevée : le ratio n'existe pas. Le rendre quand même
  // afficherait « Infinity € » à l'écran, ou un montant sans dénominateur.
  if (thousandViewerHours <= 0) return null;

  return {
    eurPerThousandViewerHours: raisedEur / thousandViewerHours,
    raisedEur,
    thousandViewerHours,
    hours,
  };
}
