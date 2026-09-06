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

**La mesure est passée du navigateur à la police** (`scripts/measure-icon-nudge.mjs`).
Le relevé au canvas demandait l'aperçu web, qui est précisément l'environnement où le
défaut ne se voit pas ; le script, lui, lit les contours du glyphe dans le fichier de
police et calcule le barycentre de la surface encrée par l'aire signée de ses contours —
les évidements, parcourus à l'envers, s'en retranchent d'eux-mêmes, comme le fait le
remplissage non-nul du rendu. Il retrouve pour le `play` les 0,082 relevés au canvas
(0,0809), ce qui vaut validation de la méthode, et se rejoue sans navigateur.

Il sert aussi à écarter une piste plutôt qu'à en ouvrir une. Le cœur du socle, signalé
mal centré à l'usage, a d'abord été soupçonné de mal tomber dans sa boîte de texte : le
script montre que sa boîte d'encre est centrée au millième près, et cela dans les trois
jeux de métriques verticales dont Android peut se servir — `hhea`, `OS/2 sTypo`,
`OS/2 usWin`. La géométrie était donc juste, et le défaut bien optique : la masse d'un
cœur est **5 % de la taille au-dessus** du centre de sa boîte, deux lobes larges en haut
contre une pointe qui s'effile en bas. Dans le rond de 32 px du socle, cela fait près
d'un pixel, et le cercle donne à l'œil de quoi le voir.

`heart: { y: 0.05 }` est donc la deuxième entrée de la table, et la seule ajoutée depuis.
Le script sait mesurer tout le lexique, mais y verser ses chiffres en bloc décalerait des
glyphes que personne n'a vus fautifs — la règle reste : constaté à l'œil, puis mesuré.

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

### Étape 3 — Le socle  ▸ faite

Démonter `LiveSummaryBar` et la reconstruire en bas, soudée à la barre d'onglets :
poignée, ligne globale d'une hauteur fixe, navbar. Le dépliage loge le détail du
mode confort. Suppression des trois modes (`comfort` / `compact` / `hidden`), du
bouton de densité et de `useLiveBarStore` — il n'y a plus de préférence à mémoriser
puisqu'il n'y a plus de choix à faire. `AppHeader` perd `liveSummary` et
`alwaysOn`, et ne porte plus qu'une action.

#### Ce que l'étape a effectivement changé

`src/components/app-socle.tsx` créé ; `live-summary-bar.tsx` et `store/live-bar.ts`
supprimés ; `app-tab-bar.tsx` réduit à la seule rangée d'onglets (`TabRow`), le socle
portant désormais la surface, le filet et la marge de zone sûre pour eux deux.

**Le socle est rendu comme barre d'onglets** (`tabBar` du navigateur) plutôt qu'ajouté
à chaque écran. C'est ce qui garantit qu'il n'existe qu'une fois, et surtout que la
scène se dimensionne d'elle-même au-dessus de lui : le navigateur pose la barre en
frère de la scène dans une colonne, si bien que les listes et les deux boutons
flottants n'ont eu aucune mesure à reprendre. Le point 1 (« budget vertical ») et le
point 2 (« collisions flottantes ») se sont donc réglés seuls — et la constante de
hauteur du socle qu'ils appelaient n'a pas eu lieu d'être.

Le point 3 (**clavier**) a bien demandé du code : `tabBarHideOnKeyboard` n'est
implémenté que dans la barre par défaut de la navigation, jamais atteinte ici. Le socle
écoute donc lui-même le clavier — `keyboardWill*` sur iOS pour partir en même temps que
lui, `keyboardDid*` sur Android — et s'efface entièrement tant qu'il est ouvert.

**Une correction est venue par-dessus le marché.** `ScreenShell` protégeait le bas de
tous les écrans, y compris ceux des onglets, alors que le navigateur transmet à la
scène les marges de la fenêtre entière. La barre de gestes était donc comptée deux
fois : une trentaine de pixels vides entre la dernière ligne de liste et le menu du
bas. Le contexte de hauteur du menu n'existe que dans une scène d'onglet, sa seule
présence suffit à savoir qui borde le bas.

**Le compte quitte la barre du haut.** Il n'était atteignable que depuis l'Accueil, où
il figurait parmi les actions de page alors qu'il ne parle pas de l'Accueil. Il rejoint
l'écran secondaire et les notifications dans le menu d'application du dépliage —
lequel deviendra une seule entrée « Réglages » quand l'étape 4 aura créé le hub.

Écarts assumés avec le plan :

- **Pas de grand montant dans le dépliage.** Il était le cœur du mode confort parce que
  la barre réduite n'affichait plus rien ; ici la cagnotte est écrite en permanence à
  trente pixels plus bas, et l'écrire deux fois dans le même bloc en ferait deux
  chiffres à rapprocher plutôt qu'un seul à lire. Le dépliage porte ce que la ligne ne
  peut pas : fraîcheur, viewers, streamers en live, programme, menu d'application.
