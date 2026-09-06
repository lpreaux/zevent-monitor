// Sonde la capacité de remontée historique du feed de dons Streamlabs Charity et mesure la
// couverture réellement atteignable sur une période donnée (phase 0 du plan
// docs/plans/web-backoffice-monorepo.md).
//
// Streamlabs Charity est une source publique non documentée : ce script ne suppose rien, il
// mesure. Il sert à la fois de preuve de faisabilité et de base à l'adaptateur de backfill.
//
// Usage :
//   node scripts/spike-streamlabs-history.mjs capabilities [--team <id>] [--out <fichier.json>]
//   node scripts/spike-streamlabs-history.mjs coverage --from <iso> --to <iso> [--out <fichier.ndjson>]
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const DEFAULT_TEAM_ID = '945347664248182491'; // ZEvent 2026, cf. apps/api/src/config.ts
const API_BASE = 'https://streamlabscharity.com/api/v1/';
const USER_AGENT = 'zevent-monitor-spike/0.1';
/** Taille de page constatée du feed, non paramétrable (`limit` et `per_page` sont ignorés). */
const PAGE_SIZE = 3000;
/** Décalage réel entre deux pages consécutives : `page` avance de 500 éléments, pas de 3000. */
const PAGE_STRIDE = 500;
/** Délai entre deux requêtes : la source est publique et non documentée, on reste poli. */
const REQUEST_DELAY_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    options[key] = !next || next.startsWith('--') ? 'true' : rest[++index];
  }
  return { command, options };
}

/** Un don normalisé, au format d'import de secours (docs/sources/donation-import-format.md). */
function normalize(entry) {
  const donation = entry.donation ?? entry;
  const member = entry.donation ? (entry.member ?? null) : null;
  const comment = typeof donation.comment === 'string' ? donation.comment : (donation.comment?.text ?? null);
  return {
    id: String(donation.id),
    createdAt: donation.created_at,
    amountCents: Math.round(Number(donation.converted_amount)),
    donor: donation.display_name ?? null,
    comment: comment ?? null,
    country: donation.country ?? null,
    streamlabsMemberId: member ? String(member.id) : null,
    memberSlug: member?.user?.slug ?? null,
    memberDisplayName: member?.user?.display_name ?? null,
  };
}

class Feed {
  #calls = 0;
  #bytes = 0;
  #maxMs = 0;

  constructor(teamId) {
    this.teamId = teamId;
  }

