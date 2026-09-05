import { describe, expect, it } from 'vitest';

import type { ZeventState } from '../src/api/types';
import { formatEuros } from '../src/lib/format';
import {
  buildShareCardModel,
  buildShareText,
  countryName,
  donationTimeLabel,
  donorLabel,
  flagEmoji,
  niceCeil,
  parisHourLabel,
  percentOf,
  rankChange,
} from '../src/lib/donations';

const amount = (value: number) => ({ number: value, formatted: `${value}` });

function streamer(twitch: string, donation: number, online = true) {
  return {
    twitch_id: `id-${twitch}`,
    display: twitch.toUpperCase(),
    twitch,
    profileUrl: '',
    online,
    game: '',
    viewersAmount: amount(1),
    streamlabsId: null,
    donationUrl: '',
    ref: '',
    donationAmount: amount(donation),
  };
}

const state: ZeventState = {
  live: [streamer('a', 500), streamer('b', 900, false), streamer('c', 100)],
  globalDonationUrl: 'https://zevent.fr/don',
  streamlabsCampaignId: '1',
  donationAmount: amount(1_234_567),
  viewersCount: amount(250_000),
  calendar: [],
  marquee: null,
  widgetVersionId: 3,
  eventSourceDisabled: false,
  websiteMode: 'online',
  eventSourceWhitelist: [],
};

describe('échelles et pourcentages', () => {
  it('arrondit vers une borne ronde', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(120)).toBe(200);
    expect(niceCeil(230)).toBe(250);
    expect(niceCeil(4_900)).toBe(5_000);
    expect(niceCeil(1_000_000)).toBe(1_000_000);
  });

  it('calcule des parts robustes', () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('libellés', () => {
  it('formate les tranches horaires en heure de Paris (été)', () => {
    expect(parisHourLabel('2026-09-05T12:00:00Z')).toBe('sam. 14h');
    expect(parisHourLabel('2026-09-05T12:00:00Z', false)).toBe('14h');
    expect(parisHourLabel('pas une date')).toBe('');
  });

  it('date un don en relatif sous une heure, puis en jour et heure de Paris', () => {
    const now = Date.parse('2026-09-05T12:00:00Z');
    // `\s` couvre l'espace insécable utilisée par formatRelativeTime.
    expect(donationTimeLabel('2026-09-05T11:59:20Z', now)).toMatch(/^il y a 40\ss$/);
    expect(donationTimeLabel('2026-09-05T11:35:00Z', now)).toMatch(/^il y a 25\smin$/);
    expect(donationTimeLabel('2026-09-05T11:00:00Z', now)).toBe('sam. 13:00');
    expect(donationTimeLabel('2026-09-04T20:05:00Z', now)).toBe('ven. 22:05');
    // Horloge du téléphone en retard sur Streamlabs : pas de « il y a -3 s ».
    expect(donationTimeLabel('2026-09-05T12:00:03Z', now)).toMatch(/^il y a 0\ss$/);
    expect(donationTimeLabel('pas une date', now)).toBe('');
  });

  it('nomme les pays et produit un drapeau', () => {
    expect(countryName('fr')).toBe('France');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName(null)).toBe('Pays inconnu');
    expect(flagEmoji('FR')).toBe('🇫🇷');
    expect(flagEmoji(null)).toBe('');
    expect(flagEmoji('FRA')).toBe('');
  });

  it('homogénéise les anonymes', () => {
    expect(donorLabel({ donor: 'anonymous', anonymous: true })).toBe('Anonyme');
    expect(donorLabel({ donor: '  Lucas ', anonymous: false })).toBe('Lucas');
    expect(donorLabel({ donor: '   ', anonymous: false })).toBe('Anonyme');
  });

  it('mesure l’évolution du rang', () => {
    expect(rankChange({ rank: 2, previousRank: 5 })).toBe(3);
    expect(rankChange({ rank: 4, previousRank: 1 })).toBe(-3);
    expect(rankChange({ rank: 4, previousRank: null })).toBeNull();
  });
});

describe('carte de partage', () => {
  it('garde les favoris les plus garnis dans la limite demandée', () => {
    const model = buildShareCardModel(state, ['A', 'c', 'b'], 12_000, '2026-09-05T12:34:00Z', 2);

    expect(model.favorites.map((f) => f.display)).toEqual(['B', 'A']);
    expect(model).toMatchObject({ totalEur: 1_234_567, liveCount: 2, streamerCount: 3 });
  });

  it('produit un texte de repli complet', () => {
    const model = buildShareCardModel(state, ['a'], 12_000, '2026-09-05T12:34:00Z');
    const text = buildShareText(model);

    expect(text).toContain(formatEuros(1_234_567));
    expect(text).toContain(`+${formatEuros(12_000)} sur la dernière heure`);
    expect(text).toContain(`★ A : ${formatEuros(500)}`);
    expect(text).toContain('05/09 à 14:34 (Paris)');
    expect(text.endsWith('https://zevent.fr/don')).toBe(true);
  });

  it('omet la progression quand elle est inconnue', () => {
    const text = buildShareText(buildShareCardModel(state, [], null, '2026-09-05T12:34:00Z'));
    expect(text).not.toContain('dernière heure');
  });
});
