// Exporte un snapshot de secours des donation goals ZEvent 2026 depuis l'API
// communautaire EvenMoreStats/InGDoc (non officielle, sous-domaine "ppr").
// Sert de secours hors-ligne : le backend resynchronise en direct (table goals_snapshots).
// Usage : node scripts/export-goals-2026.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.ppr.evenmorestats.fr/';
const EVENT_NAME = 'ZEvent 2026';
const FALLBACK_EVENT_ID = '019f5bd1-fe07-7d78-a326-a02198a9d50f'; // cf. GET /events le 3 septembre 2026
const REQUEST_DELAY_MS = 150; // reste raisonnable envers une API non documentée

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(rootDir, 'src/content/goals-2026.json');

async function getJson(path) {
  const response = await fetch(new URL(path, API_BASE), {
    headers: { accept: 'application/json', 'user-agent': 'zevent-monitor-import/0.1' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${path}`);
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveEventId() {
  try {
    const events = await getJson('events');
    const match = events.find((event) => event.name === EVENT_NAME);
    if (match) return match.id;
    console.warn(`"${EVENT_NAME}" introuvable via GET /events, repli sur l'id connu.`);
  } catch (error) {
    console.warn(`GET /events indisponible (${error.message}), repli sur l'id connu.`);
  }
  return FALLBACK_EVENT_ID;
}

const eventId = await resolveEventId();
const overview = await getJson(`events/${eventId}/donation_goals/overview`);
const withGoals = overview.filter((participation) => participation.donation_goals_count > 0);

const fetchedAt = new Date().toISOString();
const streamers = [];
for (const participation of withGoals) {
  const twitch = participation.socials?.twitch?.login;
  if (!twitch) {
    console.warn(`Participation "${participation.name}" (${participation.id}) sans login Twitch, ignorée.`);
    continue;
  }

  const goals = await getJson(`participations/${participation.id}/donation_goals`);
  streamers.push({
    twitch,
    displayName: participation.name,
    participationId: participation.id,
    source: 'ingdoc',
    updatedAt: fetchedAt,
    goals: goals.map((goal) => ({
      id: goal.id,
      amountCents: goal.amount,
      label: goal.name,
      category: goal.category ?? null,
      reached: Boolean(goal.reached),
    })),
  });

  await sleep(REQUEST_DELAY_MS);
}

const snapshot = {
  edition: 2026,
  provenance: {
    provider: 'EvenMoreStats / InGDoc (communautaire, non officiel)',
    eventId,
    overviewUrl: new URL(`events/${eventId}/donation_goals/overview`, API_BASE).toString(),
    goalsUrlTemplate: `${API_BASE}participations/{participationId}/donation_goals`,
    fetchedAt,
    note: 'Créditer InGDoc/EvenMoreStats. Snapshot de secours hors ligne : le backend resynchronise en direct.',
  },
  streamers,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Écrit ${outputPath} (${streamers.length} streamers avec goals sur ${overview.length} participations)`);
