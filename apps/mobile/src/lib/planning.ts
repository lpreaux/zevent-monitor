import type { PlanningEntry } from '@/api/types';

/**
 * Le planning est publié et vécu à l'heure de Paris : on convertit explicitement plutôt
 * que de dépendre du fuseau de l'appareil (un téléphone resté sur un autre fuseau doit
 * afficher les mêmes horaires que le direct). Calcul sans `Intl`, comme le reste du
 * formatage de l'app, avec la règle européenne : heure d'été du dernier dimanche de mars
 * 01:00 UTC au dernier dimanche d'octobre 01:00 UTC.
 */
function lastSundayUtc(year: number, month: number, hourUtc: number): number {
  const lastDay = Date.UTC(year, month + 1, 0);
  const weekday = new Date(lastDay).getUTCDay();
  const date = new Date(lastDay).getUTCDate() - weekday;
  return Date.UTC(year, month, date, hourUtc);
}

export function parisOffsetMinutes(timestamp: number): number {
  const year = new Date(timestamp).getUTCFullYear();
  const summerStart = lastSundayUtc(year, 2, 1);
  const summerEnd = lastSundayUtc(year, 9, 1);
  return timestamp >= summerStart && timestamp < summerEnd ? 120 : 60;
}

export interface ParisParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  weekday: number;
}