- **`PlanningTicker` disparaît** avec la barre réduite dont il était la seconde ligne.
  Le socle tient sur une ligne de hauteur fixe, et les faits du planning se lisent dans
  le dépliage — c'est `PlanningHighlights`, renommé `SoclePlanning`, qui les porte.
- **Les écrans empilés perdent le résumé** (fiche d'un streamer, favoris, compte,
  réglages). Le socle est soudé à la barre d'onglets, et une tâche ponctuelle n'a pas
  besoin d'avoir la cagnotte sous les yeux.

### Étape 4 — La navigation  ▸ faite

1. Créer `/settings` (hub) : Notifications, Récaps, Écran secondaire, Compte,
   Sources et fraîcheur, À propos. Supprime les renvois croisés actuels entre
   `settings/recaps` et `settings/notifications`, et donne une destination stable
   au bouton de réglages de chaque page.
2. Supprimer `/favorites` au profit de `/(tabs)/streamers?scope=favorites`.
3. Fusionner Stats et Récaps en un onglet « Bilan » à deux volets.

#### Ce que l'étape a effectivement changé

**Le hub** (`src/app/settings/index.tsx`). Chaque en-tête de page y mène, et le socle
aussi : ce qui y alignait trois entrées — compte, écran secondaire, notifications —
n'en porte plus qu'une. Les six écrans de l'application pointent donc vers la même
destination, ce qui est tout l'intérêt de la règle « une action au maximum, toujours
la même » posée à l'étape 2.

« Sources et fraîcheur » et « À propos » y sont écrits à plat plutôt que derrière deux
feuilles de plus : ce sont trois paragraphes qu'on lit une fois, et une page qui ne
contiendrait qu'eux se compterait comme une navigation pour rien. Les cadences y sont
tirées de `lib/config` plutôt que recopiées — un intervalle qui change dans le code
doit changer dans le texte qui l'annonce.

Un seul renvoi entre feuilles de réglages a été gardé, celui des récaps vers les
notifications. Il ne comble pas l'absence d'un dessus, qui existe maintenant : il
répond à une question posée à cet endroit précis — l'interrupteur au-dessus dit si
l'on est prévenu, pas comment. Il passe par `NavRow`, comme les autres.

**`/favorites` supprimé.** Le périmètre de l'onglet Streamers vit désormais dans l'URL,
comme le tri y vivait déjà, ce qui rend `?scope=favorites` adressable : l'accueil y
envoie son lien, et l'en-tête prend le titre « Mes favoris » quand le périmètre est
réduit. Deux cent dix-huit lignes en moins.

Ce qui s'y perd est le tri par pertinence, que la liste générale ne connaît pas. Il
n'était nulle part ailleurs — mais c'est déjà ce que l'accueil fait de ses favoris, et
la liste complète garde « en forme sur la dernière heure », qui en est l'ingrédient
principal.

**« Bilan ».** `stats.tsx` et `recaps.tsx` deviennent `StatsPane` et `RecapsPane`, deux
volets d'un `Segmented` — le montage exact que l'onglet Dons emploie déjà pour ses trois
sections. Les volets sont montés à tour de rôle et non superposés : celui des récaps
tient une liste, ses commandes flottantes et une feuille de génération, et le garder
vivant derrière les statistiques ferait tourner ses requêtes pour un écran que personne
ne regarde.

Statistiques ouvre, parce que c'est le volet qui a toujours quelque chose à dire : la
courbe 2025 est embarquée dans l'application et s'affiche même sans réseau, là où le
premier récap n'existe qu'une fois le week-end commencé.

Restent cinq onglets — `Accueil · Streamers · Dons · Planning · Bilan` —, et les deux
textes qui parlaient de « l'onglet Récaps » parlent maintenant du volet.

---

## Ce qui reste à regarder

Les quatre étapes sont faites, mais les étapes 3 et 4 déplacent du mobilier et des
écrans entiers : elles se vérifient à l'œil, sur un appareil, pas au typecheck. Trois
points en particulier :

- **La hauteur du socle** déplié comme replié, et ce qu'il laisse au contenu sur un
  petit écran.
- **Le retrait au clavier**, sur les deux plateformes : c'est le seul endroit où
  l'application se substitue à un comportement que la navigation offre d'ordinaire.
- **Le volet Récaps** dans son nouveau châssis : ses commandes flottantes et son bouton
  de création sont désormais posés sous un `Segmented`, et non plus directement sous
  l'en-tête.

Deux défauts relevés à l'écran ont déjà été corrigés — l'étoile des favoris qui se
collait à sa voisine faute de boîte (voir `favorite-button`), et le centrage du cœur
(voir D2). Reste, du même genre et non traité : `ReminderBell` est la dernière bascule
d'icône à rendre son glyphe hors du système, donc sans le rattrapage Android, et son
`hitSlop` figé lui laisse une cible de 38 px. Elle vit seule en bout de ligne de texte,
où rien ne la trahit ; c'est pourquoi elle attend.
