import type { Donation, StreamerMomentum } from '@/api/donations';
import type { Streamer, ZeventState } from '@/api/types';
import { formatCount, formatEuros } from './format';
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

/** Heure de Paris « 14:05 », pour les dons du feed. */
export function parisClock(iso: string): string {
  const parts = parisParts(iso);
  if (!parts) return '';
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`;
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
