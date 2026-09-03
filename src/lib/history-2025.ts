/**
 * Courbe de collecte ZEvent 2025 figée dans l'app (src/content/history/zevent-2025.json),
 * importée une fois depuis le cache communautaire EvenMoreStats/InGDoc. Sert de référence
 * pour la superposition 2025/2026. Chargée paresseusement pour ne pas peser au démarrage.
 */

export interface HistoryProvenance {
  provider: string;
  eventId: string;
  url: string;
  fetchedAt: string;
  sha256: string;
  note: string;
}

export interface History2025 {
  provenance: HistoryProvenance;
  /** Total retenu (cf. `amountRaisedCentsAtLastSample` du snapshot), en euros. */
  finalEur: number;
  /** Points bruts horodatés (ms epoch) en euros, pas de 10 min. */
  points: { t: number; eur: number }[];
}

interface RawHistory {
  provenance: HistoryProvenance;
  amountRaisedCentsAtLastSample: number;
  series: { all: { labels: number[]; valuesEur: number[] } };
}

let cached: History2025 | null = null;

export function loadHistory2025(): History2025 {
  if (cached) return cached;
  const raw = require('@/content/history/zevent-2025.json') as RawHistory;
  const { labels, valuesEur } = raw.series.all;
  cached = {
    provenance: raw.provenance,
    finalEur: raw.amountRaisedCentsAtLastSample / 100,
    points: labels.map((t, i) => ({ t, eur: valuesEur[i] ?? 0 })),
  };
  return cached;
}
