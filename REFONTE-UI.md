# Refonte UI — cohérence des composants, châssis et navigation

Document de suivi de la passe de refonte engagée en septembre 2026. Il porte le
diagnostic, les décisions prises et l'état d'avancement des quatre étapes.

Le `PLAN.md` reste la référence fonctionnelle (ce que l'app doit faire) ; ce
document ne traite que de la forme (comment elle le présente).

---

## Diagnostic

### D1. Les boutons : pas de système, que des cas particuliers

Aucun composant `Button` n'existait : chaque bouton était un `Pressable` avec ses
classes écrites sur place. Pour le seul rôle « action principale pleine, violet »,
neuf dessins coexistaient :

| Endroit | Classes |
|---|---|
| `live-summary-bar.tsx` | `rounded-full bg-zevent-500 py-3` |
| `streamer-hero.tsx` | `rounded-full bg-zevent-500 py-2.5` |
| `favorite-highlight-card.tsx` | `rounded-full bg-zevent-500 py-2` |
| `favorites-section.tsx` | `rounded-full bg-zevent-500 px-4 py-2` |
| `planning-focus-card.tsx` | `rounded-full bg-zevent-500 px-3.5 py-2` |
| `screen-state.tsx` | `rounded-full bg-zevent-500 px-5 py-2.5` |
| `recaps.tsx` (FAB) | `rounded-full bg-zevent-500 py-3.5 pl-4 pr-5` |
| `share-actions.tsx` | `rounded-2xl bg-zevent-500 py-3.5` |
| `settings/notifications.tsx` | `rounded-2xl py-3` |

Même dispersion sur le secondaire à contour (4 dessins) et sur le bouton-icône
rond (8 implémentations, de 28 à 40 px, avec des icônes de 11 à 24).

### D2. Centrage des icônes

La correction optique n'existait qu'à un seul endroit — le `play` de
`watch-button.tsx` —, figée à 1,5 px alors que la même icône se dessine à quatre
tailles. Tant qu'elle vit dans un composant feuille, elle ne peut pas être
appliquée ailleurs.

**Ce que la mesure a établi.** Les vingt-cinq glyphes du lexique ont été mesurés au
canvas dans l'aperçu web, à 52 px, en comparant le centre de leur encre au centre
de leur chasse :

| Grandeur | Résultat |
|---|---|
| Écart horizontal | 0,0 px pour 21 glyphes, ±0,5 px pour 4 (`heart`, `person-circle-outline`, `search`, `trash-outline`) — soit ±0,2 px ramené à 20 px |
| Écart vertical | 0,0 à 0,5 px |

Mesuré bouton par bouton dans l'application, l'écart entre le centre du bouton et
le centre de l'encre valait `0,00` partout, sauf `+0,75` sur le bouton de lecture —
c'est-à-dire la correction optique elle-même.

**Ionicons est donc bien dessinée : il n'y a aucun défaut de centrage géométrique**,
et le défaut constaté à l'usage ne vient pas de là. Restent deux causes, toutes deux
invisibles dans un aperçu web :

1. **Le remplissage de police d'Android.** `Ionicons` ne rend qu'un `<Text>` portant
   le glyphe, sans fixer `includeFontPadding`. Android ajoute alors à la boîte les
   montante et descendante déclarées par la police — que Ionicons déclare très
   dissymétriques, **18 contre 3 à 20 px**. La boîte est centrée, le glyphe non : il
   descend. Chrome, lui, compense par le demi-interligne, ce qui explique que
   l'aperçu web ne montre rien.
2. **Le centrage optique.** L'encre peut être centrée sans que la masse perçue le
   soit : le barycentre d'un triangle tombe au tiers de sa largeur, pas au milieu.

**Correction.** Un composant `Icon` unique, par lequel passent `Button` et
`IconButton`, porte les deux : `includeFontPadding: false` sur Android, et un
décalage optique exprimé en **fraction de la taille** plutôt qu'en pixels, appliqué
en translation et non en marge — une marge entre dans la répartition de l'espace
libre par la disposition, si bien que le décalage n'arrivait qu'à moitié à l'écran
(1,5 px demandés, 0,75 px obtenus).

Le rond de lecture des lignes de streamer, signalé à l'usage comme le plus fautif
sur Android, cumulait les deux défauts : il descendait par le remplissage de police,
et sa correction horizontale n'arrivait qu'à moitié — d'autant que son icône est
passée de 13 à 16 px à l'étape 1 pendant que la correction restait figée à 1,5 px.
Le correctif Android a réglé la descente du premier coup.

L'horizontale a demandé deux passes, et la première s'est trompée de méthode. Une
correction de 0,11 avait été déduite d'un triangle idéal à angles vifs ; elle
sur-corrigeait visiblement. Le glyphe a donc été rendu à 400 px sur un canvas et son
barycentre calculé en pondérant chaque pixel par son opacité :

| Grandeur | Fraction de la taille |
|---|---|
| Centre de la boîte d'encre vs centre de chasse | −0,0025 (nul) |
| Barycentre réel vs centre de chasse | **−0,0822** |

Les coins arrondis du glyphe ramènent sa masse vers le centre : la correction entière
vaut **0,082**, et non les 0,109 du triangle idéal. La leçon vaut pour les entrées
suivantes — une correction optique se mesure sur le glyphe, elle ne se déduit pas de
la forme qu'on croit qu'il a.

### D3. Une action, plusieurs icônes

- Partage : `share-social-outline` (barre de résumé, verdict des stats) **vs**
  `share-outline` (fiche streamer, écran récap).
- « Réglages de cette page » : `notifications-outline` sur Accueil et Dons, mais
  `options-outline` sur Récaps.

### D4. Placement des actions

Le partage se prenait en haut à droite sur la carte de verdict, en bas d'une
rangée de quatre sur la fiche streamer, et dans la barre du haut sur l'écran
récap. Trois conventions pour un même geste.

Autre incohérence de rang : en mode réduit de la barre de résumé, « Faire un don »
devenait un rond gris neutre, indistinguable du bouton de densité voisin.

### D5. Le châssis haut : trois couches, la globale au milieu

L'empilement était `AppHeader` (local) → `LiveSummaryBar` (global) →
`ListControls` (local, flottant) → contenu. La lecture alternait local → global →
local, le titre de page se trouvant séparé de ses propres contrôles par ~220 px de
mobilier global. Trois commandes ne servaient qu'à gérer ce mobilier (bouton de
densité, grabber, repli au défilement), et la première ligne de liste démarrait
vers 400 px du haut.

