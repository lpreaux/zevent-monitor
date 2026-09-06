/**
 * Mise en forme du planning pour l'écran : ce qui passe maintenant, ce qui suit, et le
 * programme complet découpé par journée parisienne.
 *
 * Tout ce qui relève du calendrier vit ici plutôt que dans l'écran — les chevauchements,
 * les favoris annoncés, la place du repère « maintenant » — pour que le rendu n'ait plus
 * qu'à dérouler des sections déjà décidées, et que ces règles restent vérifiables sans
 * monter de composant.
 */

import type { PlanningEntry, PlanningParticipant } from '@/api/types';
import {
  entryEnd,
  entryStart,
  entryStatus,
  formatParisDayLabel,
  formatParisDayShort,
  isLongRun,
  parisDayKey,
  type PlanningStatus,
} from './planning';

export interface PlanningEntryItem {
  kind: 'entry';
  id: string;
  entry: PlanningEntry;
  status: PlanningStatus;
  /** Nombre d'autres émissions dont le créneau recoupe le sien. */
  parallel: number;
  /** Participants suivis annoncés sur l'émission, dans l'ordre d'annonce. */
  favorites: PlanningParticipant[];
  /** Créneau si long qu'il tient du décor plutôt que du rendez-vous. */
  longRun: boolean;
}

/** Repère de l'instant présent, posé dans le fil entre deux émissions. */
export interface PlanningNowItem {
  kind: 'now';
  id: 'now';
}

export type PlanningItem = PlanningEntryItem | PlanningNowItem;

export interface PlanningDaySection {
  key: string;
  label: string;
  /** Intitulé du rail de navigation, ex. `Sam 5`. */
  short: string;
  data: PlanningItem[];
}

export interface PlanningView {
  /** Émissions en cours, la plus proche de sa fin en tête. */
  live: PlanningEntryItem[];
  /** Prochaines émissions, dans l'ordre de passage. */
  next: PlanningEntryItem[];
  /** Le fil : la journée retenue, ou le week-end entier. */
  sections: PlanningDaySection[];
  /** Toutes les journées du planning, filtre de journée compris ou non. */
  days: { key: string; label: string; short: string }[];
  /** Journée parisienne en cours, qu'elle figure ou non au planning. */
  todayKey: string;
  /** Où retrouver le repère « maintenant » dans les sections, pour y revenir. */
  nowLocation: { sectionIndex: number; itemIndex: number } | null;
  counts: {
    /** Total du planning, avant filtre. */
    total: number;
    /** Émissions retenues dans le fil. */
    shown: number;
    live: number;
    upcoming: number;
    /** Émissions du planning où un streamer suivi est annoncé. */
    withFavorites: number;
  };
}

export interface PlanningViewOptions {
  /** Logins suivis, en minuscules. */
  favorites: readonly string[];
  /** Ne garder que les émissions où un favori est annoncé. */
  favoritesOnly?: boolean;
  /**
   * Journée à laquelle borner le fil, `null` pour tout le week-end. Les émissions en
   * cours et à venir, elles, ne s'en préoccupent pas : elles répondent à « qu'est-ce qui
   * passe maintenant », question qui ne dépend d'aucun filtre.
   */
  day?: string | null;
  /** Nombre d'émissions à venir mises en tête d'écran. */
  nextLimit?: number;
}

/** Deux créneaux se recoupent dès qu'ils partagent une minute. */
function overlaps(a: PlanningEntry, b: PlanningEntry): boolean {
  const startA = entryStart(a);
  const startB = entryStart(b);
  if (Number.isNaN(startA) || Number.isNaN(startB)) return false;
  return startA < entryEnd(b) && startB < entryEnd(a);
}

/**
 * Annote chaque entrée de ce que le rendu aura besoin de savoir. Les chevauchements sont
 * comptés sur le planning entier, jamais sur la liste filtrée : « 3 en parallèle » décrit
 * le week-end, pas l'état des cases cochées.
 */
function annotate(entries: PlanningEntry[], now: number, favorites: Set<string>): PlanningEntryItem[] {
  return entries.map((entry) => ({
    kind: 'entry' as const,
    id: entry.id,
    entry,
    status: entryStatus(entry, now),
    parallel: entries.reduce(
      (count, other) => (other !== entry && overlaps(entry, other) ? count + 1 : count),
      0,
    ),
    favorites: favorites.size
      ? entry.participants.filter((p) => p.twitch && favorites.has(p.twitch.toLowerCase()))
      : [],
    longRun: isLongRun(entry),
  }));
}

