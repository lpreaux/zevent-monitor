---
title: Sources de données et matrice des capacités
status: active
scope: api, worker, web
created: 2026-09-06
updated: 2026-09-06
---

# Sources de données et matrice des capacités

Ce dossier décrit ce que chaque source externe sait réellement faire. Il sert de référence à
l'adaptateur de backfill, à la route `GET /v1/admin/sources` et à l'affichage de couverture du
back-office ([plan](../plans/web-backoffice-monorepo.md)).

Une règle : **une capacité non mesurée n'existe pas**. Tant qu'un parcours complet n'a pas été
prouvé, la couverture affichée reste `observed` ou `unknown`, jamais `complete`.

## Vocabulaire de couverture

| Niveau | Signification |
| --- | --- |
| `complete` | la plage a été parcourue de bout en bout par une source qui le permet, sans trou |
| `observed` | les éléments viennent d'un feed glissant, sans garantie d'exhaustivité |
| `partial` | import interrompu, ou limite de la source atteinte avant la fin de la plage |
| `unknown` | aucune preuve de couverture |

## Matrice

| Source | Endpoint | Plage | Pagination | Ordre stable | Reprise | Couverture atteignable |
| --- | --- | --- | --- | --- | --- | --- |
| Streamlabs — dons | `teams/{id}/donations` | tout l'historique de la team, depuis `2026-09-03T18:28:12Z` | `page`, pas de **500** pour une fenêtre de 3 000 | oui (`created_at` croissant, 16 inversions sur 152 657) | page + dernier id | **`complete`** |
| Streamlabs — membres | `teams/{id}/members` | état courant | Laravel : `current_page`, `last_page`, `total`, 20/page | n/a | page | `complete` sur l'état courant |
| Streamlabs — team | `teams/{id}` | état courant | aucune | n/a | n/a | `complete` sur l'état courant |
| ZEvent — état | `https://zevent.fr/api/` | **instantané seul** | aucune | n/a | n/a | `observed` (historisé par la table `samples`) |
| EvenMoreStats — événements | `events` | catalogue des éditions, avec `schedule` et `schedule_raising` | aucune | n/a | n/a | `complete` |
| EvenMoreStats — paliers | `events/{id}/donation_goals/overview`, `participations/{id}/donation_goals` | **état courant seul** | aucune | n/a | n/a | `observed` (historisé par `goals_snapshots`) |
| EvenMoreStats — planning | `events/{id}/shows` | planning courant | aucune | n/a | n/a | `observed` (historisé par `planning_snapshots`) |
| EvenMoreStats — montant | `stats/amount_raised?event_id=` | instantané | aucune | n/a | n/a | `observed` |
| Cache EvenMoreStats | `https://cache.evenmorestats.fr/{id}/global.json` | séries 5 min, **figées après l'édition** | aucune | n/a | n/a | inutilisable pendant l'édition (voir ci-dessous) |
| Import fichier | NDJSON/CSV local | ce que contient le fichier | n/a | n/a | ligne | `partial`, ou `complete` si le fichier couvre la plage |

Détail et protocole de mesure du feed de dons : [Streamlabs Charity](streamlabs-donations.md).

## Ce que chaque source implique

**Streamlabs Charity — dons.** Seule source rejouable et complète. Elle porte le backfill des dons
manquants, y compris le vendredi. Aucun filtre temporel : viser une période impose une dichotomie
puis un balayage. Pas de limitation de débit constatée, mais aucun engagement non plus : rester
à 250 ms entre deux requêtes.

**ZEvent — `zevent.fr/api`.** Instantané uniquement : ni historique, ni pagination. La courbe de la
cagnotte 2026 n'existe que parce que le collecteur en enregistre des échantillons dans `samples`.
Un trou de collecte sur cette table est définitif : aucune source ne permet de le combler
rétroactivement pendant l'édition. C'est la première justification de la sauvegarde PostgreSQL.

**EvenMoreStats — paliers et planning.** Source communautaire (InGDoc/EvenMoreStats), instantanée
elle aussi. `goals_snapshots` et `planning_snapshots` en sont la seule mémoire. Même conclusion que
pour `samples`.

**Cache EvenMoreStats.** `global.json` fournit des séries à pas de 5 minutes, mais pour l'édition
2026 le fichier interrogé le 6 septembre 2026 était figé sur une fenêtre du 20 août 2026 avec des
valeurs nulles : il n'est renseigné qu'après l'événement, comme pour 2025
(`scripts/import-history-2025.mjs`). Il ne peut donc pas servir de secours en cours d'édition.

**Bornes officielles de l'édition.** `GET /events` donne pour ZEvent 2026 :
`schedule` = `2026-09-03T18:00:00Z` → `2026-09-07T00:00:00Z`, `schedule_raising` =
`2026-09-04T16:00:00Z` → `2026-09-07T00:00:00Z`. Ces bornes servent à valider les périodes de
backfill : une demande hors plage est refusée plutôt que mise en file.

## Conséquences pour le backfill

1. Les **dons** sont la seule donnée réellement rattrapable. Tout le reste dépend d'une collecte
   qui n'a pas de rattrapage : sauvegarder la base est la seule protection.
2. Un adaptateur déclare ses capacités (`supportsBackfill`, `pageStride`, `orderStable`,
   `resumable`, `earliestAt`) et l'API refuse un backfill qu'aucun adaptateur ne peut tenir.
3. Le repli fichier ([format](donation-import-format.md)) couvre la disparition ou la mutation de
   la source, pas une insuffisance de sa pagination.
