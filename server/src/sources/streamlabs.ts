import { z } from 'zod';

import { SourceClient, type SourceResponse } from './client.js';

const numericValue = z.union([z.number(), z.string()]);

export const streamlabsTeamSchema = z.object({
  id: z.union([z.string(), z.number()]),
  slug: z.string(),
  display_name: z.string().optional(),
  amount_raised: numericValue,
  campaign_id: z.union([z.string(), z.number()]).optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

const memberSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  slug: z.string(),
  is_live: z.boolean(),
  user: z.object({ display_name: z.string() }),
  livestream: z.object({ viewers: numericValue.optional() }).nullable().optional(),
  platforms: z.object({ twitch: z.unknown().nullable().optional() }).optional(),
});

export const streamlabsMembersSchema = z.object({
  data: z.array(memberSchema),
  current_page: z.number().int().positive().optional(),
  last_page: z.number().int().positive().optional(),
  total: z.number().int().nonnegative().optional(),
});

const donationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  display_name: z.string(),
  converted_amount: numericValue,
  comment: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  created_at: z.string(),
  z_event_name: z.object({ twitch_display_name: z.string().nullable().optional() }).nullable().optional(),
});

export const streamlabsDonationsSchema = z.union([
  z.array(donationSchema),
  z.object({ data: z.array(donationSchema) }),
]);

export type StreamlabsTeam = z.infer<typeof streamlabsTeamSchema>;
export type StreamlabsMembers = z.infer<typeof streamlabsMembersSchema>;
export type StreamlabsDonations = z.infer<typeof streamlabsDonationsSchema>;

export class StreamlabsSource {
  constructor(
    private readonly client: SourceClient,
    private readonly baseUrl = 'https://streamlabscharity.com/api/v1/',
  ) {}

  getTeam(teamPath: string): Promise<SourceResponse<StreamlabsTeam>> {
    return this.client.get(`streamlabs:team:${teamPath}`, new URL(`teams/${teamPath}`, this.baseUrl), streamlabsTeamSchema);
  }

  getMembers(teamId: string, page = 1): Promise<SourceResponse<StreamlabsMembers>> {
    const url = new URL(`teams/${teamId}/members`, this.baseUrl);
    url.searchParams.set('page', String(page));
    return this.client.get(`streamlabs:members:${teamId}:${page}`, url, streamlabsMembersSchema);
  }

  getDonations(teamId: string): Promise<SourceResponse<StreamlabsDonations>> {
    return this.client.get(`streamlabs:donations:${teamId}`, new URL(`teams/${teamId}/donations`, this.baseUrl), streamlabsDonationsSchema);
  }
}
