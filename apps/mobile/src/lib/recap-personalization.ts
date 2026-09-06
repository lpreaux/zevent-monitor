import type { Recap, RecapContent, RecapProgression } from '@/api/recaps';

/**
 * Le serveur produit un contenu identique pour tout le monde : c'est ici, à l'affichage,
 * que le récap devient personnel en remontant ce qui concerne les favoris de l'appareil.
 */
export interface PersonalizedRecap {
  /** Progressions des favoris sur la période, du plus gros au plus petit. */
  favoriteProgressions: RecapProgression[];
  /** Favoris passés en live pendant la période, dédoublonnés. */
  favoriteLiveStarts: { twitch: string; display: string; occurredAt: string }[];
  favoriteGoals: RecapContent['goalsReached'];
  favoriteDonations: RecapContent['bigDonations'];
  /** Top général, favoris exclus pour éviter de les afficher deux fois. */
  otherProgressions: RecapProgression[];
  /** `true` dès qu'au moins une section personnalisée a du contenu. */
  hasFavoriteContent: boolean;
}

const TOP_OTHERS = 5;

/** Toutes les progressions connues, en repassant sur `topProgressions` pour les récaps v1. */
export function allProgressions(content: RecapContent): RecapProgression[] {
  return content.progressions?.length ? content.progressions : content.topProgressions;
}

export function personalizeRecap(
  content: RecapContent,
  favorites: readonly string[],
): PersonalizedRecap {
  const logins = new Set(favorites.map((twitch) => twitch.toLowerCase()));
  const isFavorite = (twitch: string | null | undefined): boolean =>
    Boolean(twitch) && logins.has(String(twitch).toLowerCase());

  const progressions = allProgressions(content);
  const favoriteProgressions = progressions.filter((item) => isFavorite(item.twitch));

  // Un favori peut couper puis relancer son live : on ne garde que le premier démarrage.
  const seen = new Set<string>();
  const favoriteLiveStarts = content.liveStarts.filter((item) => {
    if (!isFavorite(item.twitch) || seen.has(item.twitch)) return false;
    seen.add(item.twitch);
    return true;
  });

  const favoriteGoals = content.goalsReached.filter((item) => isFavorite(item.twitch));
  const favoriteDonations = content.bigDonations.filter((item) => isFavorite(item.twitch));

  return {
    favoriteProgressions,
    favoriteLiveStarts,
    favoriteGoals,
    favoriteDonations,
    otherProgressions: progressions
      .filter((item) => !isFavorite(item.twitch))
      .slice(0, TOP_OTHERS),
    hasFavoriteContent:
      favoriteProgressions.length > 0 ||
      favoriteLiveStarts.length > 0 ||
      favoriteGoals.length > 0 ||
      favoriteDonations.length > 0,
  };
}

const time = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Avertissement quand la collecte ne couvre pas toute la période demandée : sans lui,
 * un cumul calculé sur une fraction de la plage passerait pour le total réel.
 */
export function coverageNotice(recap: Recap): string | null {
  const coverage = recap.content.summary.coverage;
  if (!coverage || coverage.complete) return null;
  if (!coverage.start) return 'Aucune donnée collectée sur cette période : le cumul affiché est nul.';
  return `Données disponibles à partir du ${time.format(new Date(coverage.start))} seulement : le cumul ne couvre pas toute la période.`;
}
