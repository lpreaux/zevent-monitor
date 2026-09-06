import type { GoalsSnapshotPayload } from '../jobs/goals-sync.js';
import type { ZeventState } from '../sources/index.js';
import {
  donationThresholdCents,
  isPaused,
  isQuietHour,
  type NotificationPreferences,
} from './preferences.js';

export type DetectedEventKind =
  | 'global_milestone'
  | 'website_mode'
  | 'favorite_live'
  | 'goal_reached'
  | 'goal_near'
  | 'big_donation'
  | 'record_donation';

type GoalPayload = {
  twitch: string;
  display: string;
  goalId: string;
  label: string;
  amountCents: number;
  donationCents: number;
};

export type DetectedEventPayload = {
  global_milestone: { thresholdCents: number; totalCents: number };
  website_mode: { previous: WebsiteMode; current: WebsiteMode };
  favorite_live: { twitch: string; display: string; game: string; viewers: number };
  goal_reached: GoalPayload;
  goal_near: GoalPayload;
  big_donation: {
    donationId: string;
    donor: string;
    amountCents: number;
    comment: string | null;
    twitch: string | null;
  };
  record_donation: {
    donationId: string;
    donor: string;
    amountCents: number;
    /** Plus gros don observé avant celui-ci. */
    previousCents: number;
    twitch: string | null;
  };
};

export type DetectedEvent = {
  [K in DetectedEventKind]: {
    kind: K;
    dedupeKey: string;
    occurredAt: Date;
    payload: DetectedEventPayload[K];
  };
}[DetectedEventKind];

/** Paliers globaux : un événement par seuil franchi, dédupliqué à l'échelle du service. */
export function milestoneEvent(
  thresholdCents: number,
  totalCents: number,
  occurredAt: Date,
): DetectedEvent {
  return {
    kind: 'global_milestone',
    dedupeKey: `global_milestone:${thresholdCents}`,
    occurredAt,
    payload: { thresholdCents, totalCents },
  };
}

export type WebsiteMode = ZeventState['websiteMode'];

/**
 * Changement du statut principal de l'événement (`websiteMode`), celui affiché en tête
 * du dashboard. Sans état précédent on ne notifie pas : le premier relevé n'est pas un changement.
 */
export function detectWebsiteModeChange(
  previous: ZeventState | undefined,
  current: ZeventState,
  occurredAt: Date,
): DetectedEvent[] {
  if (!previous || previous.websiteMode === current.websiteMode) return [];
  // Clé horodatée à l'heure : un aller-retour du site dans l'heure ne re-notifie pas.
  const bucket = occurredAt.toISOString().slice(0, 13);
  return [
    {
      kind: 'website_mode',
      dedupeKey: `website_mode:${previous.websiteMode}->${current.websiteMode}:${bucket}`,
      occurredAt,
      payload: { previous: previous.websiteMode, current: current.websiteMode },
    },
  ];
}

/**
 * Démarrages de live : transition `offline -> online` entre deux collectes.
 * Sans état précédent on ne notifie rien, sinon tous les lives paraîtraient nouveaux au démarrage.
 */
export function detectLiveStarts(
  previous: ZeventState | undefined,
  current: ZeventState,
  occurredAt: Date,
): DetectedEvent[] {
  if (!previous) return [];
  const wasOnline = new Map(previous.live.map((s) => [s.twitch.toLowerCase(), s.online]));
  const events: DetectedEvent[] = [];

  for (const streamer of current.live) {
    const login = streamer.twitch.toLowerCase();
    const before = wasOnline.get(login);
    if (before === undefined || before || !streamer.online) continue;
    // Clé horodatée à l'heure : une coupure de flux dans la même heure ne re-notifie pas.
    const bucket = occurredAt.toISOString().slice(0, 13);
    events.push({
      kind: 'favorite_live',
      dedupeKey: `favorite_live:${login}:${bucket}`,
      occurredAt,
      payload: {
        twitch: login,
        display: streamer.display,
        game: streamer.game,
        viewers: streamer.viewersAmount.number,
      },
    });
  }
  return events;
}

