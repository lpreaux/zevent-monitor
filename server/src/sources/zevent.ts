import { z } from 'zod';

import { SourceClient, type SourceResponse } from './client.js';

const amountSchema = z.object({
  number: z.number().finite().nonnegative(),
  formatted: z.string(),
});

const streamerSchema = z.object({
  twitch_id: z.string(),
  display: z.string(),
  twitch: z.string(),
  profileUrl: z.string(),
  online: z.boolean(),
  game: z.string(),
  viewersAmount: amountSchema,
  streamlabsId: z.string().nullable(),
  donationUrl: z.url(),
  ref: z.string(),
  donationAmount: amountSchema,
});

export const zeventStateSchema = z.object({
  live: z.array(streamerSchema),
  globalDonationUrl: z.url(),
  streamlabsCampaignId: z.string(),
  donationAmount: amountSchema,
  viewersCount: amountSchema,
  calendar: z.array(z.unknown()),
  marquee: z.unknown().nullable(),
  widgetVersionId: z.number().int(),
  eventSourceDisabled: z.boolean(),
  websiteMode: z.enum(['offline', 'concert', 'online']),
  eventSourceWhitelist: z.array(z.string()),
});

export type ZeventState = z.infer<typeof zeventStateSchema>;

export class ZeventSource {
  constructor(
    private readonly client: SourceClient,
    private readonly baseUrl = 'https://zevent.fr/api/',
  ) {}

  getState(): Promise<SourceResponse<ZeventState>> {
    return this.client.get('zevent:state', this.baseUrl, zeventStateSchema);
  }
}
