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

/**
 * Don du feed `teams/{id}/donations`. Observé sur l'édition 2026 :
 * - `converted_amount` est en centimes dans la devise de la team (EUR) ;
 * - `comment` est un objet `{ id, text }` (ou `null`), pas une chaîne ;
 * - `country` est un nom anglais (« France », « United Kingdom »), renseigné avec un délai
 *   après le don (les plus récents sont `null`) ;
 * - `z_event_name` est le pseudo Twitch **du donateur** saisi sur le formulaire ZEvent, pas
 *   le streamer soutenu : celui-ci est le `member` de l'enveloppe.
 */
const donationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  display_name: z.string(),
  converted_amount: numericValue,
  comment: z.union([z.string(), z.object({ text: z.string().nullable().optional() })]).nullable().optional(),
  country: z.string().nullable().optional(),
  created_at: z.string(),
  z_event_name: z.object({ twitch_display_name: z.string().nullable().optional() }).nullable().optional(),
});

/** Streamer soutenu : `member.id` est l'identifiant `streamlabsId` exposé par l'API ZEvent. */
const donationMemberSchema = z.object({
  id: z.union([z.string(), z.number()]),
  user: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      display_name: z.string().optional(),
      slug: z.string().optional(),
    })
    .optional(),
});

/** Enveloppe réelle du feed : `{ id, donation, member }`. */
const donationEnvelopeSchema = z.object({
  id: z.union([z.string(), z.number()]),
  donation: donationSchema,
  member: donationMemberSchema.nullable().optional(),
});

/** Un élément du feed : enveloppe (format observé en 2026) ou don à plat (ancien format). */
const donationEntrySchema = z.union([donationEnvelopeSchema, donationSchema]);

export const streamlabsDonationsSchema = z.union([
  z.array(donationEntrySchema),
  z.object({ data: z.array(donationEntrySchema) }),
]);

export type StreamlabsTeam = z.infer<typeof streamlabsTeamSchema>;
export type StreamlabsMembers = z.infer<typeof streamlabsMembersSchema>;
export type StreamlabsDonation = z.infer<typeof donationSchema>;
export type StreamlabsDonationMember = z.infer<typeof donationMemberSchema>;
export type StreamlabsDonationEntry = z.infer<typeof donationEntrySchema>;
export type StreamlabsDonations = z.infer<typeof streamlabsDonationsSchema>;

/** Nombre de dons renvoyés par page par le feed Streamlabs (constaté, non paramétrable). */
export const STREAMLABS_FEED_PAGE_SIZE = 3000;

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

  /**
   * Les 3000 derniers dons de la team. Sans `order=desc`, Streamlabs renvoie les 3000 dons
   * les plus **anciens** de la campagne, inutilisables pour un feed en direct.
   */
  getDonations(teamId: string): Promise<SourceResponse<StreamlabsDonations>> {
    const url = new URL(`teams/${teamId}/donations`, this.baseUrl);
    url.searchParams.set('order', 'desc');
    return this.client.get(`streamlabs:donations:${teamId}`, url, streamlabsDonationsSchema);
  }
}