Le bouton AlwaysOn illustrait le malentendu : global (présent sur les six onglets)
mais rendu dans le groupe d'actions de la page, collé au réglage local.

### D6. Navigation

- Six onglets — au-delà de cinq, les libellés en `text-[10px]` deviennent la seule
  chose qui distingue les icônes.
- `/favorites` fait doublon avec l'onglet Streamers, qui porte déjà une bascule
  `scope: 'favorites'` : deux écrans, une fonction, ~200 lignes dupliquées.
- Pas de hub Réglages : `settings/notifications` et `settings/recaps` sont deux
  feuilles atteignables depuis deux onglets différents et qui se renvoient l'une à
  l'autre. Le compte n'est atteignable que depuis l'Accueil.
- Stats et Récaps répondent tous deux à « qu'est-ce qui s'est passé ».

---

## Décisions

### Le socle : les informations globales s'accrochent au-dessus de la navbar

Plutôt que de remonter le global tout en haut, il descend en bas, soudé à la barre
d'onglets sur la même surface. Le haut de l'écran redevient purement local — titre
de page collé à ses contrôles, collés au contenu.

Deux raisons s'ajoutent à la lecture :

- **La zone du pouce.** Faire un don, partager la cagnotte et la poignée sont les
  commandes les plus fréquentes de l'app ; en haut d'un écran de 6,5 pouces, elles
  sont hors d'atteinte à une main.