/**
 * Paliers de streamers : atteints (cagnotte perso >= palier) et « bientôt atteints »
 * (>= `nearRatio` du palier, uniquement pour le prochain palier). L'état est recalculé à
 * chaque passage, la déduplication en base garantissant une seule notification par palier.
 */
export function detectGoalEvents(
  goals: GoalsSnapshotPayload,
  state: ZeventState,
  occurredAt: Date,
  nearRatio: number,
): DetectedEvent[] {
  const donationByLogin = new Map(
    state.live.map((s) => [s.twitch.toLowerCase(), Math.round(s.donationAmount.number * 100)]),
  );
  const events: DetectedEvent[] = [];

  for (const streamer of goals.streamers) {
    const login = streamer.twitch.toLowerCase();
    const donationCents = donationByLogin.get(login);
    if (donationCents === undefined) continue;

    const sorted = [...streamer.goals].sort((a, b) => a.amountCents - b.amountCents);
    const display = streamer.displayName ?? streamer.twitch;
    let nextAnnounced = false;

    for (const goal of sorted) {
      if (goal.amountCents <= 0) continue;
      const goalId = String(goal.id);
      const payload: GoalPayload = {
        twitch: login,
        display,
        goalId,
        label: goal.label,
        amountCents: goal.amountCents,
        donationCents,
      };

      if (donationCents >= goal.amountCents) {
        events.push({
          kind: 'goal_reached',
          dedupeKey: `goal_reached:${login}:${goalId}`,
          occurredAt,
          payload,
        });
        continue;
      }

      if (!nextAnnounced) {
        nextAnnounced = true;
        if (donationCents >= goal.amountCents * nearRatio) {
          events.push({
            kind: 'goal_near',
            dedupeKey: `goal_near:${login}:${goalId}`,
            occurredAt,
            payload,
          });
        }
      }
    }
  }
  return events;
}

export type DonationRecord = {
  id: string;
  donor: string;
  amountCents: number;
  comment: string | null;
  /** Code pays fourni par Streamlabs, ou `null`. */
  country: string | null;
  twitch: string | null;
  createdAt: Date;
};

export function donationEvent(donation: DonationRecord): DetectedEvent {
  return {
    kind: 'big_donation',
    dedupeKey: `big_donation:${donation.id}`,
    occurredAt: donation.createdAt,
    payload: {
      donationId: donation.id,
      donor: donation.donor,
      amountCents: donation.amountCents,
      comment: donation.comment,
      twitch: donation.twitch,
    },
  };
}

/**
 * « Nouveau record » : parmi des dons inédits, ceux qui dépassent successivement le plus
 * gros don observé jusque-là (`previousMaxCents`), à partir d'un plancher. Le feed Streamlabs
 * ne montrant qu'une fenêtre récente, il s'agit du record *observé*, pas d'une vérité absolue.
 */
export function detectRecordDonations(
  donations: DonationRecord[],
  previousMaxCents: number | null,
  minCents: number,
): DetectedEvent[] {
  if (previousMaxCents === null) return [];
  let best = Math.max(previousMaxCents, minCents - 1);
  const events: DetectedEvent[] = [];
  const ordered = [...donations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const donation of ordered) {
    if (donation.amountCents <= best) continue;
    events.push({
      kind: 'record_donation',
      dedupeKey: `record_donation:${donation.id}`,
      occurredAt: donation.createdAt,
      payload: {
        donationId: donation.id,
        donor: donation.donor,
        amountCents: donation.amountCents,
        previousCents: best,
        twitch: donation.twitch,
      },
    });
    best = donation.amountCents;
  }
  return events;
}

export type DeviceContext = {
  preferences: NotificationPreferences;
  favorites: Set<string>;
  timeZone: string;
};

