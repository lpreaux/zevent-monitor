// Importe et fige la courbe de collecte ZEvent 2025 depuis le cache communautaire
// EvenMoreStats/InGDoc, avec provenance (URL, date de récupération, empreinte SHA-256).
// Usage : node scripts/import-history-2025.mjs
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_ID = '019d3f95-bd24-7e5d-861b-1de6243e3169'; // ZEvent 2025, cf. GET /events
const SOURCE_URL = `https://cache.evenmorestats.fr/${EVENT_ID}/global.json`;
// Ouverture officielle de la collecte 2025 (schedule_raising.start sur GET /events).
const RAISING_STARTS_AT = '2025-09-05T08:00:00Z';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(rootDir, 'src/content/history/zevent-2025.json');

function toSeries(series) {
  if (!series || !Array.isArray(series.labels) || !Array.isArray(series.values)) {
    throw new Error('Unexpected series shape from EvenMoreStats cache');
  }
  return { labels: series.labels, valuesEur: series.values };
}

const response = await fetch(SOURCE_URL, {
  headers: { accept: 'application/json', 'user-agent': 'zevent-monitor-import/0.1' },
});
if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${SOURCE_URL}`);
const rawText = await response.text();
const sha256 = createHash('sha256').update(rawText).digest('hex');
const raw = JSON.parse(rawText);

const donations = raw?.graph?.donations;
if (!donations?.lan || !donations?.remote || !donations?.all) {
  throw new Error('Missing lan/remote/all donation series in source payload');
}

const fetchedAt = new Date().toISOString();
const allSeries = toSeries(donations.all);
const snapshot = {
  edition: 2025,
  provenance: {
    provider: 'EvenMoreStats / InGDoc (communautaire, non officiel)',
    eventId: EVENT_ID,
    url: SOURCE_URL,
    fetchedAt,
    sha256,
    note: 'Créditer InGDoc/EvenMoreStats. Snapshot figé : ne pas dépendre du cache tiers à chaque affichage.',
  },
  timezone: 'Europe/Paris',
  raisingStartsAt: RAISING_STARTS_AT,
  amountRaisedCentsAtLastSample: Math.round(allSeries.valuesEur.at(-1) * 100),
  // Séries en euros, alignement (T+0, %) laissé au code d'affichage — cf. PLAN.md §1.5.
  series: {
    lan: toSeries(donations.lan),
    remote: toSeries(donations.remote),
    all: allSeries,
  },
  omitted: [
    'viewers: payload source malformé (labels/values = simples index), non importé',
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Écrit ${outputPath} (${allSeries.labels.length} points, sha256=${sha256.slice(0, 12)}…)`);