- **La poignée retrouve son sens.** Une poignée en bas d'une barre accrochée en
  haut est à l'envers ; en haut d'un bloc accroché en bas, c'est une poignée de
  feuille, et « tirer vers le haut pour déplier » se devine.

Le socle se lit donc : poignée / ligne globale / navbar, comme une seule pièce de
mobilier. Le dépliage y loge le détail actuel du mode confort (grand montant,
métriques, faits du planning), atteignable depuis n'importe quel écran.

C'est ce qui départage le socle de la première piste envisagée — remonter le
global tout en haut. Celle-ci obligeait à recréer sur l'Accueil une carte de
cagnotte que l'écran n'a jamais eue : la cagnotte n'y vit que dans le mobilier, le
contenu se limitant au marquee, aux favoris et au momentum. Le socle garde le
détail à un geste depuis les six onglets, et l'Accueil n'a rien à recevoir.

### La règle des actions : global en bas, local en haut

- **Socle (bas)** : cagnotte, Faire un don, partage de la cagnotte, et le menu des
  actions d'application (Compte, Notifications, Écran secondaire, À propos).
- **En-tête de page (haut)** : une action au maximum, toujours la même —
  `options-outline`, « réglages de cette page » — menant à la bonne section du hub
  Réglages.

Ce qui fait passer les en-têtes de dix boutons ronds répartis sur six écrans à
trois boutons nus.

### Navigation cible

`Accueil · Streamers · Dons · Planning · Bilan`, où **Bilan** fusionne Stats et
Récaps en deux volets d'un `Segmented`. Les deux répondent à la même question, et
Récaps est vide hors événement — ce qui laissait un onglet mort la moitié du temps.

`/favorites` est supprimé au profit de `/(tabs)/streamers?scope=favorites`.
`/settings` est créé comme hub.

---

## Étapes

### Étape 1 — Le système de boutons  ▸ faite

Créer `src/components/ui/` et `src/lib/icons.ts`, puis migrer tous les appels.
Aucun changement de structure : c'est la fondation des étapes suivantes.

**`Button`** — variantes × tailles, plus rien d'écrit sur place.

| Variante | Usage |
|---|---|
| `primary` | l'action qui engage (Faire un don, Générer, Partager l'image) |
| `secondary` | alternative de même rang (Texte, Faire un don sur une fiche) |
| `neutral` | action de service (Gérer mes favoris, Déplier, Revenir à maintenant) |

Tailles `sm` / `md` / `lg` figées, une seule paire padding + police par taille.

**Règle de rayon** : pill (`rounded-full`) pour tout bouton posé dans une rangée à
côté d'autre chose ; `rounded-2xl` pour un bouton-bloc qui prend toute la largeur.

**`IconButton`** — trois variantes :

| Variante | Usage |
|---|---|
| `bare` | icône seule, ni fond ni bordure — barre du haut, actions de carte |
| `soft` | cercle discret — sur fond dense ou par-dessus un visuel |
| `accent` | cercle teinté violet — action à rang de CTA compacte (`WatchButton`) |

Deux tailles : `sm` 32 px / icône 16, `md` 40 px / icône 20 ; `hitSlop` calculé
pour atteindre 44 px dans les deux cas.

**Le centrage est traité là, une fois** : `Icon` (`src/components/ui/icon.tsx`) est
le seul rendu de glyphe de l'application. Il porte le rattrapage Android et la table
`ICON_NUDGE`, ce qui remonte dans le système la correction qui ne vivait que dans
`watch-button` — et la rend proportionnelle à la taille. Voir D2 pour la mesure qui
a conduit à ne garder qu'une seule entrée dans la table.

**Échelle des tailles d'icône** : 12 (dans du texte), 14 (chips et lignes),
16 (boutons), 20 (barre du haut), 22 (onglets).

**Lexique — une action, une icône** (`src/lib/icons.ts`) :

