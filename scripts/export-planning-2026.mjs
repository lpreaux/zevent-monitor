// Exporte un snapshot de secours du planning ZEvent 2026 depuis l'API communautaire
// EvenMoreStats/InGDoc (non officielle, sous-domaine "ppr"). L'API officielle zevent.fr
// expose un champ `calendar` resté vide, y compris après l'ouverture de l'édition 2026.
// Sert de secours hors-ligne : le backend resynchronise en direct (table planning_snapshots).
// Usage : node scripts/export-planning-2026.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.ppr.evenmorestats.fr/';
const EVENT_NAME = 'ZEvent 2026';
const FALLBACK_EVENT_ID = '019f5bd1-fe07-7d78-a326-a02198a9d50f'; // cf. GET /events le 3 septembre 2026

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(rootDir, 'apps/mobile/src/content/planning-2026.json');

async function getJson(path) {
  const response = await fetch(new URL(path, API_BASE), {
    headers: { accept: 'application/json', 'user-agent': 'zevent-monitor-import/0.1' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${path}`);
  return response.json();
}

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
const shows = await getJson(`events/${eventId}/shows`);
const fetchedAt = new Date().toISOString();

const entries = shows
  .filter((show) => show?.schedule?.start && !Number.isNaN(Date.parse(show.schedule.start)))
  .map((show) => ({
    id: `ingdoc:${show.id}`,
    title: show.name,
    description: show.description ?? '',
    startsAt: new Date(show.schedule.start).toISOString(),
    endsAt: show.schedule.end && !Number.isNaN(Date.parse(show.schedule.end))
      ? new Date(show.schedule.end).toISOString()
      : null,
    allDay: Boolean(show.all_day),
    source: 'ingdoc',
    participants: (show.participants ?? []).map((participant) => ({
      name: participant.streamer_name,
      twitch: participant.socials?.twitch?.login?.toLowerCase() ?? null,
      profileUrl: participant.profile_url ?? null,
      role: participant.role ? participant.role.toLowerCase() : null,
      broadcaster: Boolean(participant.broadcaster),
    })),
  }))
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'fr'));

const snapshot = {
  edition: 2026,
  provenance: {
    provider: 'EvenMoreStats / InGDoc (communautaire, non officiel)',
    eventId,
    showsUrl: new URL(`events/${eventId}/shows`, API_BASE).toString(),
    fetchedAt,
    note: "Créditer InGDoc/EvenMoreStats. Snapshot de secours hors ligne : le backend resynchronise en direct.",
  },
  entries,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Écrit ${outputPath} (${entries.length} entrées de planning)`);
