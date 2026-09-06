const baseUrl = (process.argv[2] ?? process.env.SERVER_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const waitMs = Number(process.env.VERIFY_WAIT_MS ?? 75_000);

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const health = await get('/healthz');
const readiness = await get('/readyz');
const initial = await get('/v1/collection-status');

if (health.status !== 'ok' || readiness.status !== 'ready') {
  throw new Error('The deployment is not healthy and ready');
}

console.log(`Healthy deployment; ${initial.sampleCount} sample(s). Waiting ${waitMs / 1000}s…`);
await new Promise((resolve) => setTimeout(resolve, waitMs));

const final = await get('/v1/collection-status');
if (final.sampleCount <= initial.sampleCount) {
  throw new Error(`Collection did not progress (${initial.sampleCount} -> ${final.sampleCount})`);
}

console.log(`Collection verified: ${initial.sampleCount} -> ${final.sampleCount} samples; latest ${final.lastSampleAt}`);
