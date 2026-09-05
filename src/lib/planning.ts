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

/** Intitulé de journée, ex. `vendredi 4 septembre`. */
export function formatParisDayLabel(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return 'Date inconnue';
  return `${WEEKDAYS[parts.weekday]} ${parts.day} ${MONTHS[parts.month - 1]}`;
}

export type PlanningStatus = 'past' | 'live' | 'upcoming';

/**
 * Statut d'une entrée. Sans heure de fin, on considère l'entrée « en cours » pendant
 * une heure : mieux vaut un badge qui s'éteint tôt qu'une émission éternellement en direct.
 */
export function entryStatus(entry: PlanningEntry, now: number): PlanningStatus {
  const start = Date.parse(entry.startsAt);
  if (Number.isNaN(start)) return 'upcoming';
  const end = entry.endsAt ? Date.parse(entry.endsAt) : Number.NaN;
  const effectiveEnd = Number.isNaN(end) ? start + 3_600_000 : end;
  if (now < start) return 'upcoming';
  if (now < effectiveEnd) return 'live';
  return 'past';
}

export interface PlanningDay {
  key: string;
  label: string;
  entries: PlanningEntry[];
}

/** Regroupe les entrées par journée parisienne, chronologiquement. */
export function groupPlanningByDay(entries: PlanningEntry[]): PlanningDay[] {
  const days = new Map<string, PlanningDay>();
  const sorted = [...entries].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'fr'),
  );
  for (const entry of sorted) {
    const key = parisDayKey(entry.startsAt);
    const day = days.get(key);
    if (day) day.entries.push(entry);
    else days.set(key, { key, label: formatParisDayLabel(entry.startsAt), entries: [entry] });
  }
  return [...days.values()];
}

/**
 * Index de l'entrée sur laquelle ouvrir l'écran : la première en cours, sinon la
 * prochaine à venir, sinon la dernière passée.
 */
export function focusIndex(entries: PlanningEntry[], now: number): number {
  const live = entries.findIndex((entry) => entryStatus(entry, now) === 'live');
  if (live >= 0) return live;
  const next = entries.findIndex((entry) => entryStatus(entry, now) === 'upcoming');
  if (next >= 0) return next;
  return Math.max(entries.length - 1, 0);
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
