import type { Recap, RecapContent, RecapDaySummary } from '@/api/recaps';
import { allProgressions } from '@/lib/recap-personalization';

/**
 * Mise en forme des récaps : comment on les nomme, comment on les range, et comment les
 * faits d'une période se remettent bout à bout pour se lire comme un récit.
 *
 * Tout ce qui est ici est calculé à l'affichage, à partir d'un contenu identique pour tout
 * le monde : c'est le seul endroit où un récap devient celui de quelqu'un.
 */

const NBSP = ' ';

const weekdayTime = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** « 45 min », « 4 h 30 », « 3 jours » : lu plus vite qu'une date de début calculée. */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}${NBSP}min`;
  if (rounded % (24 * 60) === 0 && rounded >= 48 * 60) return `${rounded / (24 * 60)} jours`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}${NBSP}h` : `${hours}${NBSP}h${NBSP}${String(rest).padStart(2, '0')}`;
}

export function recapDurationMinutes(recap: Pick<Recap, 'periodStart' | 'periodEnd'>): number {
  return (Date.parse(recap.periodEnd) - Date.parse(recap.periodStart)) / 60_000;
}

/**
 * Bornes d'une période en une ligne.
 *
 * Le jour n'est rappelé sur la fin que s'il a changé : « sam. 09:00 → 17:00 » se lit d'un
 * trait, là où répéter « sam. » deux fois oblige à comparer deux dates pour constater
 * qu'elles sont identiques.
 */
export function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  return `${weekdayTime.format(start)} → ${sameDay ? clock.format(end) : weekdayTime.format(end)}`;
}

/** Titre d'un récap : le nom du chapitre pour une journée, sa durée sinon. */
export function recapTitle(recap: Recap): string {
  if (recap.title) return recap.title;
  const minutes = recapDurationMinutes(recap);
  return recap.kind === 'scheduled'
    ? `Récap de ${clock.format(new Date(recap.periodEnd))}`
    : `Les ${formatDuration(minutes)} avant ${clock.format(new Date(recap.periodEnd))}`;
}

/** Ce qui distingue une carte d'une autre dans la liste : la période, en clair. */
export function recapSubtitle(recap: Recap): string {
  return recap.subtitle ?? formatPeriod(recap.periodStart, recap.periodEnd);
}

export type RecapFilter = 'all' | 'day' | 'scheduled' | 'manual';

export const RECAP_FILTERS: readonly { key: RecapFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'day', label: 'Journées' },
  { key: 'scheduled', label: 'Programmés' },
  { key: 'manual', label: 'Manuels' },
];

export function filterRecaps(recaps: readonly Recap[], filter: RecapFilter): Recap[] {
  return filter === 'all' ? [...recaps] : recaps.filter((recap) => recap.kind === filter);
}

/** Une journée telle que la liste la manipule, avant d'aller chercher son contenu complet. */
export function dayToRecapCard(day: RecapDaySummary): Recap {
  return {
    id: day.id,
    kind: 'day',
    title: day.title,
    subtitle: day.subtitle,
    periodStart: day.periodStart,
    periodEnd: day.periodEnd,
    inProgress: day.inProgress,
    previous: day.previous ?? null,
    generatedAt: day.periodEnd,
    content: {
      summary: {
        startCents: null,
        endCents: day.preview.endCents,
        raisedCents: day.preview.raisedCents,
        peakViewers: day.preview.peakViewers,
        shareOfTotal: day.preview.shareOfTotal,
      },
      counts: day.preview.counts,
      milestones: [], bigDonations: [], liveStarts: [], goalsReached: [],
      // Les têtes de classement voyagent avec l'aperçu : c'est ce qui permet à la carte
      // d'une journée de dire ce qu'elle contient sur les streamers suivis, sans avoir
      // à charger le contenu complet.
      topProgressions: (day.preview.progressions ?? []).slice(0, 5),
      progressions: day.preview.progressions ?? [],
      highlights: [],
    },
  };
}

export type RecapEventKind = 'milestone' | 'bigDonation' | 'goal' | 'liveStart';

export interface RecapTimelineItem {
  key: string;
  at: string;
  kind: RecapEventKind;
  /** Ce qui s'est passé, en une ligne. */
  title: string;
  detail?: string;
  amountCents?: number;
  twitch?: string;
  /** Concerne un streamer suivi : la ligne est mise en avant. */
  favorite: boolean;
}

/** Ce que la timeline peut montrer sans devenir une liste à faire défiler indéfiniment. */
const TIMELINE_LIMIT = 40;

/**
 * Poids d'un fait, quand il y en a plus que la timeline n'en montre.
 *
 * Ce qui touche un favori passe devant le reste : c'est la seule chose que le lecteur ne
 * retrouvera nulle part ailleurs dans l'écran. Viennent ensuite les paliers globaux, rares
 * et datés, puis les goals, puis les gros dons — départagés par leur montant, un don à
 * 5 000 € méritant sa place plus qu'un don au seuil.
 */
function weight(item: RecapTimelineItem): number {
  const base = item.favorite ? 100 : 0;
  if (item.kind === 'milestone') return base + 50;
  if (item.kind === 'goal') return base + 30;
  if (item.kind === 'bigDonation') return base + 10 + Math.min(19, (item.amountCents ?? 0) / 100_000);
  return base + 5;
}

const byDate = (a: RecapTimelineItem, b: RecapTimelineItem): number =>
  Date.parse(a.at) - Date.parse(b.at);

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

/**
 * Faits marquants de la période remis dans l'ordre où ils se sont produits.
 *
 * Quatre listes séparées — paliers, gros dons, goals, lives — disent ce qui est arrivé mais
 * jamais dans quel ordre, alors que c'est l'enchaînement qui fait le récit d'une nuit de
 * ZEvent. Les démarrages de live n'y entrent que pour les favoris : trois cents streamers
 * qui se lancent le samedi matin noieraient tout le reste, et la liste compacte des
 * nouveaux lives dit déjà ce qu'il y a à en dire.
 */
export function buildRecapTimeline(
  content: RecapContent,
  favorites: readonly string[],
  limit = TIMELINE_LIMIT,
): { items: RecapTimelineItem[]; hidden: number } {
  const logins = new Set(favorites.map((twitch) => twitch.toLowerCase()));
  const isFavorite = (twitch: string | null | undefined): boolean =>
    Boolean(twitch) && logins.has(String(twitch).toLowerCase());

  const items: RecapTimelineItem[] = [
    ...content.milestones.map((item, index) => ({
      key: `milestone-${index}-${item.occurredAt}`,
      at: item.occurredAt,
      kind: 'milestone' as const,
      title: `Cap des ${euros.format(item.thresholdCents / 100)} franchi`,
      favorite: false,
    })),
    ...content.bigDonations.map((item, index) => ({
      key: `donation-${index}-${item.occurredAt}`,
      at: item.occurredAt,
      kind: 'bigDonation' as const,
      title: item.donor,
      amountCents: item.amountCents,
      favorite: isFavorite(item.twitch),
      ...(item.twitch ? { detail: `pour ${item.twitch}`, twitch: item.twitch } : {}),
    })),
    ...content.goalsReached.map((item, index) => ({
      key: `goal-${index}-${item.occurredAt}`,
      at: item.occurredAt,
      kind: 'goal' as const,
      title: item.display,
      detail: normalizeGoalLabel(item.label),
      twitch: item.twitch,
      favorite: isFavorite(item.twitch),
    })),
    ...content.liveStarts
      .filter((item) => isFavorite(item.twitch))
      .map((item, index) => ({
        key: `live-${index}-${item.occurredAt}`,
        at: item.occurredAt,
        kind: 'liveStart' as const,
        title: item.display,
        detail: 'passe en live',
        twitch: item.twitch,
        favorite: true,
      })),
  ].sort(byDate);

  if (items.length <= limit) return { items, hidden: 0 };
  const kept = [...items].sort((a, b) => weight(b) - weight(a)).slice(0, limit);
  return { items: kept.sort(byDate), hidden: items.length - limit };
}

/** Tout ce que la période contient sur un streamer suivi, rassemblé sous son nom. */
export interface FavoriteDigest {
  twitch: string;
  display: string;
  raisedCents: number;
  goals: { label: string; occurredAt: string }[];
  /** Premier passage en direct pendant la période, s'il y en a eu un. */
  liveStartedAt: string | null;
  bigDonations: { donor: string; amountCents: number; occurredAt: string }[];
}

/**
 * Ce que la période dit de chaque favori, une entrée par personne.
 *
 * Le contenu d'un récap est rangé par nature d'événement — les progressions ensemble, les
 * paliers ensemble, les directs ensemble. Affiché tel quel, un favori qui a progressé,
 * franchi deux paliers et lancé son direct apparaissait quatre fois dans la même liste, à
 * quatre endroits, sans que rien ne dise qu'il s'agissait de la même personne. On lit
 * cette section par personne : elle est donc construite par personne.
 */
export function groupFavoriteActivity(
  content: RecapContent,
  favorites: readonly string[],
): FavoriteDigest[] {
  const logins = new Set(favorites.map((twitch) => twitch.toLowerCase()));
  if (logins.size === 0) return [];

  const digests = new Map<string, FavoriteDigest>();
  const entry = (twitch: string, display: string): FavoriteDigest | null => {
    const login = twitch.toLowerCase();
    if (!logins.has(login)) return null;
    let digest = digests.get(login);
    if (!digest) {
      digest = { twitch: login, display, raisedCents: 0, goals: [], liveStartedAt: null, bigDonations: [] };
      digests.set(login, digest);
    }
    // Le premier nom rencontré fait foi, sauf s'il était vide : les événements archivés
    // n'ont pas toujours retenu le nom d'affichage, la progression si.
    if (!digest.display) digest.display = display;
    return digest;
  };

  for (const item of allProgressions(content)) {
    const digest = entry(item.twitch, item.display);
    if (digest) digest.raisedCents = item.raisedCents;
  }
  for (const item of content.goalsReached) {
    entry(item.twitch, item.display)?.goals.push({ label: item.label, occurredAt: item.occurredAt });
  }
  for (const item of content.liveStarts) {
    const digest = entry(item.twitch, item.display);
    // Un streamer peut couper puis relancer : seul le premier démarrage raconte quelque chose.
    if (digest && digest.liveStartedAt === null) digest.liveStartedAt = item.occurredAt;
  }
  for (const item of content.bigDonations) {
    if (!item.twitch) continue;
    entry(item.twitch, item.twitch)?.bigDonations.push({
      donor: item.donor, amountCents: item.amountCents, occurredAt: item.occurredAt,
    });
  }

  return [...digests.values()].sort(
    (a, b) =>
      b.raisedCents - a.raisedCents ||
      factCount(b) - factCount(a) ||
      a.display.localeCompare(b.display, 'fr'),
  );
}

const factCount = (digest: FavoriteDigest): number =>
  digest.goals.length + digest.bigDonations.length + (digest.liveStartedAt ? 1 : 0);

/**
 * Ce qu'on écrit sous le pseudo d'un favori : ses faits de la période, abrégés.
 *
 * `online` décrit l'instant présent, pas la période : savoir qu'un favori a lancé son
 * direct cette nuit importe moins que de savoir qu'il est encore dessus au moment où on
 * lit. Quand les deux sont vrais, c'est le présent qui est dit.
 */
export function favoriteMarks(digest: FavoriteDigest, online = false): string[] {
  const marks: string[] = [];
  if (online) marks.push('en direct');
  else if (digest.liveStartedAt) {
    marks.push(`direct lancé à ${clock.format(new Date(digest.liveStartedAt))}`);
  }
  if (digest.goals.length === 1) marks.push('1 palier');
  else if (digest.goals.length > 1) marks.push(`${digest.goals.length} paliers`);
  const biggest = digest.bigDonations.reduce(
    (best, item) => (best === null || item.amountCents > best.amountCents ? item : best),
    null as FavoriteDigest['bigDonations'][number] | null,
  );
  if (biggest) marks.push(`don de ${euros.format(biggest.amountCents / 100)}`);
  return marks;
}

/** Une barre du graphe de rythme : ce qu'une tranche a rapporté. */
export interface RecapRhythmBar {
  key: string;
  label: string;
  value: number;
  hint: string;
}

/**
 * Rythme de la période, tranche par tranche, à partir de la courbe cumulée.
 *
 * Les tranches sont découpées sur le temps, pas sur les points relevés — et c'est toute la
 * différence. Compter les écarts entre points consécutifs revient à supposer qu'ils sont
 * régulièrement espacés ; ils ne le sont pas. Une collecte interrompue ne laisse aucun
 * relevé pendant l'arrêt, et le premier point qui suit porte alors tout ce qui a été
 * collecté entre-temps : le graphe dressait un pic de plusieurs millions là où il ne
 * s'était rien passé de particulier, sinon une panne. Chaque écart est donc réparti sur la
 * durée qu'il couvre réellement, ce qui transforme ce faux pic en plateau.
 */
export function toRhythmBars(
  points: readonly { t: string; cents: number }[],
  maxBars = 24,
): RecapRhythmBar[] {
  if (points.length < 2) return [];
  const from = Date.parse(points[0]!.t);
  const to = Date.parse(points[points.length - 1]!.t);
  const span = to - from;
  if (!(span > 0)) return [];

  // Jamais plus de barres que d'intervalles relevés : au-delà, on dessinerait du vide.
  const bars = Math.max(1, Math.min(maxBars, points.length - 1));
  const slot = span / bars;
  const cents = new Array<number>(bars).fill(0);

  for (let index = 1; index < points.length; index += 1) {
    const start = Date.parse(points[index - 1]!.t);
    const end = Date.parse(points[index]!.t);
    const delta = Math.max(0, points[index]!.cents - points[index - 1]!.cents);
    if (delta === 0 || !(end > start)) continue;

    const firstBar = Math.max(0, Math.floor((start - from) / slot));
    const lastBar = Math.min(bars - 1, Math.floor((end - from) / slot));
    for (let bar = firstBar; bar <= lastBar; bar += 1) {
      const barStart = from + bar * slot;
      const overlap = Math.min(end, barStart + slot) - Math.max(start, barStart);
      if (overlap > 0) cents[bar] += (delta * overlap) / (end - start);
    }
  }

  return cents.map((value, index) => {
    const start = new Date(from + index * slot);
    return {
      key: start.toISOString(),
      label: clock.format(start),
      value: value / 100,
      hint: `à partir de ${clock.format(start)}`,
    };
  });
}

/**
 * Libellé de donation goal remis en casse lisible.
 *
 * Les paliers sont saisis par les streamers eux-mêmes : beaucoup arrivent entièrement en
 * capitales, qui se lisent plus lentement et occupent plus de place — au point de se faire
 * couper à mi-mot dans une liste. On ne retouche que ce qui est manifestement crié : un
 * libellé court, ou qui mêle déjà les casses, est laissé tel quel, sigles compris.
 */
export function normalizeGoalLabel(label: string): string {
  const letters = label.replace(/[^\p{L}]/gu, '');
  if (letters.length < 12) return label;
  const upper = letters.replace(/\p{Ll}/gu, '').length;
  if (upper / letters.length < 0.9) return label;
  const lowered = label.toLocaleLowerCase('fr');
  return lowered.charAt(0).toLocaleUpperCase('fr') + lowered.slice(1);
}

/** Texte partagé pour un récap : ce qu'on retiendrait en le racontant. */
export function buildRecapShareText(recap: Recap): string {
  const { summary, counts } = recap.content;
  const euro = (cents: number) => euros.format(cents / 100);
  const lines = [
    `ZEvent — ${recapTitle(recap)}`,
    recapSubtitle(recap),
    `+${euro(summary.raisedCents)} collectés`,
  ];
  if (summary.endCents !== null) lines.push(`Cagnotte : ${euro(summary.endCents)}`);
  if (counts.goalsReached > 0) lines.push(`${counts.goalsReached} donation goals atteints`);
  if (recap.content.bestHour) {
    lines.push(`Meilleure heure : ${clock.format(new Date(recap.content.bestHour.start))}`);
  }
  return lines.join('\n');
}

/**
 * Les journées d'abord, puis les récaps personnels du plus récent au plus ancien.
 *
 * Les journées sont le sommaire de l'événement : elles restent en tête même quand un récap
 * manuel vient d'être créé, sans quoi la liste se réordonnerait sous les doigts à chaque
 * génération.
 */
export function sortRecaps(recaps: readonly Recap[]): Recap[] {
  return [...recaps].sort((a, b) => {
    if ((a.kind === 'day') !== (b.kind === 'day')) return a.kind === 'day' ? -1 : 1;
    return Date.parse(b.periodEnd) - Date.parse(a.periodEnd);
  });
}
