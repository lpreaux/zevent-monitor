import { zonedDateParts, zonedDateTimeToUtc } from './schedule.js';

/**
 * Découpage de l'événement en journées, la ressource de récap que tout le monde partage.
 *
 * Une journée ZEvent ne coïncide pas avec une journée civile : la nuit est un moment fort,
 * et la couper à minuit séparerait la soirée de sa propre nuit. La frontière est donc posée
 * à 9 h, au creux du week-end — chaque journée porte sa soirée et la nuit qui la suit.
 *
 * Le découpage est fixé sur Europe/Paris pour tout le monde, indépendamment du fuseau de
 * l'appareil : c'est ce qui permet à « Samedi » de désigner la même chose pour tous, à deux
 * lecteurs de comparer le même récap, et au contenu d'être calculé une seule fois puis
 * partagé via `recap_contents`.
 */

export const EVENT_TIME_ZONE = 'Europe/Paris';

/** Heure de bascule d'une journée à la suivante, heure de Paris. */
export const DAY_BOUNDARY = '09:00';

/**
 * En deçà, la tranche d'ouverture est reversée dans la journée suivante.
 *
 * L'événement ouvre en soirée : la première tranche court de l'ouverture au 9 h suivant et
 * pèse une quinzaine d'heures, elle mérite son chapitre. Mais rien ne garantit cette heure
 * d'ouverture — une collecte démarrée au matin produirait un « chapitre » de deux heures,
 * qui n'a rien à raconter et occuperait pourtant autant de place que le samedi.
 */
const MIN_OPENING_MINUTES = 6 * 60;

/** Une tranche plus courte n'a pas encore de contenu : la journée n'est pas commencée. */
const MIN_SLICE_MINUTES = 15;

/**
 * Au-delà de ce silence, la collecte est tenue pour arrêtée et la dernière journée pour
 * close : une fois l'édition terminée, plus rien ne viendra la compléter, et la présenter
 * comme « en cours » ferait attendre une suite qui n'arrive jamais.
 */
const COLLECTION_ALIVE_MINUTES = 30;

export type RecapDay = {
  /** Identifiant stable et lisible, dérivé de la date de début à Paris. */
  key: string;
  /** « Ouverture », « Samedi »… : ce qu'on annonce en tête de carte. */
  title: string;
  /** Les bornes en clair, telles qu'on les lirait à voix haute. */
  subtitle: string;
  periodStart: Date;
  periodEnd: Date;
  /** La journée court encore : son contenu changera au prochain relevé. */
  inProgress: boolean;
};

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: EVENT_TIME_ZONE, weekday: 'long',
});
const boundLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: EVENT_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const minutesBetween = (start: Date, end: Date): number =>
  (end.getTime() - start.getTime()) / 60_000;

/** Frontière de journée du jour civil de `reference`, décalée de `dayOffset` jours. */
function boundaryNear(reference: Date, dayOffset: number): Date {
  const local = zonedDateParts(reference, EVENT_TIME_ZONE);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  return zonedDateTimeToUtc(
    { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() },
    DAY_BOUNDARY,
    EVENT_TIME_ZONE,
  );
}

/** Première frontière strictement postérieure à `after`. */
function nextBoundary(after: Date): Date {
  const today = boundaryNear(after, 0);
  return today > after ? today : boundaryNear(after, 1);
}

function describe(periodStart: Date, periodEnd: Date, opening: boolean): Pick<RecapDay, 'key' | 'title' | 'subtitle'> {
  const weekday = weekdayFormat.format(periodStart);
  return {
    key: `day-${dayKeyFormat.format(periodStart)}`,
    title: opening ? 'Ouverture' : weekday.charAt(0).toUpperCase() + weekday.slice(1),
    subtitle: `${boundLabel.format(periodStart)} → ${boundLabel.format(periodEnd)}`,
  };
}

/**
 * Journées couvertes par la collecte, de la plus ancienne à la plus récente.
 *
 * Les bornes viennent des données réelles plutôt que du calendrier annoncé : la première
 * journée démarre au premier relevé, la dernière s'arrête au dernier. Une édition qui
 * ouvre en retard ou une collecte interrompue produisent ainsi le découpage de ce qui
 * existe, pas celui de ce qui était prévu.
 */
export function buildRecapDays(
  firstSampleAt: Date | null,
  lastSampleAt: Date | null,
  now: Date = new Date(),
): RecapDay[] {
  if (!firstSampleAt || !lastSampleAt) return [];
  const end = lastSampleAt < now ? lastSampleAt : now;
  if (minutesBetween(firstSampleAt, end) < MIN_SLICE_MINUTES) return [];

  const boundaries: Date[] = [];
  for (let boundary = nextBoundary(firstSampleAt); boundary < end; boundary = boundaryNear(boundary, 1)) {
    boundaries.push(boundary);
  }

  const starts = [firstSampleAt, ...boundaries];
  // Une ouverture trop courte n'a pas de quoi remplir un chapitre : elle rejoint la
  // suivante, et prend alors son nom — c'est bien de cette journée-là qu'elle parle.
  const merged = starts.length > 1 && minutesBetween(starts[0]!, starts[1]!) < MIN_OPENING_MINUTES;
  if (merged) starts.splice(1, 1);

  const collecting = minutesBetween(lastSampleAt, now) < COLLECTION_ALIVE_MINUTES;

  return starts
    .map((periodStart, index) => {
      const next = starts[index + 1];
      const periodEnd = next ?? end;
      const opening =
        index === 0 &&
        !merged &&
        periodStart.getTime() !== boundaryNear(periodStart, 0).getTime();
      return {
        ...describe(periodStart, periodEnd, opening),
        periodStart,
        periodEnd,
        inProgress: next === undefined && collecting,
      };
    })
    .filter((day) => minutesBetween(day.periodStart, day.periodEnd) >= MIN_SLICE_MINUTES);
}
