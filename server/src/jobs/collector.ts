import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import { SourceClient, ZeventSource, type ZeventState } from '../sources/index.js';

type LastSample = { sampledAt: Date; donationCents: number; viewers: number; websiteMode: string };

export class Collector {
  readonly #source: ZeventSource;
  #timer?: NodeJS.Timeout;
  #running = false;
  #last?: LastSample;

  constructor(private readonly app: FastifyInstance, private readonly config: AppConfig) {
    this.#source = new ZeventSource(new SourceClient());
  }

  async start(): Promise<void> {
    const latest = await this.app.pg.query<{
      sampled_at: Date; donation_cents: string; viewers: number; website_mode: string;
    }>('SELECT sampled_at, donation_cents, viewers, website_mode FROM samples WHERE edition = 2026 ORDER BY sampled_at DESC LIMIT 1');
    const row = latest.rows[0];
    if (row) {
      this.#last = {
        sampledAt: new Date(row.sampled_at), donationCents: Number(row.donation_cents),
        viewers: row.viewers, websiteMode: row.website_mode,
      };
    }
    await this.collect();
    this.#timer = setInterval(() => void this.collect(), this.config.COLLECT_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async collect(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const result = await this.#source.getState();
      const now = new Date();
      const state = result.data;
      if (!this.#shouldPersist(state, now)) return;
      const donationCents = Math.round(state.donationAmount.number * 100);
      await this.app.pg.query(
        `INSERT INTO samples
          (edition, sampled_at, donation_cents, viewers, website_mode, state, source_fetched_at, source_stale)
         VALUES (2026, $1, $2, $3, $4, $5, $6, $7)`,
        [now, donationCents, state.viewersCount.number, state.websiteMode, state, result.fetchedAt, result.stale],
      );
      this.#last = { sampledAt: now, donationCents, viewers: state.viewersCount.number, websiteMode: state.websiteMode };
      this.app.log.info({ donationCents, viewers: state.viewersCount.number, stale: result.stale }, 'ZEvent sample stored');
    } catch (error) {
      this.app.log.error({ err: error }, 'ZEvent collection failed');
    } finally {
      this.#running = false;
    }
  }

  #shouldPersist(state: ZeventState, now: Date): boolean {
    if (!this.#last) return true;
    return Math.round(state.donationAmount.number * 100) !== this.#last.donationCents
      || state.viewersCount.number !== this.#last.viewers
      || state.websiteMode !== this.#last.websiteMode
      || now.getTime() - this.#last.sampledAt.getTime() >= 60_000;
  }
}