  get stats() {
    return { calls: this.#calls, megabytes: Math.round(this.#bytes / 1e6), maxMs: this.#maxMs };
  }

  /** Une page du feed, avec reprise : une source publique peut renvoyer 5xx ponctuellement. */
  async page(page, { order = 'asc', extra = {} } = {}) {
    const url = new URL(`teams/${this.teamId}/donations`, API_BASE);
    url.searchParams.set('order', order);
    url.searchParams.set('page', String(page));
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const startedAt = Date.now();
      try {
        this.#calls += 1;
        const response = await fetch(url, {
          headers: { accept: 'application/json', 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        this.#bytes += text.length;
        this.#maxMs = Math.max(this.#maxMs, Date.now() - startedAt);
        const payload = JSON.parse(text);
        const entries = Array.isArray(payload) ? payload : (payload.data ?? []);
        return { url: url.toString(), status: response.status, items: entries.map(normalize) };
      } catch (error) {
        lastError = error;
        await sleep(attempt * 1_000);
      }
    }
    throw new Error(`GET ${url} a echoue : ${lastError?.message}`);
  }
}

/** Dernière page pleine et taille de la page finale : la fin du dataset renvoie moins de `PAGE_SIZE`. */
async function findLastPage(feed) {
  let low = 1;
  let high = 2;
  for (;;) {
    const { items } = await feed.page(high);
    await sleep(REQUEST_DELAY_MS);
    if (items.length < PAGE_SIZE) break;
    low = high;
    high *= 2;
    if (high > 1_000_000) throw new Error('Fin du feed introuvable');
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const { items } = await feed.page(middle);
    await sleep(REQUEST_DELAY_MS);
    if (items.length === PAGE_SIZE) low = middle;
    else high = middle;
  }
  const tail = await feed.page(high);
  await sleep(REQUEST_DELAY_MS);
  return { lastFullPage: low, lastPage: high, tailSize: tail.items.length };
}

/**
 * Première page (ordre croissant) dont le dernier don atteint `isoDate`. Le feed trie par
 * `created_at` croissant, ce qui rend la recherche dichotomique légitime.
 */
async function findPageReaching(feed, isoDate, lastPage) {
  let low = 1;
  let high = lastPage;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const { items } = await feed.page(middle);
    await sleep(REQUEST_DELAY_MS);
    const newest = items.at(-1)?.createdAt;
    if (!newest || newest < isoDate) low = middle + 1;
    else high = middle;
  }
  return low;
}

async function capabilities(options) {
  const feed = new Feed(options.team ?? DEFAULT_TEAM_ID);
  const report = {
    source: 'streamlabs-charity',
    endpoint: `${API_BASE}teams/{teamId}/donations`,
    teamId: feed.teamId,
    probedAt: new Date().toISOString(),
    probes: {},
  };

  const first = await feed.page(1);
  await sleep(REQUEST_DELAY_MS);
  report.probes.pageSize = first.items.length;
  report.probes.oldestDonationAt = first.items[0]?.createdAt ?? null;

  // `order` : par défaut le feed part du don le plus ancien, `desc` du plus récent.
  const desc = await feed.page(1, { order: 'desc' });
  await sleep(REQUEST_DELAY_MS);
  report.probes.newestDonationAt = desc.items[0]?.createdAt ?? null;

  // Pas réel entre deux pages : mesuré, pas supposé.
  const second = await feed.page(2);
  await sleep(REQUEST_DELAY_MS);
  const firstIds = first.items.map((item) => item.id);
  const secondIds = second.items.map((item) => item.id);
  const firstIdSet = new Set(firstIds);
  const overlap = new Set(secondIds.filter((id) => firstIdSet.has(id))).size;
  report.probes.pageStride = report.probes.pageSize - overlap;
  report.probes.contiguous = firstIds.slice(report.probes.pageStride).join(',') === secondIds.slice(0, overlap).join(',');

  // Déterminisme : une même page rejouée doit renvoyer exactement la même fenêtre.
  const replay = await feed.page(2);
  await sleep(REQUEST_DELAY_MS);
  report.probes.deterministic = replay.items.map((item) => item.id).join(',') === secondIds.join(',');

  // Tri : croissant par date sur une page, mais les identifiants ne le sont pas.
  const sample = second.items;
  report.probes.createdAtAscending = sample.every((item, index) => index === 0 || sample[index - 1].createdAt <= item.createdAt);
  report.probes.idAscending = sample.every((item, index) => index === 0 || BigInt(sample[index - 1].id) < BigInt(item.id));

  // Paramètres inconnus : un paramètre ignoré renvoie une page de forme inchangée.
  const headPrefix = desc.items.slice(0, 50).map((item) => item.id).join(',');
  report.probes.parameters = {};
  for (const [key, value] of [
    ['limit', 10],
    ['per_page', 10],
    ['after', '2026-09-04T00:00:00Z'],
    ['before', '2026-09-05T00:00:00Z'],
    ['since', '2026-09-04'],
    ['created_after', '2026-09-04'],
    ['cursor', '0'],
  ]) {
    const probe = await feed.page(1, { order: 'desc', extra: { [key]: value } });
    await sleep(REQUEST_DELAY_MS);
    // Le feed avance en direct : on compare la forme, l'égalité stricte est impossible.
    report.probes.parameters[key] = {
      status: probe.status,
      size: probe.items.length,
      honoured: probe.items.length !== PAGE_SIZE,
    };
  }
  report.probes.headPrefixSample = headPrefix.slice(0, 60);

  const { lastFullPage, lastPage, tailSize } = await findLastPage(feed);
  report.probes.lastFullPage = lastFullPage;
  report.probes.lastPage = lastPage;
  report.probes.tailSize = tailSize;
  report.probes.estimatedTotalDonations = PAGE_STRIDE * (lastPage - 1) + tailSize;
  report.probes.stats = feed.stats;

  const output = JSON.stringify(report, null, 2);
  if (options.out) await writeFile(options.out, `${output}\n`);
  console.log(output);
}

async function coverage(options) {
  if (!options.from || !options.to) throw new Error('coverage exige --from et --to (ISO 8601)');
  const from = new Date(options.from).toISOString();
  const to = new Date(options.to).toISOString();
  const feed = new Feed(options.team ?? DEFAULT_TEAM_ID);

  const { lastPage, tailSize } = await findLastPage(feed);
  const startPage = await findPageReaching(feed, from, lastPage);

  const stream = options.out ? createWriteStream(options.out) : null;
  const seen = new Set();
  let inWindow = 0;
  let amountCents = 0;
  let gaps = 0;
  let observedFrom = null;
  let observedTo = null;
  let previousIds = null;
  // Pas de 5 pages : 2500 dons inédits par requête et 500 de recouvrement, qui prouvent
  // qu'aucun don n'est sauté entre deux appels.
  const stridePages = 5;
  let page = startPage;

  for (; page <= lastPage; page += stridePages) {
    const { items } = await feed.page(page);
    await sleep(REQUEST_DELAY_MS);
    const ids = items.map((item) => item.id);
    if (previousIds && !ids.some((id) => previousIds.includes(id))) gaps += 1;
    previousIds = ids;

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.createdAt < from || item.createdAt >= to) continue;
      inWindow += 1;
      amountCents += Number.isFinite(item.amountCents) ? item.amountCents : 0;
      if (!observedFrom || item.createdAt < observedFrom) observedFrom = item.createdAt;
      if (!observedTo || item.createdAt > observedTo) observedTo = item.createdAt;
      stream?.write(`${JSON.stringify(item)}\n`);
    }

    if (items.length === 0 || items[0].createdAt >= to) break;
  }

  await new Promise((resolve) => (stream ? stream.end(resolve) : resolve()));

  // `complete` exige une fenêtre entièrement parcourue sans trou de recouvrement.
  const level = inWindow === 0 ? 'unknown' : gaps === 0 ? 'complete' : 'partial';
  console.log(
    JSON.stringify(
      {
        source: 'streamlabs-charity',
        teamId: feed.teamId,
        window: { from, to },
        startPage,
        endPage: Math.min(page, lastPage),
        lastPage,
        tailSize,
        donationsInWindow: inWindow,
        donationsScanned: seen.size,
        amountEur: Math.round(amountCents / 100),
        observedFrom,
        observedTo,
        gaps,
        coverage: level,
        stats: feed.stats,
      },
      null,
      2,
    ),
  );
}

const { command, options } = parseArgs(process.argv.slice(2));
try {
  if (command === 'capabilities') await capabilities(options);
  else if (command === 'coverage') await coverage(options);
  else throw new Error('Usage : node scripts/spike-streamlabs-history.mjs capabilities|coverage [options]');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
