import { describe, expect, it } from 'vitest';

import { toDonationRecords, buildLoginResolver } from '../src/jobs/donations.js';
import {
  detectGoalEvents,
  detectLiveStarts,
  detectWebsiteModeChange,
  donationEvent,
  milestoneEvent,
  renderNotification,
  shouldDeliver,
  type DeviceContext,
} from '../src/notifications/events.js';
import { chunk, isUnrecoverableTokenError } from '../src/notifications/expo-push.js';
import {
  defaultPreferences,
  isQuietHour,
  isPaused,
  milestonesCrossed,
  notificationPreferencesSchema,
  parsePreferences,
} from '../src/notifications/preferences.js';
import type { ZeventState } from '../src/sources/index.js';

const amount = (value: number) => ({ number: value, formatted: `${value}` });

function streamer(twitch: string, options: { online?: boolean; donation?: number } = {}) {
  return {
    twitch_id: `id-${twitch}`,
    display: twitch.toUpperCase(),
    twitch,
    profileUrl: 'https://example.test/a.png',
    online: options.online ?? false,
    game: 'Just Chatting',
    viewersAmount: amount(10),
    streamlabsId: null,
    donationUrl: `https://zevent.fr/don/${twitch}`,
    ref: 'ref',
    donationAmount: amount(options.donation ?? 0),
  };
}

function state(streamers: ReturnType<typeof streamer>[], totalEuros = 0): ZeventState {
  return {
    live: streamers,
    globalDonationUrl: 'https://zevent.fr/don',
    streamlabsCampaignId: '1',
    donationAmount: amount(totalEuros),
    viewersCount: amount(100),
    calendar: [],
    marquee: null,
    widgetVersionId: 3,
    eventSourceDisabled: false,
    websiteMode: 'online',
    eventSourceWhitelist: [],
  };
}

const device = (overrides: Partial<DeviceContext> = {}): DeviceContext => ({
  preferences: defaultPreferences(),
  favorites: new Set(['aducine']),
  timeZone: 'Europe/Paris',
  ...overrides,
});

const now = new Date('2026-09-05T14:00:00Z');

describe('préférences', () => {
  it('complète un enregistrement partiel avec les valeurs par défaut', () => {
    const preferences = parsePreferences({ bigDonations: { minCents: 100_000 } });

    expect(preferences.bigDonations.minCents).toBe(100_000);
    expect(preferences.bigDonations.enabled).toBe(true);
    expect(preferences.globalMilestones.stepCents).toBe(100_000_000);
  });

  it('rejette une plage silencieuse mal formée', () => {
    expect(
      notificationPreferencesSchema.safeParse({ quietHours: { enabled: true, start: '25:00' } })
        .success,
    ).toBe(false);
  });

  it('désactiver une catégorie ne modifie pas les autres réglages', () => {
    const preferences = parsePreferences({
      favoriteLive: { enabled: false },
      bigDonations: { minCents: 25_000 },
    });

    expect(preferences.favoriteLive.enabled).toBe(false);
    expect(preferences.favoriteGoals.enabled).toBe(true);
    expect(preferences.bigDonations.minCents).toBe(25_000);
  });
});