/** Décide si un appareil doit recevoir un événement donné, catégorie par catégorie. */
export function shouldDeliver(event: DetectedEvent, device: DeviceContext, now: Date): boolean {
  const { preferences, favorites, timeZone } = device;
  if (isPaused(now, preferences)) return false;
  if (isQuietHour(now, timeZone, preferences)) return false;

  switch (event.kind) {
    case 'global_milestone': {
      const { enabled, stepCents, extraCents } = preferences.globalMilestones;
      const threshold = event.payload.thresholdCents;
      return enabled && (threshold % stepCents === 0 || extraCents.includes(threshold));
    }
    case 'website_mode':
      return preferences.websiteMode.enabled;
    case 'favorite_live':
      return preferences.favoriteLive.enabled && favorites.has(event.payload.twitch);
    case 'goal_reached':
      return preferences.favoriteGoals.enabled && favorites.has(event.payload.twitch);
    case 'goal_near':
      return (
        preferences.favoriteGoals.enabled &&
        preferences.favoriteGoals.nearEnabled &&
        favorites.has(event.payload.twitch)
      );
    case 'big_donation': {
      if (!preferences.bigDonations.enabled) return false;
      const twitch = event.payload.twitch?.toLowerCase() ?? null;
      if (preferences.bigDonations.favoritesOnly && (!twitch || !favorites.has(twitch))) {
        return false;
      }
      return event.payload.amountCents >= donationThresholdCents(twitch, preferences);
    }
    case 'record_donation':
      return preferences.recordDonations.enabled;
    default:
      return false;
  }
}

/** Libellés alignés sur le badge de statut du dashboard (`WebsiteModeBadge`). */
const WEBSITE_MODE_TITLES: Record<WebsiteMode, string> = {
  offline: 'ZEvent : retour en attente',
  concert: 'Le concert d’ouverture commence',
  online: 'Le ZEvent est en direct !',
};

const WEBSITE_MODE_BODIES: Record<WebsiteMode, string> = {
  offline: 'Le site est repassé en mode attente.',
  concert: 'Le concert d’ouverture du ZEvent 2026 démarre.',
  online: 'Les streams et la collecte sont lancés.',
};

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Contenu de la notification et deep link associé (routes expo-router de l'app). */
export function renderNotification(event: DetectedEvent): {
  title: string;
  body: string;
  data: Record<string, unknown>;
} {
  switch (event.kind) {
    case 'global_milestone':
      return {
        title: `${euros.format(event.payload.thresholdCents / 100)} atteints !`,
        body: `La cagnotte ZEvent 2026 dépasse ${euros.format(event.payload.thresholdCents / 100)} (${euros.format(event.payload.totalCents / 100)} collectés).`,
        data: { kind: event.kind, url: '/' },
      };
    case 'website_mode':
      return {
        title: WEBSITE_MODE_TITLES[event.payload.current],
        body: WEBSITE_MODE_BODIES[event.payload.current],
        data: { kind: event.kind, url: '/' },
      };
    case 'favorite_live':
      return {
        title: `${event.payload.display} est en live`,
        body: event.payload.game
          ? `En cours : ${event.payload.game}`
          : 'Le stream vient de démarrer.',
        data: { kind: event.kind, url: `/streamer/${event.payload.twitch}` },
      };
    case 'goal_reached':
      return {
        title: `Palier atteint — ${event.payload.display}`,
        body: `${event.payload.label} (${euros.format(event.payload.amountCents / 100)})`,
        data: { kind: event.kind, url: `/streamer/${event.payload.twitch}` },
      };
    case 'goal_near':
      return {
        title: `Palier proche — ${event.payload.display}`,
        body: `${event.payload.label} : ${euros.format(event.payload.donationCents / 100)} sur ${euros.format(event.payload.amountCents / 100)}`,
        data: { kind: event.kind, url: `/streamer/${event.payload.twitch}` },
      };
    case 'big_donation': {
      const target = event.payload.twitch ? ` pour ${event.payload.twitch}` : '';
      return {
        title: `Gros don : ${euros.format(event.payload.amountCents / 100)}`,
        body: `${event.payload.donor}${target}`,
        data: {
          kind: event.kind,
          url: event.payload.twitch ? `/streamer/${event.payload.twitch}` : '/',
        },
      };
    }
    case 'record_donation': {
      const target = event.payload.twitch ? ` pour ${event.payload.twitch}` : '';
      return {
        title: `Nouveau record : ${euros.format(event.payload.amountCents / 100)}`,
        body: `${event.payload.donor}${target} — précédent record observé : ${euros.format(event.payload.previousCents / 100)}`,
        data: { kind: event.kind, url: '/(tabs)/donations' },
      };
    }
    default:
      return { title: 'ZEvent Monitor', body: '', data: {} };
  }
}
