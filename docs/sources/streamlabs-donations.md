---
title: Feed de dons Streamlabs Charity — capacités mesurées
status: active
scope: api, worker
created: 2026-09-06
updated: 2026-09-06
---

# Feed de dons Streamlabs Charity — capacités mesurées

Résultat du spike de la phase 0 de [Application web, back-office et monorepo](../plans/web-backoffice-monorepo.md).
Streamlabs Charity est une source publique non documentée : rien n'y est garanti, tout ce qui suit
a été **mesuré** le 6 septembre 2026 entre 10:00 et 10:35 UTC, pendant le ZEvent 2026, avec
`scripts/spike-streamlabs-history.mjs`.

```bash
node scripts/spike-streamlabs-history.mjs capabilities
node scripts/spike-streamlabs-history.mjs coverage --from 2026-09-03T22:00:00Z --to 2026-09-04T22:00:00Z
node scripts/spike-streamlabs-history.mjs coverage --from 2026-09-03T00:00:00Z --to 2026-09-06T10:00:00Z
```

## Endpoint

```text
GET https://streamlabscharity.com/api/v1/teams/{teamId}/donations?order=asc&page=N
```

`teamId` = `945347664248182491` (ZEvent 2026, `slug: zevent-2026`).

## Ce que la source sait faire

