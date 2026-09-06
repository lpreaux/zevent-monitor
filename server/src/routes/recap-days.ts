import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getOrCreateRecapContent } from '../recaps/content-cache.js';
import { buildRecapDays, type RecapDay } from '../recaps/days.js';
import { generateRecapContent, type RecapContent } from '../recaps/generator.js';
import { TtlCache } from './donations.js';

/**
 * Récaps de journée, la seule ressource de récap qui ne demande pas d'appareil enregistré.
 *
 * Les récaps personnels ne sont lisibles que par l'installation qui les a demandés, ce qui
 * laissait sans rien quiconque ouvre l'application en cours de week-end. Les journées, elles,
 * existent pour tout le monde et depuis le début : elles ne dépendent que de la période, donc
 * du même contenu mutualisé que le reste (`recap_contents`).
 */

const keyParams = z.object({ key: z.string().regex(/^day-\d{4}-\d{2}-\d{2}$/) });

/** Une journée close ne bougera plus ; celle en cours change à chaque relevé. */
const LIST_TTL_MS = 30_000;
const IN_PROGRESS_TTL_MS = 60_000;

/** Valeurs de la vignette de courbe portée par les cartes : une forme, pas un graphe. */
const SPARKLINE_POINTS = 24;

export type RecapDayPreview = {
  raisedCents: number;
  endCents: number | null;
  peakViewers: number;
  shareOfTotal: number | null;
  counts: RecapContent['counts'];
  /** Cagnotte au fil de la journée, sous-échantillonnée. */
  points: number[];
};

export type RecapDayDto = {
  id: string;
  kind: 'day';
  title: string;
  subtitle: string;
  periodStart: string;
  periodEnd: string;
  inProgress: boolean;
};

const toDto = (day: RecapDay): RecapDayDto => ({
  id: day.key,
  kind: 'day',
  title: day.title,
  subtitle: day.subtitle,
  periodStart: day.periodStart.toISOString(),
  periodEnd: day.periodEnd.toISOString(),
  inProgress: day.inProgress,
});

/**
 * Réduit la courbe à quelques valeurs, en gardant toujours la dernière : c'est elle qui
 * porte le total, et une vignette qui s'arrête avant la fin raconte une autre journée.
 */
export function sparkline(points: readonly { cents: number }[], size = SPARKLINE_POINTS): number[] {
  if (size < 2) return points.length > 0 ? [points[points.length - 1]!.cents] : [];
  if (points.length <= size) return points.map((point) => point.cents);
  const step = (points.length - 1) / (size - 1);
  return Array.from({ length: size }, (_, index) =>
    points[Math.round(index * step)]!.cents,
  );
}

export function toPreview(content: RecapContent): RecapDayPreview {
  return {
    raisedCents: content.summary.raisedCents,
    endCents: content.summary.endCents,
    peakViewers: content.summary.peakViewers,
    shareOfTotal: content.summary.shareOfTotal ?? null,
    counts: content.counts,
    points: sparkline(content.series?.points ?? []),
  };
}

export function registerRecapDayRoutes(app: FastifyInstance): void {
  const cache = new TtlCache();

  const bounds = async (): Promise<{ first: Date | null; last: Date | null }> => {
    const result = await app.pg.query<{ first_at: Date | null; last_at: Date | null }>(
      `SELECT min(sampled_at) AS first_at, max(sampled_at) AS last_at
       FROM samples WHERE edition = 2026`,
    );
    const row = result.rows[0];
    return { first: row?.first_at ?? null, last: row?.last_at ?? null };
  };

  /**
   * Une journée close est figée : son contenu est calculé une fois pour toutes et partagé
   * en base. Celle en cours ne peut pas l'être — la mettre en cache par période reviendrait
   * à créer une entrée par minute écoulée — elle passe donc par un cache mémoire court.
   */
  const contentOf = (day: RecapDay): Promise<RecapContent> =>
    day.inProgress
      ? cache.get(`day:${day.key}`, IN_PROGRESS_TTL_MS, () =>
          generateRecapContent(app, day.periodStart, day.periodEnd),
        )
      : getOrCreateRecapContent(app, day.periodStart, day.periodEnd);

  app.get('/v1/recap-days', async () =>
    cache.get('days:list', LIST_TTL_MS, async () => {
      const { first, last } = await bounds();
      return {
        days: await Promise.all(
          buildRecapDays(first, last).map(async (day) => ({
            ...toDto(day),
            preview: toPreview(await contentOf(day)),
          })),
        ),
      };
    }),
  );

  app.get('/v1/recap-days/:key', async (request, reply) => {
    const parsed = keyParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_key' });
    const { first, last } = await bounds();
    const day = buildRecapDays(first, last).find((item) => item.key === parsed.data.key);
    if (!day) return reply.code(404).send({ error: 'recap_day_not_found' });

    return {
      ...toDto(day),
      generatedAt: new Date().toISOString(),
      content: await contentOf(day),
    };
  });
}