/**
 * Ordre des émissions en cours : celle qui se termine le plus tôt d'abord, et les
 * créneaux au long cours relégués en fin. Ce qui va s'arrêter réclame une décision, un
 * stand ouvert jusqu'au soir non.
 */
function liveOrder(a: PlanningEntryItem, b: PlanningEntryItem): number {
  if (a.longRun !== b.longRun) return a.longRun ? 1 : -1;
  return entryEnd(a.entry) - entryEnd(b.entry);
}

/**
 * Place du repère « maintenant » : dans la journée en cours, juste avant la première
 * émission encore à venir. Les émissions déjà commencées restent au-dessus de lui.
 *
 * Il n'apparaît que si cette journée est affichée : posé dans un fil borné à dimanche
 * alors qu'on est samedi, il ne repérerait plus rien.
 */
function locateNow(
  sections: PlanningDaySection[],
  now: number,
  todayKey: string,
): { sectionIndex: number; itemIndex: number } | null {
  const sectionIndex = sections.findIndex((section) => section.key === todayKey);
  if (sectionIndex < 0) return null;
  const data = sections[sectionIndex].data;
  const itemIndex = data.findIndex((item) => item.kind === 'entry' && entryStart(item.entry) > now);
  return { sectionIndex, itemIndex: itemIndex < 0 ? data.length : itemIndex };
}

/** Vue complète du planning à un instant donné. */
export function buildPlanningView(
  entries: PlanningEntry[],
  now: number,
  { favorites, favoritesOnly = false, day = null, nextLimit = 3 }: PlanningViewOptions,
): PlanningView {
  const followed = new Set(favorites.map((login) => login.toLowerCase()));
  const sorted = [...entries].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'fr'),
  );
  const annotated = annotate(sorted, now, followed);
  const withFavorites = annotated.filter((item) => item.favorites.length > 0).length;
  const kept = favoritesOnly ? annotated.filter((item) => item.favorites.length > 0) : annotated;

  const days = new Map<string, PlanningDaySection>();
  for (const item of kept) {
    const key = parisDayKey(item.entry.startsAt);
    const existing = days.get(key);
    if (existing) existing.data.push(item);
    else
      days.set(key, {
        key,
        label: formatParisDayLabel(item.entry.startsAt),
        short: formatParisDayShort(item.entry.startsAt),
        data: [item],
      });
  }

  // Le rail de journées reste celui du week-end entier : c'est lui qui porte le filtre,
  // il ne peut pas se réduire à ce que le filtre laisse passer.
  const allDays = [...days.values()].map(({ key, label, short }) => ({ key, label, short }));
  const sections = [...days.values()].filter((section) => day === null || section.key === day);

  const todayKey = parisDayKey(new Date(now).toISOString());
  const nowLocation = locateNow(sections, now, todayKey);
  if (nowLocation) {
    sections[nowLocation.sectionIndex].data.splice(nowLocation.itemIndex, 0, {
      kind: 'now',
      id: 'now',
    });
  }

  const shown = sections.reduce(
    (total, section) => total + section.data.filter((item) => item.kind === 'entry').length,
    0,
  );

  return {
    live: kept.filter((item) => item.status === 'live').sort(liveOrder),
    next: kept.filter((item) => item.status === 'upcoming').slice(0, Math.max(nextLimit, 0)),
    sections,
    days: allDays,
    todayKey,
    nowLocation,
    counts: {
      total: annotated.length,
      shown,
      live: kept.filter((item) => item.status === 'live').length,
      upcoming: kept.filter((item) => item.status === 'upcoming').length,
      withFavorites,
    },
  };
}

/**
 * Chaîne qui ouvre l'émission sur Twitch : la chaîne diffusante annoncée par le planning,
 * à défaut celle de l'animation. Sans elle, la carte n'affiche pas de bouton — mieux vaut
 * pas de bouton qu'un bouton qui ouvre la mauvaise chaîne.
 */
export function broadcastLogin(entry: PlanningEntry): string | null {
  const broadcaster = entry.participants.find((p) => p.broadcaster && p.twitch);
  if (broadcaster?.twitch) return broadcaster.twitch;
  const host = entry.participants.find((p) => p.role === 'host' && p.twitch);
  return host?.twitch ?? null;
}
