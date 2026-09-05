/**
 * Paliers ronds de la cagnotte globale et estimation d'arrivée.
 *
 * Toute valeur produite ici est une projection au rythme observé : le PLAN impose de
 * l'afficher comme telle (§4 P1). Aucune extrapolation au-delà de `MAX_ETA_MINUTES`,
 * où le rythme d'une heure ne dit plus rien d'utile.
 */

/** Au-delà de deux jours, l'estimation n'a plus de sens : on préfère ne rien annoncer. */
const MAX_ETA_MINUTES = 48 * 60;

/** Pas de palier rond adapté à l'ordre de grandeur de la cagnotte. */
export function milestoneStep(amountEur: number): number {
  if (amountEur >= 1_000_000) return 1_000_000;
  if (amountEur >= 100_000) return 100_000;
  if (amountEur >= 10_000) return 10_000;
  return 1_000;
}

export interface Milestone {
  /** Palier rond visé, en euros. */
  target: number;
  /** Palier rond précédent, origine de la barre de progression. */
  previous: number;
  /** Montant restant à collecter, en euros. */
  remaining: number;
  /** Progression entre `previous` et `target`, dans `[0, 1]`. */
  ratio: number;
}

/** Prochain palier rond au-dessus du montant courant. */
export function nextMilestone(amountEur: number): Milestone | null {
  if (!Number.isFinite(amountEur) || amountEur < 0) return null;
  const step = milestoneStep(amountEur);
  const previous = Math.floor(amountEur / step) * step;
  const target = previous + step;
  const remaining = target - amountEur;
  return { target, previous, remaining, ratio: (amountEur - previous) / step };
}

/**
 * Minutes avant d'atteindre `remaining` euros au rythme `eurPerHour`. `null` quand le
 * rythme est nul, négatif ou trop faible pour produire une estimation crédible.
 */
export function milestoneEtaMinutes(remaining: number, eurPerHour: number | null): number | null {
  if (eurPerHour == null || !Number.isFinite(eurPerHour) || eurPerHour <= 0) return null;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  const minutes = (remaining / eurPerHour) * 60;
  return minutes > MAX_ETA_MINUTES ? null : minutes;
}

/** Estimation lisible : `≈ 25 min`, `≈ 3 h 10`, `≈ 1 j 4 h`. */
export function formatEta(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return '≈ imminent';
  if (total < 60) return `≈ ${total} min`;
  const hours = Math.floor(total / 60);
  if (hours < 24) {
    const rest = total % 60;
    return rest === 0 ? `≈ ${hours} h` : `≈ ${hours} h ${String(rest).padStart(2, '0')}`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `≈ ${days} j` : `≈ ${days} j ${restHours} h`;
}