| Action | Icône | À corriger |
|---|---|---|
| Partager | `share-outline` | remplace les 3 `share-social-outline` |
| Réglages de cette page | `options-outline` | remplace `notifications-outline` sur Accueil + Dons |
| Compte | `person-circle-outline` | — |
| Écran secondaire | `tv-outline` | — |
| Suivre | `star` / `star-outline` | — |
| Donner | `heart` | — |
| Regarder | `play` (`logo-twitch` hors ligne) | — |
| Déplier / Replier | `chevron-down` / `chevron-up` | — |
| Aller plus loin | `chevron-forward` | — |
| Fermer / Retour | `close` / `chevron-back` | — |

#### Ce que l'étape a effectivement changé

`src/components/ui/button.tsx`, `src/components/ui/icon-button.tsx` et
`src/lib/icons.ts` créés ; 29 fichiers migrés, 436 lignes retirées pour 350
ajoutées. Plus aucun `bg-zevent-500` porteur de padding hors du système, plus aucun
cercle de bouton-icône écrit sur place, plus qu'une icône de partage.

Changements visibles qui dépassent la simple mécanique, et qui méritent d'être
regardés à l'écran :

- **La barre du haut perd ses cercles.** Ses boutons passent en `bare`. C'est le
  « aérer un peu » demandé, et cela prépare l'étape 3, où l'en-tête ne portera plus
  qu'une action.
- **`DisclosureButton` passe au gris.** Déplier et sortir d'une section étaient tous
  deux violets ; le gris du rang `neutral` réserve désormais le violet à ce qui mène
  ailleurs (`SectionLink`).
- **Le don garde sa couleur dans la barre réduite.** Il y devenait un rond gris,
  indistinguable du bouton de densité voisin ; il passe en `accent`.
- **Trois boutons pleine largeur adoucissent leur rayon** (paliers d'un streamer,
  chaîne d'un streamer inconnu, activation des notifications) et **les deux boutons
  de partage prennent la pastille**, par application de la règle de forme.
- **La cloche des réglages devient l'icône de réglages** sur l'Accueil et sur Dons.
- **`loading` remplace les états d'attente bricolés** (feuille de récap, compte,
  notifications) : roue à la place de l'icône, bouton inerte.

Volontairement laissé de côté :

- **`FavoriteButton` et `ReminderBell`** restent des bascules d'icône posées dans le
  fil d'une ligne, sans cadre. Les faire passer par `IconButton` leur donnerait une
  boîte de 32 px au milieu de lignes déjà denses, et l'ambre du favori sort des deux
  tons du système. Leurs tailles sont alignées sur l'échelle.
- **Les boutons de connexion** (`sign-in`) gardent leur dessin : un bouton Google
  blanc est imposé par la marque, il n'a rien à faire dans les trois rangs.
- **Les commandes de l'écran AlwaysOn** ont leur propre langage — écran de loin,
  mode kiosque, gradation. Elles ne relèvent pas du système de l'application.
- **Le bouton « Maintenant » du planning** garde son rouge : la question de la
  couleur relève de l'étape 2.

### Étape 2 — Le placement des actions  ▸ faite

Règle unique, sur une carte comme sur un écran :