describe('paliers globaux', () => {
  const preferences = parsePreferences({
    globalMilestones: { stepCents: 100_000_000, extraCents: [123_400_000] },
  });

  it('ne retourne que les seuils franchis dans l’intervalle', () => {
    expect(milestonesCrossed(99_000_000, 101_000_000, preferences)).toEqual([100_000_000]);
    expect(milestonesCrossed(101_000_000, 120_000_000, preferences)).toEqual([]);
  });

  it('prend en compte les seuils supplémentaires', () => {
    expect(milestonesCrossed(120_000_000, 200_000_000, preferences)).toEqual([
      123_400_000, 200_000_000,
    ]);
  });

  it('borne le rattrapage après une longue interruption', () => {
    const crossed = milestonesCrossed(0, 2_000_000_000, preferences);

    expect(crossed).toHaveLength(5);
    expect(crossed.at(-1)).toBe(2_000_000_000);
  });

  it('ignore une cagnotte qui ne progresse pas', () => {
    expect(milestonesCrossed(100_000_000, 100_000_000, preferences)).toEqual([]);
  });

  it('n’envoie un palier qu’aux appareils dont le pas correspond', () => {
    const event = milestoneEvent(150_000_000, 151_000_000, now);

    expect(shouldDeliver(event, device(), now)).toBe(false);
    expect(
      shouldDeliver(
        event,
        device({ preferences: parsePreferences({ globalMilestones: { stepCents: 50_000_000 } }) }),
        now,
      ),
    ).toBe(true);
  });
});

describe('plages silencieuses et suspension', () => {
  const quiet = parsePreferences({ quietHours: { enabled: true, start: '23:00', end: '08:00' } });

  it('couvre le passage de minuit dans le fuseau de l’appareil', () => {
    // 23h30 puis 09h00 heure de Paris.
    expect(isQuietHour(new Date('2026-09-05T21:30:00Z'), 'Europe/Paris', quiet)).toBe(true);
    expect(isQuietHour(new Date('2026-09-06T07:00:00Z'), 'Europe/Paris', quiet)).toBe(false);
  });

  it('dépend du fuseau déclaré', () => {
    expect(isQuietHour(new Date('2026-09-05T21:30:00Z'), 'Pacific/Noumea', quiet)).toBe(false);
  });

  it('respecte « tout suspendre » et la suspension temporaire', () => {
    expect(isPaused(now, parsePreferences({ enabled: false }))).toBe(true);
    expect(
      isPaused(now, parsePreferences({ pausedUntil: '2026-09-05T15:00:00.000Z' })),
    ).toBe(true);
    expect(
      isPaused(now, parsePreferences({ pausedUntil: '2026-09-05T13:00:00.000Z' })),
    ).toBe(false);
  });

  it('bloque toutes les catégories pendant une plage silencieuse', () => {
    const event = milestoneEvent(100_000_000, 100_100_000, now);

    expect(shouldDeliver(event, device({ preferences: quiet, timeZone: 'Europe/Paris' }), new Date('2026-09-05T22:00:00Z'))).toBe(false);
  });
});

describe('statut de l’événement', () => {
  const waiting = state([streamer('aducine')]);
  const live = { ...state([streamer('aducine')]), websiteMode: 'online' as const };
  const concert = { ...state([streamer('aducine')]), websiteMode: 'concert' as const };

  it('détecte le passage en concert puis en direct', () => {
    const toConcert = detectWebsiteModeChange({ ...waiting, websiteMode: 'offline' }, concert, now);
    const toLive = detectWebsiteModeChange(concert, live, now);

    expect(toConcert[0]?.payload).toEqual({ previous: 'offline', current: 'concert' });
    expect(toLive[0]?.payload).toEqual({ previous: 'concert', current: 'online' });
  });

  it('ne notifie ni au premier relevé ni sans changement', () => {
    expect(detectWebsiteModeChange(undefined, live, now)).toEqual([]);
    expect(detectWebsiteModeChange(live, live, now)).toEqual([]);
  });

  it('ne re-notifie pas un aller-retour dans la même heure', () => {
    const first = detectWebsiteModeChange({ ...waiting, websiteMode: 'offline' }, live, new Date('2026-09-05T14:00:00Z'));
    const again = detectWebsiteModeChange({ ...waiting, websiteMode: 'offline' }, live, new Date('2026-09-05T14:58:00Z'));

    expect(first[0]?.dedupeKey).toBe(again[0]?.dedupeKey);
  });

  it('se désactive indépendamment des autres catégories', () => {
    const [event] = detectWebsiteModeChange({ ...waiting, websiteMode: 'offline' }, live, now);
    const off = parsePreferences({ websiteMode: { enabled: false } });

    expect(event && shouldDeliver(event, device(), now)).toBe(true);
    expect(event && shouldDeliver(event, device({ preferences: off }), now)).toBe(false);
    expect(off.favoriteLive.enabled).toBe(true);
  });

  it('annonce le direct avec un libellé explicite', () => {
    const [event] = detectWebsiteModeChange({ ...waiting, websiteMode: 'concert' }, live, now);

    expect(event && renderNotification(event).title).toBe('Le ZEvent est en direct !');
    expect(event && renderNotification(event).data.url).toBe('/');
  });
});

