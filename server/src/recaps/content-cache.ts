import type { FastifyInstance } from 'fastify';

import { generateRecapContent, type RecapContent } from './generator.js';

/**
 * Le contenu d'un récap ne dépend que de la période : deux appareils qui demandent
 * la même plage obtiennent exactement les mêmes faits. On le calcule donc une seule
 * fois et on le partage anonymement via `recap_contents`, la personnalisation
 * (favoris) restant côté application.
 */
export async function getOrCreateRecapContent(
  app: FastifyInstance,
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): Promise<RecapContent> {
  // Une période encore ouverte donnerait un contenu incomplet que le cache figerait.
  if (periodEnd.getTime() > now.getTime()) {
    return generateRecapContent(app, periodStart, periodEnd);
  }

  const cached = await app.pg.query<{ content: RecapContent }>(
    'SELECT content FROM recap_contents WHERE period_start = $1 AND period_end = $2',
    [periodStart, periodEnd],
  );
  const hit = cached.rows[0];
  if (hit) return hit.content;

  const content = await generateRecapContent(app, periodStart, periodEnd);
  await app.pg.query(
    `INSERT INTO recap_contents (period_start, period_end, content) VALUES ($1, $2, $3)
     ON CONFLICT (period_start, period_end) DO NOTHING`,
    [periodStart, periodEnd, content],
  );
  return content;
}

/**
 * Aligne une borne sur la minute : les échantillons sont espacés d'au moins 60 s, et
 * deux demandes manuelles simultanées tombent alors sur la même entrée de cache.
 */
export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}
