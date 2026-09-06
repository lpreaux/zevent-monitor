import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getOrCreateRecapContent } from '../recaps/content-cache.js';
import { buildRecapDays, type RecapDay } from '../recaps/days.js';
import {
  generateRecapContent,
  type RecapContent,
  type RecapProgression,
} from '../recaps/generator.js';
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

/**
 * Progressions jointes à l'aperçu, pour que la carte d'une journée puisse dire ce qu'elle
 * contient sur les streamers suivis. Le classement complet vit dans le contenu ; ici on
 * n'emporte que de quoi reconnaître des favoris, sans faire descendre toute la liste.
 */
const MAX_PREVIEW_PROGRESSIONS = 50;

export type RecapDayPreview = {
  raisedCents: number;
  endCents: number | null;
  peakViewers: number;
  shareOfTotal: number | null;
  counts: RecapContent['counts'];
  /** Cagnotte au fil de la journée, sous-échantillonnée. */
  points: number[];
  /** Têtes de classement de la journée, dans lesquelles l'app cherche ses favoris. */
  progressions: RecapProgression[];
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

/**
 * La journée qui précède, réduite à ce qu'il faut pour situer celle qu'on lit.
 *
 * « 4,2 M€ » ne dit rien seul : c'est beaucoup ou peu selon la veille. La comparaison la
 * plus juste est celle de la journée précédente, à découpage identique — comparer une
 * journée entière à une demi-journée d'ouverture n'aurait aucun sens, et c'est pourquoi
 * une tranche d'ouverture ne sert jamais de référence.
 */
export type RecapDayNeighbour = { title: string; raisedCents: number };

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

/**
 * Deux journées se comparent-elles ?
 *
 * Seulement à durées voisines. Une journée pleine face à une tranche d'ouverture de
 * quinze heures, ou face à un dimanche entamé depuis trois heures, produirait un écart
 * qui ne mesure que la différence de longueur — et se lirait pourtant comme un
 * essoufflement de la collecte.
 */
export function comparableDurations(a: RecapDay, b: RecapDay, tolerance = 0.1): boolean {
  const spanA = a.periodEnd.getTime() - a.periodStart.getTime();
  const spanB = b.periodEnd.getTime() - b.periodStart.getTime();
  if (spanA <= 0 || spanB <= 0) return false;
  return Math.abs(spanA - spanB) / Math.max(spanA, spanB) <= tolerance;
}

export function toPreview(content: RecapContent): RecapDayPreview {
  return {
    raisedCents: content.summary.raisedCents,
    endCents: content.summary.endCents,
    peakViewers: content.summary.peakViewers,
    shareOfTotal: content.summary.shareOfTotal ?? null,
    counts: content.counts,
    points: sparkline(content.series?.points ?? []),
    progressions: (content.progressions ?? []).slice(0, MAX_PREVIEW_PROGRESSIONS),
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

  /** La veille, quand sa durée autorise la comparaison. */
  const neighbourOf = async (
    days: readonly RecapDay[],
    index: number,
  ): Promise<RecapDayNeighbour | null> => {
    const day = days[index];
    const previous = days[index - 1];
    if (!day || !previous || !comparableDurations(day, previous)) return null;
    const content = await contentOf(previous);
    return { title: previous.title, raisedCents: content.summary.raisedCents };
  };

  app.get('/v1/recap-days', async () =>
    cache.get('days:list', LIST_TTL_MS, async () => {
      const { first, last } = await bounds();
      const days = buildRecapDays(first, last);
      const previews = await Promise.all(days.map(async (day) => toPreview(await contentOf(day))));
      return {
        days: days.map((day, index) => ({
          ...toDto(day),
          preview: previews[index]!,
          // La liste connaît déjà toutes les journées : la veille se lit sur place.
          previous:
            index > 0 && comparableDurations(day, days[index - 1]!)
              ? { title: days[index - 1]!.title, raisedCents: previews[index - 1]!.raisedCents }
              : null,
        })),
      };
    }),
  );

  app.get('/v1/recap-days/:key', async (request, reply) => {
    const parsed = keyParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_key' });
    const { first, last } = await bounds();
    const days = buildRecapDays(first, last);
    const index = days.findIndex((item) => item.key === parsed.data.key);
    if (index < 0) return reply.code(404).send({ error: 'recap_day_not_found' });

    return {
      ...toDto(days[index]!),
      generatedAt: new Date().toISOString(),
      previous: await neighbourOf(days, index),
      content: await contentOf(days[index]!),
    };
  });
}