/** Décompose un instant ISO en composantes de date/heure locales de Paris. */
export function parisParts(iso: string): ParisParts | null {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  const shifted = new Date(timestamp + parisOffsetMinutes(timestamp) * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Heure de Paris au format `18h00`. */
export function formatParisTime(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return '—';
  return `${String(parts.hours).padStart(2, '0')}h${String(parts.minutes).padStart(2, '0')}`;
}

/** Créneau lisible : `18h00 – 21h30`, ou `18h00` sans heure de fin. */
export function formatParisRange(startsAt: string, endsAt: string | null): string {
  const start = formatParisTime(startsAt);
  if (!endsAt) return start;
  return `${start} – ${formatParisTime(endsAt)}`;
}

/** Clé de regroupement par journée parisienne, ex. `2026-09-04`. */
export function parisDayKey(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return 'inconnu';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Intitulé de journée abrégé pour le rail de navigation, ex. `Ven 4`. */
export function formatParisDayShort(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return '—';
  const weekday = WEEKDAYS[parts.weekday];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)} ${parts.day}`;
}

/** Intitulé de journée, ex. `vendredi 4 septembre`. */
export function formatParisDayLabel(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return 'Date inconnue';
  return `${WEEKDAYS[parts.weekday]} ${parts.day} ${MONTHS[parts.month - 1]}`;
}

export type PlanningStatus = 'past' | 'live' | 'upcoming';

/**
 * Durée prêtée à une entrée dont la fin n'est pas publiée : mieux vaut un badge qui
 * s'éteint tôt qu'une émission éternellement en direct.
 */
export const OPEN_ENDED_DURATION_MS = 3_600_000;

/** Début d'une entrée, ou NaN si l'horaire est illisible. */
export function entryStart(entry: PlanningEntry): number {
  return Date.parse(entry.startsAt);
}

/** Fin retenue pour tous les calculs : celle publiée, sinon une heure après le début. */
export function entryEnd(entry: PlanningEntry): number {
  const start = entryStart(entry);
  if (Number.isNaN(start)) return Number.NaN;
  const end = entry.endsAt ? Date.parse(entry.endsAt) : Number.NaN;
  return Number.isNaN(end) ? start + OPEN_ENDED_DURATION_MS : end;
}

/** Durée retenue d'une entrée, en millisecondes. */
export function entryDurationMs(entry: PlanningEntry): number {
  const start = entryStart(entry);
  const end = entryEnd(entry);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(end - start, 0);
}

/**
 * Seuil au-delà duquel une entrée cesse d'être un rendez-vous pour devenir un décor du
 * week-end — un stand ouvert toute l'après-midi. On ne lui décompte pas de temps
 * restant : ce qui importe est jusqu'à quand elle tient, pas dans combien de temps elle
 * s'arrête.
 */
export const LONG_RUN_MS = 4 * 3_600_000;

export function isLongRun(entry: PlanningEntry): boolean {
  return entryDurationMs(entry) >= LONG_RUN_MS;
}

/** Statut d'une entrée, du seul point de vue de l'horloge. */
export function entryStatus(entry: PlanningEntry, now: number): PlanningStatus {
  const start = entryStart(entry);
  if (Number.isNaN(start)) return 'upcoming';
  if (now < start) return 'upcoming';
  return now < entryEnd(entry) ? 'live' : 'past';
}

export interface EntryProgress {
  /** Avancement dans le créneau, borné à [0, 1]. */
  ratio: number;
  elapsedMs: number;
  remainingMs: number;
}

/** Avancement d'une entrée dans son créneau, pour la jauge des cartes en cours. */
export function entryProgress(entry: PlanningEntry, now: number): EntryProgress {
  const start = entryStart(entry);
  const end = entryEnd(entry);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return { ratio: 0, elapsedMs: 0, remainingMs: 0 };
  }
  const elapsedMs = Math.min(Math.max(now - start, 0), end - start);
  return { ratio: elapsedMs / (end - start), elapsedMs, remainingMs: Math.max(end - now, 0) };
}

/**
 * Entrées à mettre en avant sur l'écran secondaire : celles en cours d'abord, puis les
 * suivantes à venir. Les entrées passées sont écartées — un écran qu'on regarde de loin
 * n'a que faire de ce qui est terminé.
 */
export function currentAndUpcoming(
  entries: PlanningEntry[],
  now: number,
  limit = 4,
): PlanningEntry[] {
  const sorted = [...entries].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const live = sorted.filter((entry) => entryStatus(entry, now) === 'live');
  const upcoming = sorted.filter((entry) => entryStatus(entry, now) === 'upcoming');
  return [...live, ...upcoming].slice(0, Math.max(limit, 0));
}

/** Compte à rebours court avant le début, ex. `dans 25 min`, `dans 3 h`. */
export function formatCountdown(iso: string, now: number): string | null {
  const start = Date.parse(iso);
  if (Number.isNaN(start) || start <= now) return null;
  const minutes = Math.round((start - now) / 60_000);
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `dans ${hours} h`;
  return `dans ${Math.round(hours / 24)} j`;
}

/**
 * Durée lisible d'un seul tenant : `45 min`, `1 h 05`, `9 h`. Les minutes ne sont
 * données qu'en dessous de la demi-journée — au-delà, elles n'apprennent plus rien.
 */
export function formatDuration(ms: number): string {
  const minutes = Math.max(Math.round(ms / 60_000), 0);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, '0')}`;
}

/**
 * Temps restant sur une entrée en cours. Les dernières minutes se disent autrement :
 * « il reste 1 min » invite à croire qu'on a le temps.
 */
export function formatRemaining(entry: PlanningEntry, now: number): string | null {
  const { remainingMs } = entryProgress(entry, now);
  if (remainingMs <= 0) return null;
  if (remainingMs < 120_000) return 'se termine';
  return `il reste ${formatDuration(remainingMs)}`;
}

/** Seuil sous lequel un compte à rebours passe aux secondes : l'émission est imminente. */
export const PRECISE_COUNTDOWN_MS = 5 * 60_000;

/**
 * Compte à rebours de tête d'écran. Il passe en `m:ss` dans les dernières minutes :
 * c'est le moment où l'on regarde l'écran en attendant, et où une valeur figée sur
 * « dans 4 min » donne l'impression que l'application a décroché.
 */
export function formatCountdownPrecise(iso: string, now: number): string | null {
  const start = Date.parse(iso);
  if (Number.isNaN(start) || start <= now) return null;
  const remaining = start - now;
  if (remaining >= PRECISE_COUNTDOWN_MS) return formatCountdown(iso, now);
  const seconds = Math.ceil(remaining / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
