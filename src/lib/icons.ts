import type Ionicons from '@expo/vector-icons/Ionicons';

export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Lexique des icônes : une action, une icône, partout.
 *
 * Le tableau existe parce que la même intention finissait par se dessiner de deux façons
 * selon l'écran — le partage en `share-social-outline` dans la barre de résumé et en
 * `share-outline` sur la fiche d'un streamer, les réglages en cloche sur l'accueil et en
 * curseurs sur les récaps. Un lecteur ne compare pas deux écrans côte à côte : il apprend
 * un dessin, et une seconde icône pour le même geste lui coûte un apprentissage de plus.
 *
 * Écrire `icons.share` plutôt que la chaîne rend le choix révocable en un seul endroit.
 */
export const icons = {
  /** Publier un objet (carte, fiche, récap, cagnotte) hors de l'application. */
  share: 'share-outline',
  /** Régler ce que la page affiche. Toujours la même, quelle que soit la page. */
  settings: 'options-outline',
  account: 'person-circle-outline',
  /** Écran secondaire (AlwaysOn). */
  alwaysOn: 'tv-outline',
  favoriteOn: 'star',
  favoriteOff: 'star-outline',
  /** Donner : le cœur ne sert qu'à ça, jamais à « aimer ». */
  donate: 'heart',
  /** Ouvrir un direct ; `channel` quand la chaîne est éteinte et qu'il n'y a rien à lire. */
  watch: 'play',
  channel: 'logo-twitch',
  notificationsOn: 'notifications',
  notificationsOff: 'notifications-outline',
  /** Déplier sur place, par opposition à `forward` qui envoie ailleurs. */
  expand: 'chevron-down',
  collapse: 'chevron-up',
  forward: 'chevron-forward',
  back: 'chevron-back',
  close: 'close',
  add: 'add',
  search: 'search',
  time: 'time-outline',
  /** Agrandir un graphe ou un tableau en plein écran. */
  fullscreen: 'expand',
} as const satisfies Record<string, IconName>;

/**
 * Échelle des tailles d'icône. Elles allaient de 11 à 24 sans palier, ce qui faisait que
 * deux icônes voisines de deux pixels d'écart se lisaient comme une erreur plutôt que
 * comme une hiérarchie. Cinq crans suffisent, chacun attaché à un contexte.
 */
export const iconSizes = {
  /** Posée dans une phrase, à hauteur de x. */
  text: 12,
  /** Bout de ligne, pastille de filtre. */
  row: 14,
  /** Dans un bouton, à côté de son libellé. */
  button: 16,
  /** Bouton-icône de la barre du haut. */
  header: 20,
  /** Onglet du menu du bas. */
  tab: 22,
} as const;

/**
 * Correction optique, en fraction de la taille de l'icône, appliquée par `IconButton`
 * quand le glyphe est seul dans un cadre.
 *
 * Elle ne rattrape pas un défaut de la police : les vingt-cinq glyphes du lexique ont été
 * mesurés au canvas, et l'écart entre le centre de leur encre et le centre de leur chasse
 * ne dépasse jamais un cinquième de pixel à 20 px. Ionicons est bien dessinée, et centrer
 * un glyphe sur son cadre suffit presque partout.
 *
 * Ce qu'elle rattrape est ailleurs : le centre géométrique d'un triangle n'est pas son
 * centre perçu. Le « play » a beau avoir sa boîte centrée, sa masse se concentre vers la
 * pointe opposée à l'angle droit — son barycentre tombe au tiers de la largeur —, et sans
 * un décalage vers la droite il paraît collé au bord gauche du rond.
 *
 * La valeur est une fraction, non un nombre de pixels : la même icône se dessine à 16 px
 * dans une ligne et à 20 px dans la barre du haut, et une correction figée à 1,5 px, juste
 * à la première taille, ne l'est plus à la seconde.
 *
 * 0,082 est le décalage mesuré, non estimé : le glyphe a été rendu à 400 px sur un canvas
 * et son barycentre calculé en pondérant chaque pixel par son opacité. Raisonner sur un
 * triangle idéal donnait 0,109 et sur-corrigeait d'un tiers — le « play » d'Ionicons a les
 * coins arrondis, ce qui ramène sa masse vers le centre. Refaire la mesure sur un autre
 * glyphe est le seul moyen honnête d'y ajouter une entrée.
 *
 * Si le décalage paraît encore trop fort à l'usage, la valeur à essayer ensuite est la
 * demi-correction, 0,041 : l'œil ne pondère pas seulement par l'aire, il tient aussi
 * compte de la boîte, et le centre perçu tombe quelque part entre les deux.
 *
 * Le tableau ne contient que ce qui a été vérifié à l'œil. Y ajouter une entrée au jugé
 * décalerait un glyphe déjà juste — la mesure ci-dessus dit qu'ils le sont presque tous.
 */
export const ICON_NUDGE: Partial<Record<IconName, { x?: number; y?: number }>> = {
  play: { x: 0.082 },
};