> **Haut-droite** = ce qu'on fait *de* l'objet (suivre, partager, envoyer sur
> l'écran secondaire), en `IconButton bare`.
> **Bas** = ce qu'on fait *avec* l'objet, un ou deux CTA au maximum.

`stats-verdict` et `recap/[id]` étaient déjà conformes — le premier prend son
partage en haut de sa propre carte, le second dans la barre du haut.

#### Ce que l'étape a effectivement changé

**`streamer-hero` applique la règle.** `tv-outline` et `share-outline` remontent en
haut à droite à côté de l'étoile ; la rangée du bas passe de « deux boutons pleins +
deux ronds » à deux boutons de largeur égale. Elle annonçait quatre choses de même
rang là où il n'y en a que deux : regarder et donner.

Les trois glyphes du groupe du haut se dessinent désormais à la même taille (16), et
l'étoile complète son `hitSlop` jusqu'aux 44 px comme le fait `IconButton` — figé à
10, il lui laissait une cible de 36 px à cette taille. Les deux étoiles des listes de
streamers passent au passage sur l'échelle (20 et 16, contre 20 et 18).

**Le rouge est tranché, et écrit dans `src/theme.ts`.** Il a trois emplois, qui ne se
confondent pas parce qu'ils ne portent jamais sur le même objet : le direct, l'écart
négatif face à 2025, et l'erreur. Le diagnostic n'en voyait que deux — l'écart négatif
manquait à l'appel alors qu'il occupe cinq fichiers.

Ce qui n'entre dans aucun des trois quitte la couleur : **le bouton « Maintenant » du
planning** perd son rouge. Il partage son ancre bas-droite avec le « Nouveau récap »
de l'onglet voisin, qui est violet parce qu'il crée quelque chose ; lui ne crée rien,
il replace le fil où il était. Il devient un `Button` du système, ce qu'il n'était pas
— c'était le dernier `Pressable` à classes écrites sur place hors des exceptions
assumées de l'étape 1.

**Nouvelle variante `overlay` sur `Button`**, jumelle de celle d'`IconButton` : le
rang `neutral` posé par-dessus du contenu qui défile, où un fond à cinq pour cent de
blanc laisse passer les lignes de la liste et fait changer le libellé de contraste à
chaque geste.

**`TONE_TEXT`, `TONE_COLOR` et `toneOf` rejoignent `src/theme.ts`.** Les trois classes
de l'écart chiffré étaient réécrites dans cinq fichiers — verdict, rythme, paliers,
momentum, carte de partage —, et avaient déjà divergé : le cas neutre en `gray-400`
d'un côté, `gray-300` de l'autre. `VerdictTone` disparaît au profit de `Tone`, qui
porte le même vocabulaire pour tout le monde.

Volontairement laissé de côté :

- **Les couleurs d'icône de `Button` et `IconButton`** restent des constantes locales
  plutôt que des jetons de `theme`. Deux des six y figurent déjà, les autres non :
  n'en router que la moitié laisserait le fichier moins lisible qu'il ne l'est.
- **La jauge de `momentum-row`** garde ses trois couleurs en dur, comme son commentaire
  l'explique : la piste et son remplissage doivent arriver ensemble.

### Étape 3 — Le socle

Démonter `LiveSummaryBar` et la reconstruire en bas, soudée à `AppTabBar` :
poignée, ligne globale d'une hauteur fixe, navbar. Le dépliage loge le détail du
mode confort. Suppression des trois modes (`comfort` / `compact` / `hidden`), du
bouton de densité et de `useLiveBarStore` — il n'y a plus de préférence à mémoriser
puisqu'il n'y a plus de choix à faire. `AppHeader` perd `liveSummary` et
`alwaysOn`, et ne porte plus qu'une action.

Trois points à traiter :

1. **Budget vertical en bas** : navbar ~56 + safe area 34 + ligne globale ~40 =
   ~130 px permanents. Reprendre les `paddingBottom` des listes.
2. **Collisions flottantes** : le FAB « Nouveau récap » et le bouton
   « Maintenant » sont ancrés en `bottom-6` / `bottom: 20` en dur ; ils devront
   s'appuyer sur une constante de hauteur du socle.
3. **Clavier** : la recherche de l'onglet Streamers ouvre le clavier ; le socle
   doit se retirer avec la navbar, pas se faire pousser par-dessus le contenu.

### Étape 4 — La navigation

1. Créer `/settings` (hub) : Notifications, Récaps, Écran secondaire, Compte,
   Sources et fraîcheur, À propos. Supprime les renvois croisés actuels entre
   `settings/recaps` et `settings/notifications`, et donne une destination stable
   au bouton de réglages de chaque page.
2. Supprimer `/favorites` au profit de `/(tabs)/streamers?scope=favorites`.
3. Fusionner Stats et Récaps en un onglet « Bilan » à deux volets.