describe('démarrages de live', () => {
  it('ne détecte que la transition hors ligne vers en ligne', () => {
    const previous = state([streamer('aducine'), streamer('zerator', { online: true })]);
    const current = state([streamer('aducine', { online: true }), streamer('zerator', { online: true })]);

    const events = detectLiveStarts(previous, current, now);

    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ twitch: 'aducine' });
  });

  it('ne notifie rien sans état précédent', () => {
    expect(detectLiveStarts(undefined, state([streamer('aducine', { online: true })]), now)).toEqual([]);
  });

  it('réutilise la même clé de déduplication dans l’heure', () => {
    const previous = state([streamer('aducine')]);
    const current = state([streamer('aducine', { online: true })]);

    const first = detectLiveStarts(previous, current, new Date('2026-09-05T14:00:00Z'));
    const second = detectLiveStarts(previous, current, new Date('2026-09-05T14:59:00Z'));

    expect(first[0]?.dedupeKey).toBe(second[0]?.dedupeKey);
  });

  it('n’est délivré qu’aux favoris', () => {
    const [event] = detectLiveStarts(
      state([streamer('aducine')]),
      state([streamer('aducine', { online: true })]),
      now,
    );

    expect(event && shouldDeliver(event, device(), now)).toBe(true);
    expect(event && shouldDeliver(event, device({ favorites: new Set() }), now)).toBe(false);
  });
});

describe('paliers de streamers', () => {
  const goals = {
    eventId: 'event',
    streamers: [
      {
        twitch: 'aducine',
        displayName: 'Aducine',
        participationId: 'p1',
        goals: [
          { id: 1, amountCents: 100_000, label: 'Karaoké', category: null, reached: false },
          { id: 2, amountCents: 500_000, label: 'Rasage', category: null, reached: false },
          { id: 3, amountCents: 900_000, label: 'Marathon', category: null, reached: false },
        ],
      },
    ],
  };

  it('signale les paliers atteints et le prochain palier proche', () => {
    const events = detectGoalEvents(goals, state([streamer('aducine', { donation: 4_600 })]), now, 0.9);

    expect(events.map((event) => event.kind)).toEqual(['goal_reached', 'goal_near']);
    expect(events[1]?.payload).toMatchObject({ goalId: '2', amountCents: 500_000 });
  });

  it('ne considère jamais un palier lointain comme proche', () => {
    const events = detectGoalEvents(goals, state([streamer('aducine', { donation: 1_500 })]), now, 0.9);

    expect(events.map((event) => event.kind)).toEqual(['goal_reached']);
  });

  it('produit une clé stable par palier, indépendante de l’heure de détection', () => {
    const first = detectGoalEvents(goals, state([streamer('aducine', { donation: 1_500 })]), now, 0.9);
    const second = detectGoalEvents(
      goals,
      state([streamer('aducine', { donation: 2_000 })]),
      new Date('2026-09-06T02:00:00Z'),
      0.9,
    );

    expect(first[0]?.dedupeKey).toBe(second[0]?.dedupeKey);
  });

  it('n’envoie « palier proche » que si l’appareil l’a activé', () => {
    const events = detectGoalEvents(goals, state([streamer('aducine', { donation: 4_600 })]), now, 0.9);
    const near = events.find((event) => event.kind === 'goal_near');

    expect(near && shouldDeliver(near, device(), now)).toBe(false);
    expect(
      near &&
        shouldDeliver(
          near,
          device({ preferences: parsePreferences({ favoriteGoals: { nearEnabled: true } }) }),
          now,
        ),
    ).toBe(true);
  });
});

