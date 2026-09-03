/** Formatage partagé (montants, viewers, fraîcheur des sources) en conventions françaises. */

const NBSP = ' ';

/** Regroupe les milliers avec une espace fine insécable, sans dépendre d'Intl. */
function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += NBSP;
    out += digits[i];
  }
  return out;
}

/** Montant en euros, arrondi à l'unité : `1 234 567 €`. */
export function formatEuros(value: number): string {
  if (!Number.isFinite(value)) return `—${NBSP}€`;
  const rounded = Math.round(Math.max(value, 0));
  return `${groupThousands(String(rounded))}${NBSP}€`;
}

/** Nombre entier lisible : `12 345`. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return groupThousands(String(Math.round(Math.max(value, 0))));
}

/** Fraîcheur d'une donnée horodatée, ex. « il y a 12 s », « il y a 3 min ». */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'date inconnue';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'date inconnue';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `il y a ${seconds}${NBSP}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}${NBSP}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours}${NBSP}h`;
  const days = Math.round(hours / 24);
  return `il y a ${days}${NBSP}j`;
}

/** Deep link Twitch natif avec repli web. */
export function twitchLinks(login: string): { app: string; web: string } {
  const clean = login.trim().toLowerCase();
  return { app: `twitch://stream/${clean}`, web: `https://www.twitch.tv/${clean}` };
}
