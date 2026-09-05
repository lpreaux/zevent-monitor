import type { Donation, StreamerMomentum } from '@/api/donations';
import type { Streamer, ZeventState } from '@/api/types';
import { formatCount, formatEuros, formatRelativeTime } from './format';
import { parisParts } from './planning';

/** Bornes « rondes » d'axe : 1, 2, 2,5 ou 5 × 10^n juste au-dessus de la valeur. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const ratio = value / base;
  const step = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10;
  return step * base;
}

/** Part d'un total, en pourcentage entier (0 si le total est nul). */
export function percentOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** Libellé d'une tranche horaire en heure de Paris : « sam. 14h ». */
export function parisHourLabel(iso: string, withDay = true): string {
  const parts = parisParts(iso);
  if (!parts) return '';
  const hour = `${parts.hours}h`;
  return withDay ? `${WEEKDAYS_SHORT[parts.weekday]} ${hour}` : hour;
}

/** Heure de Paris « 14:05 ». */
export function parisClock(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return '';
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`;
}

/** Sous une heure, un don est daté en relatif ; au-delà, jour et heure de Paris : « sam. 14:05 ». */
export const RELATIVE_TIME_MAX_MS = 60 * 60_000;

/**
 * Libellé de date d'un don. Le feed en direct lit mieux en « il y a 40 s » ; sur les
 * classements du week-end, « 14:05 » sans jour serait ambigu.
 */
export function donationTimeLabel(iso: string, now = Date.now()): string {
  const parts = parisParts(iso);
  if (!parts) return '';
  const age = now - Date.parse(iso);
  // Une horloge de téléphone en retard donne un âge négatif : formatRelativeTime le ramène à 0 s.
  if (age < RELATIVE_TIME_MAX_MS) return formatRelativeTime(iso, now);
  return `${WEEKDAYS_SHORT[parts.weekday]} ${parisClock(iso)}`;
}

const COUNTRY_NAMES: Record<string, string> = {
  FR: 'France',
  BE: 'Belgique',
  CH: 'Suisse',
  CA: 'Canada',
  LU: 'Luxembourg',
  DE: 'Allemagne',
  GB: 'Royaume-Uni',
  UK: 'Royaume-Uni',
  US: 'États-Unis',
  ES: 'Espagne',
  IT: 'Italie',
  NL: 'Pays-Bas',
  PT: 'Portugal',
  MA: 'Maroc',
  DZ: 'Algérie',
  TN: 'Tunisie',
  RE: 'La Réunion',
  GP: 'Guadeloupe',
  MQ: 'Martinique',
  GF: 'Guyane',
  PF: 'Polynésie française',
  NC: 'Nouvelle-Calédonie',
  MC: 'Monaco',
  IE: 'Irlande',
  SE: 'Suède',
  NO: 'Norvège',
  DK: 'Danemark',
  FI: 'Finlande',
  PL: 'Pologne',
  AT: 'Autriche',
  JP: 'Japon',
  AU: 'Australie',
  BR: 'Brésil',
  MX: 'Mexique',
  SN: 'Sénégal',
  CI: 'Côte d’Ivoire',
  CM: 'Cameroun',
  IL: 'Israël',
  AE: 'Émirats arabes unis',
  SG: 'Singapour',
  KR: 'Corée du Sud',
  CN: 'Chine',
  IN: 'Inde',
};

export function countryName(code: string | null): string {
  if (!code) return 'Pays inconnu';
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** Drapeau en indicateurs régionaux Unicode ; vide si le code n'est pas alpha-2. */
export function flagEmoji(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + (upper.charCodeAt(0) - 65),
    0x1f1e6 + (upper.charCodeAt(1) - 65),
  );
}

/** Évolution du rang : positif = a gagné des places. `null` sans rang précédent. */
export function rankChange(item: Pick<StreamerMomentum, 'rank' | 'previousRank'>): number | null {
  if (item.previousRank === null || item.rank <= 0) return null;
  return item.previousRank - item.rank;
}

export function medalFor(rank: number): string | null {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
}

/** Nom affiché d'un donateur : « Anonyme » homogène plutôt que les variantes Streamlabs. */
export function donorLabel(donation: Pick<Donation, 'donor' | 'anonymous'>): string {
  return donation.anonymous ? 'Anonyme' : donation.donor.trim() || 'Anonyme';
}

export interface ShareCardModel {
  totalEur: number;
  viewers: number;
  liveCount: number;
  streamerCount: number;
  /** Progression sur la dernière heure, `null` si la collecte ne la couvre pas. */
  deltaHourEur: number | null;
  favorites: Pick<Streamer, 'display' | 'donationAmount' | 'online'>[];
  capturedAt: string;
}

/** Sélectionne les favoris à afficher sur la carte : les plus garnis d'abord, au plus `max`. */
export function buildShareCardModel(
  state: ZeventState,
  favorites: readonly string[],
  deltaHourEur: number | null,
  capturedAt = new Date().toISOString(),
  max = 3,
): ShareCardModel {
  const set = new Set(favorites.map((f) => f.toLowerCase()));
  const chosen = state.live
    .filter((s) => set.has(s.twitch.toLowerCase()))
    .sort((a, b) => b.donationAmount.number - a.donationAmount.number)
    .slice(0, max);
  return {
    totalEur: state.donationAmount.number,
    viewers: state.viewersCount.number,
    liveCount: state.live.filter((s) => s.online).length,
    streamerCount: state.live.length,
    deltaHourEur,
    favorites: chosen,
    capturedAt,
  };
}

/** Texte de partage (repli sans image, ou légende jointe à l'image). */
export function buildShareText(model: ShareCardModel): string {
  const lines = [
    `ZEvent 2026 — ${formatEuros(model.totalEur)} collectés`,
    `${formatCount(model.viewers)} viewers, ${model.liveCount} streamers en live`,
  ];
  if (model.deltaHourEur !== null && model.deltaHourEur > 0) {
    lines.push(`+${formatEuros(model.deltaHourEur)} sur la dernière heure`);
  }
  for (const favorite of model.favorites) {
    lines.push(`★ ${favorite.display} : ${formatEuros(favorite.donationAmount.number)}`);
  }
  const parts = parisParts(model.capturedAt);
  if (parts) {
    lines.push(
      `Le ${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')} à ${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')} (Paris)`,
    );
  }
  lines.push('https://zevent.fr/don');
  return lines.join('\n');
}

/**
 * Accents repliés sur leur lettre nue. Table explicite plutôt que `normalize('NFD')` :
 * la normalisation Unicode dépend d'Intl, absent de certaines constructions Hermes.
 */
const FOLDED: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  ç: 'c',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  æ: 'ae', œ: 'oe', ß: 'ss',
};

/**
 * Texte comparable : minuscules, accents repliés, espaces resserrés. Les donateurs se
 * nomment eux-mêmes, à la main, une fois par don : « Jérôme » et « jerome » doivent se
 * retrouver l'un l'autre.
 */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[À-ſ]/g, (char) => FOLDED[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le don répond-il à la recherche ? Sur le nom du donateur comme sur son message. */
export function matchesDonation(donation: Pick<Donation, 'donor' | 'comment'>, needle: string): boolean {
  if (!needle) return true;
  return (
    foldText(donation.donor).includes(needle) ||
    (donation.comment !== null && foldText(donation.comment).includes(needle))
  );
}

/** Deux graphies d'un même pseudo donnent la même clé : sert à se reconnaître dans un classement. */
export function donorKey(name: string): string {
  return foldText(name);
}

export interface DonationPulse {
  /** Dons par minute sur la durée réellement observée. */
  perMinute: number;
  /** Centimes par minute sur la même durée. */
  centsPerMinute: number;
  /** Durée mesurée : la fenêtre demandée, ou la portée du lot s'il est plus court. */
  spanMs: number;
  count: number;
}

/**
 * Plancher de mesure. Il ne sert qu'à ne pas diviser par une durée nulle : le placer haut
 * écraserait le rythme précisément aux heures de pointe, où un lot entier de dons tient
 * dans quelques secondes.
 */
const PULSE_FLOOR_MS = 10_000;

/**
 * Rythme du feed, calculé sur les dons déjà reçus — aucun appel de plus.
 *
 * Le lot rendu par le backend est borné : en pic d'affluence il ne couvre parfois que
 * deux minutes. Mesurer quand même sur la fenêtre demandée diviserait le compte par une
 * durée que le lot ne documente pas, et le rythme s'effondrerait précisément au moment
 * où il s'emballe. On mesure donc sur ce que le lot couvre vraiment quand il est plus
 * court que la fenêtre.
 */
export function donationPulse(
  donations: readonly Pick<Donation, 'amountCents' | 'createdAt'>[],
  now = Date.now(),
  windowMs = 10 * 60_000,
): DonationPulse | null {
  const cutoff = now - windowMs;
  let count = 0;
  let cents = 0;
  let oldest = Number.POSITIVE_INFINITY;
  for (const donation of donations) {
    const at = Date.parse(donation.createdAt);
    if (!Number.isFinite(at) || at < cutoff) continue;
    count += 1;
    cents += donation.amountCents;
    if (at < oldest) oldest = at;
  }
  if (count === 0) return null;

  // Lot entièrement contenu dans la fenêtre : rien ne dit ce qu'il y avait avant lui.
  const saturated = count === donations.length;
  const spanMs = Math.max(now - (saturated ? oldest : cutoff), PULSE_FLOOR_MS);
  const minutes = spanMs / 60_000;
  return { perMinute: count / minutes, centsPerMinute: cents / minutes, spanMs, count };
}

/**
 * Durée d'observation en toutes lettres. Un lot de dons couvre parfois quelques secondes
 * en pic d'affluence et une demi-heure la nuit : la phrase doit suivre les deux.
 */
export function spanLabel(spanMs: number): string {
  const seconds = Math.max(1, Math.round(spanMs / 1000));
  if (seconds < 90) {
    return seconds === 1 ? 'la dernière seconde' : `les ${seconds} dernières secondes`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'la dernière minute' : `les ${minutes} dernières minutes`;
}

/** Texte de partage d'un don marquant : montant, auteur, destinataire et message. */
export function buildDonationShareText(donation: Donation, streamerLabel?: string | null): string {
  const lines = [
    `${formatEuros(donation.amountCents / 100)} de ${donorLabel(donation)}${
      streamerLabel ? ` pour ${streamerLabel}` : ''
    }`,
  ];
  if (donation.comment) lines.push(`« ${donation.comment.trim()} »`);
  lines.push(`ZEvent 2026 — ${parisClock(donation.createdAt)} (Paris)`);
  lines.push('https://zevent.fr/don');
  return lines.join('\n');
}