describe('gros dons', () => {
  const donation = (overrides: Partial<{ amountCents: number; twitch: string | null }> = {}) =>
    donationEvent({
      id: 'don-1',
      donor: 'Anonyme',
      amountCents: overrides.amountCents ?? 60_000,
      comment: 'Courage !',
      twitch: overrides.twitch === undefined ? 'aducine' : overrides.twitch,
      createdAt: now,
    });

  it('applique le seuil global', () => {
    expect(shouldDeliver(donation({ amountCents: 60_000 }), device(), now)).toBe(true);
    expect(shouldDeliver(donation({ amountCents: 20_000 }), device(), now)).toBe(false);
  });

  it('applique la surcharge par streamer', () => {
    const preferences = parsePreferences({
      bigDonations: { minCents: 50_000, perStreamerMinCents: { aducine: 10_000 } },
    });

    expect(shouldDeliver(donation({ amountCents: 20_000 }), device({ preferences }), now)).toBe(true);
  });

  it('peut se restreindre aux favoris', () => {
    const preferences = parsePreferences({ bigDonations: { favoritesOnly: true } });

    expect(shouldDeliver(donation({ twitch: 'zerator' }), device({ preferences }), now)).toBe(false);
    expect(shouldDeliver(donation({ twitch: null }), device({ preferences }), now)).toBe(false);
    expect(shouldDeliver(donation(), device({ preferences }), now)).toBe(true);
  });

  it('ne fuit jamais le commentaire du don dans la notification', () => {
    const rendered = renderNotification(donation());

    expect(rendered.body).not.toContain('Courage');
    expect(rendered.data.url).toBe('/streamer/aducine');
  });
});

describe('feed Streamlabs', () => {
  const resolver = buildLoginResolver(state([streamer('aducine')]));

  it('associe le nom affiché au login Twitch connu', () => {
    const records = toDonationRecords(
      [
        {
          id: 1,
          display_name: 'Donateur',
          converted_amount: 5_000,
          comment: null,
          created_at: '2026-09-05T14:00:00.000Z',
          z_event_name: { twitch_display_name: 'ADUCINE' },
        },
        {
          id: 2,
          display_name: 'Donateur',
          converted_amount: 5_000,
          created_at: '2026-09-05T14:01:00.000Z',
          z_event_name: { twitch_display_name: 'Inconnu' },
        },
      ],
      resolver,
    );

    expect(records[0]).toMatchObject({ id: '1', twitch: 'aducine', amountCents: 5_000 });
    expect(records[1]?.twitch).toBeNull();
  });

  it('déduplique par identifiant de don via la clé d’événement', () => {
    const [record] = toDonationRecords(
      [
        {
          id: 'abc',
          display_name: 'Donateur',
          converted_amount: 5_000,
          created_at: '2026-09-05T14:00:00.000Z',
        },
      ],
      resolver,
    );

    expect(record && donationEvent(record).dedupeKey).toBe('big_donation:abc');
  });
});

describe('Expo push', () => {
  it('découpe les envois par lots de 100', () => {
    expect(chunk(Array.from({ length: 250 }, (_, index) => index), 100).map((c) => c.length)).toEqual([
      100, 100, 50,
    ]);
  });

  it('identifie les erreurs de token définitives', () => {
    expect(isUnrecoverableTokenError('DeviceNotRegistered')).toBe(true);
    expect(isUnrecoverableTokenError('MessageRateExceeded')).toBe(false);
    expect(isUnrecoverableTokenError(undefined)).toBe(false);
  });
});
