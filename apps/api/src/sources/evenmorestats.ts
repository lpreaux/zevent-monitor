import { z } from 'zod';

import { SourceClient, type SourceResponse } from './client.js';

const amountCents = z.number().int().nonnegative();

const goalSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  amount: amountCents,
  category: z.string().nullable().optional(),
  reached: z.boolean().optional(),
  links: z.array(z.unknown()).optional(),
});

export const goalsOverviewSchema = z.union([
  z.array(z.record(z.string(), z.unknown())),
  z.object({ data: z.array(z.record(z.string(), z.unknown())).optional() }),
]);

export const participationGoalsSchema = z.union([
  z.array(goalSchema),
  z.object({ data: z.array(goalSchema) }),
]);

const showParticipantSchema = z
  .object({
    streamer_id: z.string().optional(),
    streamer_name: z.string(),
    profile_url: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    broadcaster: z.boolean().optional(),
    socials: z
      .object({ twitch: z.object({ login: z.string() }).partial().optional() })
      .loose()
      .optional(),
  })
  .loose();

/** Un « show » du planning EvenMoreStats : `GET /events/{eventId}/shows`. */
export const showsSchema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
      schedule: z
        .object({ start: z.string(), end: z.string().nullable().optional() })
        .loose(),
      all_day: z.boolean().optional(),
      participants: z.array(showParticipantSchema).optional(),
    })
    .loose(),
);

export const amountRaisedSchema = z.object({
  amount: amountCents.optional(),
  amount_raised: amountCents.optional(),
  participations: z.array(z.record(z.string(), z.unknown())).optional(),
}).refine((value) => value.amount !== undefined || value.amount_raised !== undefined, {
  message: 'Expected amount or amount_raised',
});

export class EvenMoreStatsSource {
  constructor(
    private readonly client: SourceClient,
    private readonly baseUrl = 'https://api.ppr.evenmorestats.fr/',
  ) {}

  getGoalsOverview(eventId: string): Promise<SourceResponse<z.infer<typeof goalsOverviewSchema>>> {
    return this.client.get(`evenmorestats:overview:${eventId}`, new URL(`events/${eventId}/donation_goals/overview`, this.baseUrl), goalsOverviewSchema);
  }

  getParticipationGoals(participationId: string): Promise<SourceResponse<z.infer<typeof participationGoalsSchema>>> {
    return this.client.get(`evenmorestats:goals:${participationId}`, new URL(`participations/${participationId}/donation_goals`, this.baseUrl), participationGoalsSchema);
  }

  /** Planning des émissions et animations (source communautaire InGDoc/EvenMoreStats). */
  getShows(eventId: string): Promise<SourceResponse<z.infer<typeof showsSchema>>> {
    return this.client.get(`evenmorestats:shows:${eventId}`, new URL(`events/${eventId}/shows`, this.baseUrl), showsSchema);
  }

  getAmountRaised(eventId: string): Promise<SourceResponse<z.infer<typeof amountRaisedSchema>>> {
    const url = new URL('stats/amount_raised', this.baseUrl);
    url.searchParams.set('event_id', eventId);
    return this.client.get(`evenmorestats:amount:${eventId}`, url, amountRaisedSchema);
  }
}
