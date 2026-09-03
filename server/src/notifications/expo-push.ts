import { z } from 'zod';

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

const ticketSchema = z.union([
  z.object({ status: z.literal('ok'), id: z.string() }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    details: z.object({ error: z.string().optional() }).nullable().optional(),
  }),
]);

const sendResponseSchema = z.object({ data: z.array(ticketSchema) });

const receiptSchema = z.union([
  z.object({ status: z.literal('ok') }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    details: z.object({ error: z.string().optional() }).nullable().optional(),
  }),
]);

const receiptsResponseSchema = z.object({ data: z.record(z.string(), receiptSchema) });

export type ExpoPushTicket = z.infer<typeof ticketSchema>;
export type ExpoPushReceipt = z.infer<typeof receiptSchema>;

/** Erreurs Expo qui signifient que le token ne doit plus être utilisé. */
export function isUnrecoverableTokenError(error: string | undefined): boolean {
  return error === 'DeviceNotRegistered' || error === 'InvalidCredentials';
}

/** Expo n'accepte que 100 messages (et 1000 identifiants de reçu) par requête. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

type ExpoPushClientOptions = {
  accessToken?: string | undefined;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

/**
 * Client minimal de l'Expo Push Service. Aucun token push ni commentaire de don
 * n'est journalisé ici : l'appelant ne reçoit que des tickets et des reçus (cf. PLAN.md §3.2).
 */
export class ExpoPushClient {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #accessToken: string | undefined;

  constructor(options: ExpoPushClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.baseUrl ?? 'https://exp.host/--/api/v2/push/';
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#accessToken = options.accessToken;
  }

  async #post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const response = await this.#fetch(new URL(path, this.#baseUrl), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.#accessToken ? { authorization: `Bearer ${this.#accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Expo Push a répondu HTTP ${response.status}`);
    }
    return schema.parse(await response.json());
  }

  /** Renvoie un ticket par message, dans le même ordre. */
  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const tickets: ExpoPushTicket[] = [];
    for (const batch of chunk(messages, 100)) {
      const result = await this.#post('send', batch, sendResponseSchema);
      tickets.push(...result.data);
    }
    return tickets;
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    const receipts: Record<string, ExpoPushReceipt> = {};
    for (const batch of chunk(ticketIds, 1000)) {
      const result = await this.#post('getReceipts', { ids: batch }, receiptsResponseSchema);
      Object.assign(receipts, result.data);
    }
    return receipts;
  }
}
