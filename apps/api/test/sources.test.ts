import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { SourceClient, SourceUnavailableError } from '../src/sources/client.js';
import { participationGoalsSchema } from '../src/sources/evenmorestats.js';
import {
  streamlabsDonationsSchema,
  streamlabsMembersSchema,
  streamlabsTeamSchema,
} from '../src/sources/streamlabs.js';
import { zeventStateSchema } from '../src/sources/zevent.js';

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
}

describe('source schemas', () => {
  it('validates representative upstream payloads', async () => {
    expect(zeventStateSchema.parse(await fixture('zevent-state.json')).live[0]?.twitch).toBe('aducine');
    expect(streamlabsTeamSchema.parse(await fixture('streamlabs-team.json')).amount_raised).toBe(123456789);
    expect(streamlabsMembersSchema.parse(await fixture('streamlabs-members.json')).total).toBe(303);

    const donations = streamlabsDonationsSchema.parse(await fixture('streamlabs-donations.json'));
    expect(Array.isArray(donations) ? donations : donations.data).toHaveLength(1);

    const goals = participationGoalsSchema.parse(await fixture('evenmorestats-goals.json'));
    expect(Array.isArray(goals) ? goals : goals.data).toHaveLength(1);
  });
});

describe('SourceClient last-valid cache', () => {
  it('returns the cached value when a later response is invalid', async () => {
    const validPayload = await fixture('zevent-state.json');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ live: 'invalid' }), { status: 200 }));
    const client = new SourceClient({ fetch: fetchMock, now: () => new Date('2026-09-04T18:00:00Z') });

    const fresh = await client.get('zevent:state', 'https://example.test', zeventStateSchema);
    const fallback = await client.get('zevent:state', 'https://example.test', zeventStateSchema);

    expect(fresh.stale).toBe(false);
    expect(fallback.stale).toBe(true);
    expect(fallback.fetchedAt).toBe(fresh.fetchedAt);
    expect(fallback.data).toEqual(fresh.data);
    expect(fallback.error).toContain('Invalid input');
  });

  it('fails explicitly if no valid value has ever been cached', async () => {
    const client = new SourceClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('unavailable', { status: 503 })),
    });

    await expect(client.get('zevent:state', 'https://example.test', zeventStateSchema)).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
  });
});