| Capacité | Mesure |
| --- | --- |
| Taille de page | 3 000 éléments, constante et non paramétrable |
| `limit`, `per_page` | ignorés (page de 3 000 malgré tout) |
| `order` | `asc` (défaut, plus ancien d'abord) et `desc` |
| Pas de pagination | **500 éléments par page**, pas 3 000 : deux pages consécutives se recouvrent de 2 500 |
| Contiguïté | vérifiée : les 2 500 derniers éléments de la page *k* sont exactement les 2 500 premiers de la page *k+1* |
| Déterminisme | vérifié : une page rejouée renvoie la même fenêtre |
| Profondeur | dernière page atteinte 2 171 → **1 084 119 dons** récupérés du premier au dernier |
| Point le plus ancien | `2026-09-03T18:28:12Z`, soit le premier don de l'édition |
| Filtres de date | aucun : `after`, `before`, `since`, `created_after`, `cursor` sont ignorés silencieusement |
| Tri | `created_at` croissant, **pas strictement monotone** : 16 inversions sur 152 657 dons |
| Identifiants | `donation.id` stable, non strictement croissant avec la date |
| Limitation de débit | aucun en-tête `x-ratelimit`, aucun 429 observé sur plus de 700 requêtes |
| Latence | 1,4 à 2,9 s par page, ~2,2 Mo par page |

La conséquence structurante est le pas de 500 : le paramètre `page` ne saute pas d'une fenêtre à la
suivante, il décale la fenêtre de 500 éléments. Le feed peut donc être remonté intégralement, mais
au prix d'un facteur de redondance de 6 si on incrémente `page` de 1.

## Ce que la source ne sait pas faire

- Aucun filtrage temporel côté serveur : viser une période impose de localiser les pages par
  dichotomie sur `created_at`, puis de balayer.
- Aucune métadonnée de pagination (`total`, `last_page`) sur ce endpoint, contrairement à
  `teams/{id}/members`. La fin du dataset ne se détecte qu'à la page incomplète.
- Aucun engagement de stabilité : ni versionnage, ni documentation, ni contrat.

## Couverture du vendredi

C'est le point qui bloquait le plan : les dons du vendredi manquants en base sont-ils récupérables ?

| Fenêtre (Europe/Paris) | Vendredi 4 septembre 2026, 00:00 → 24:00 (`2026-09-03T22:00Z` → `2026-09-04T22:00Z`) |
| --- | --- |
| Dons récupérés | **152 657** |
| Montant | **2 852 810 €** |
| Trous de recouvrement | **0** |
| Niveau de couverture | **`complete`** |
| Coût | 99 requêtes, 209 Mo, ~4 minutes |
| Pages concernées | 1 → 311 |

Qualité des lignes récupérées sur cette fenêtre :

- `country` renseigné à 100 % (contre une part importante de `null` sur le feed en direct, où
  Streamlabs renseigne le pays avec un délai) ;
- `member` absent sur 132 dons (0,1 %) : dons adressés à la team et non à un streamer ;
- commentaire présent sur 25,7 % des dons ;
- aucun montant nul, négatif ou non numérique ;
- aucun identifiant en double.

**Le vendredi est donc entièrement récupérable**, avec une preuve de parcours et non une simple
promesse. Le repli par fichier reste néanmoins spécifié
([format d'import](donation-import-format.md)) : la source peut disparaître ou changer sans
préavis, et l'archive locale devient alors la seule copie.

## Écart mesuré avec la base de production

Le feed a été balayé intégralement le 6 septembre 2026, du premier don à `2026-09-06T10:00:00Z`,
puis comparé à ce que l'API déployée expose (`GET /v1/donations/stats`).

| | Source Streamlabs | Base de production |
| --- | --- | --- |
| Dons | 1 084 119 | 869 219 |
| Montant | 13 457 654 € | 10 089 196 € |
| Premier don | `2026-09-03T18:28:12Z` | `2026-09-04T23:38:16Z` |
| Heures vides sur 65 | 0 | — |

**Écart : 220 807 dons et 3 471 320 €**, tous antérieurs à `2026-09-04T23:38:16Z`. La base n'a
qu'un seul trou, en tête : le jeudi soir d'ouverture et l'intégralité du vendredi, jusqu'au moment
où le collecteur a démarré. Après cette date, les deux sources concordent aux dons arrivés entre
les deux relevés près.

Le balayage intégral a coûté 471 requêtes, 1 018 Mo et 12 minutes, sans aucun trou de recouvrement
ni identifiant en double. Le total mesuré est cohérent à environ 1 % près avec la cagnotte
officielle annoncée par `zevent.fr` au même moment ; l'écart résiduel tient au décalage de quelques
minutes entre les deux relevés et à ce que le total officiel peut agréger hors de cette team.

## Stratégie de backfill retenue

1. **Toujours `order=asc`.** En ordre croissant, les offsets sont stables dans le temps : les
   nouveaux dons s'ajoutent à la fin. Un job interrompu reprend à sa page sans décalage. En
   `order=desc`, chaque don entrant décale toutes les pages et un job long saute des lignes.
2. **Avancer de 5 pages** (2 500 dons inédits par requête, 500 de recouvrement). Le recouvrement
   n'est pas du gaspillage : c'est la preuve, à chaque itération, qu'aucun don n'a été sauté. Un
   pas de 6 pages supprimerait le recouvrement et donc la preuve.
3. **Localiser la période par dichotomie** sur le `created_at` du dernier élément de page, puis
   reculer d'une fenêtre : le tri n'étant pas strictement monotone, la borne doit être prise avec
   une marge (une page complète suffit largement pour 16 inversions sur 152 657 lignes).
4. **Idempotence par `donation.id`** : l'upsert existant (`ON CONFLICT (id)`) rend un import
   rejouable. Un backfill relancé deux fois ne duplique rien.
5. **Curseur de reprise** = numéro de page + dernier identifiant traité, stockés dans le job.
6. **Couverture déclarée** = `complete` seulement si le balayage s'est terminé sans trou de
   recouvrement, `partial` sinon. La période demandée n'est jamais la couverture.

Coût mesuré d'un backfill intégral de l'édition (1 084 119 dons) : 471 requêtes, 1 018 Mo et
12 minutes à 250 ms d'intervalle. Un backfill d'une seule journée coûte environ 100 requêtes.
Le rattrapage réellement nécessaire — tout ce qui précède `2026-09-04T23:38:16Z` — représente
environ 90 requêtes.

## Pièges relevés dans le code actuel

- `apps/api/src/sources/streamlabs.ts` ne demande que la première page (`order=desc`, 3 000 dons) :
  c'est un feed glissant, la couverture qu'il produit est `observed`, jamais `complete`.
- `streamlabsTeamSchema` attend `amount_raised`, `slug` et `campaign_id` au premier niveau. Le
  endpoint `teams/{id}` ne renvoie plus aujourd'hui que `id`, `display_name`, `slug`, `public`,
  `members` et `campaign`. `getTeam()` et `getMembers()` n'étant appelés nulle part, l'écart n'a
  aucun effet en production, mais le schéma est faux : le corriger ou supprimer le code mort avant
  de s'appuyer dessus.
- Le README annonce « une centaine de dons par relevé » pour le feed : c'est 3 000.
