import { z } from 'zod';

import { LastValidCache } from './cache.js';

export type SourceResponse<T> = {
  data: T;
  fetchedAt: string;
  stale: boolean;
  error?: string;
};

export class SourceUnavailableError extends Error {
  constructor(
    readonly source: string,
    options?: ErrorOptions,
  ) {
    super(`Source ${source} is unavailable and has no valid cached value`, options);
    this.name = 'SourceUnavailableError';
  }
}

type SourceClientOptions = {
  fetch?: typeof fetch;
  cache?: LastValidCache;
  timeoutMs?: number;
  now?: () => Date;
};

export class SourceClient {
  readonly #fetch: typeof fetch;
  readonly #cache: LastValidCache;
  readonly #timeoutMs: number;
  readonly #now: () => Date;

  constructor(options: SourceClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#cache = options.cache ?? new LastValidCache();
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#now = options.now ?? (() => new Date());
  }

  async get<T>(key: string, url: URL | string, schema: z.ZodType<T>): Promise<SourceResponse<T>> {
    try {
      const response = await this.#fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'zevent-monitor/0.1' },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = schema.parse(await response.json());
      const fetchedAt = this.#now().toISOString();
      this.#cache.set(key, { data, fetchedAt });
      return { data, fetchedAt, stale: false };
    } catch (cause) {
      const cached = this.#cache.get<T>(key);
      if (cached) {
        return {
          ...cached,
          stale: true,
          error: cause instanceof Error ? cause.message : 'Unknown source error',
        };
      }

      throw new SourceUnavailableError(key, { cause });
    }
  }
}
