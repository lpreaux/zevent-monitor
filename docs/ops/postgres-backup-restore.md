---
title: Sauvegarde et restauration PostgreSQL
status: active
scope: api, worker
created: 2026-09-06
updated: 2026-09-06
---

# Sauvegarde et restauration PostgreSQL

Procédure d'exploitation exigée par la phase 0 du
[plan monorepo](../plans/web-backoffice-monorepo.md) : **aucun backfill ne doit être lancé sur une
base dont la restauration n'a pas été testée**.

La raison est asymétrique et vaut d'être explicite. Les dons sont rattrapables : le feed Streamlabs
permet de reconstruire la période ([mesures](../sources/streamlabs-donations.md)). Les tables
`samples`, `goals_snapshots` et `planning_snapshots` ne le sont pas : leurs sources sont
instantanées, sans historique. Une base perdue en cours d'édition perd définitivement la courbe de
la cagnotte, les paliers et le planning. La sauvegarde n'est donc pas une formalité, c'est la seule
copie de ces données.

## Outils

| Script | Rôle |
| --- | --- |
| `scripts/db-backup.sh` | dump `pg_dump --format=custom`, empreinte SHA-256 et manifeste de comptages |
| `scripts/db-restore.sh` | restauration dans une base jetable et comparaison au manifeste |

Les deux résolvent le conteneur via `docker compose ps -q postgres`, ou via `PG_CONTAINER` quand
Compose n'est pas pilotable depuis le shell courant (cas de Dockploy).

## Sauvegarder

```bash
scripts/db-backup.sh                    # écrit dans ./backups
scripts/db-backup.sh /srv/backups/zevent
BACKUP_KEEP=14 scripts/db-backup.sh     # conserve 14 sauvegardes au lieu de 7
```

Trois fichiers sont produits :

- `zevent-<horodatage>.dump` — format custom, restauration sélective possible ;
- `zevent-<horodatage>.dump.sha256` — empreinte, vérifiée avant toute restauration ;
- `zevent-<horodatage>.manifest.json` — version du serveur, taille et **nombre de lignes de chaque
  table publique**.

Le manifeste est ce qui transforme la sauvegarde en sauvegarde vérifiable : sans comptages de
référence, une restauration « qui ne plante pas » ne prouve rien.

## Tester la restauration

```bash
scripts/db-restore.sh backups/zevent-20260906T101500Z.dump
```

Par défaut, le script :

1. vérifie l'empreinte SHA-256 ;
2. crée une base jetable `zevent_restore_check` ;
3. y restaure le dump ;
4. compare table par table les comptages au manifeste ;
5. supprime la base de test (`--keep` la conserve pour inspection).

Toute divergence sort en code 1 avec la ligne fautive. Une divergence sur `donations` après un
import est normale si le dump est antérieur à celui-ci ; une divergence sur `samples`,
`recaps` ou `devices` entre un dump et sa propre restauration ne l'est jamais.

## Restaurer réellement

```bash
docker compose stop server                                  # ou l'app dans Dockploy
scripts/db-restore.sh backups/zevent-<horodatage>.dump --into zevent --force
docker compose start server
```

`--force` est obligatoire pour écrire dans la base de production : le script refuse sinon. Arrêter
le service applicatif d'abord n'est pas une précaution de confort : la restauration recrée la base,
et `DROP DATABASE` échoue tant qu'une connexion reste ouverte — un collecteur encore actif fait
donc échouer la restauration au pire moment.

## Cadence attendue

| Moment | Action |
| --- | --- |
| Avant tout backfill ou migration | sauvegarde + test de restauration, dans cet ordre |
| Pendant une édition ZEvent | sauvegarde horaire, rétention 7 |
| Hors édition | sauvegarde quotidienne |
| Après l'édition | une sauvegarde archivée hors du serveur |

Une sauvegarde qui ne quitte jamais la machine ne protège que des erreurs applicatives. Copier au
moins le dump de fin d'édition en dehors du VPS.

## État de la vérification

Les deux scripts ont été exécutés de bout en bout le 6 septembre 2026 contre un PostgreSQL 18
jetable portant le schéma réel du projet (les migrations de `server/src/db/migrate.ts`), 5 000 dons
et 500 échantillons de test. Cas couverts :

| Cas | Résultat attendu | Obtenu |
| --- | --- | --- |
| Sauvegarde | dump, empreinte, manifeste des 13 tables | ✅ |
| Restauration d'un dump intact | 13 tables comparées, code 0 | ✅ |
| Dump corrompu (1 octet modifié) | échec à l'empreinte, avant restauration | ✅ code 1 |
| Manifeste incohérent | table fautive signalée, code 1 | ✅ code 1 |
| Restauration sur la base de production sans `--force` | refus | ✅ code 1 |
| Restauration réelle après suppression de 1 111 dons | retour à 5 000 lignes | ✅ |
| Rotation `BACKUP_KEEP=2` sur 3 sauvegardes | 2 conservées, la plus ancienne purgée | ✅ |

Ce qui reste à faire : **exécuter la séquence sur l'instance Dockploy avant le premier backfill**,
sur la vraie base et son vrai volume.

```bash
scripts/db-backup.sh
scripts/db-restore.sh backups/<le-dump-produit>.dump
```

Les deux commandes doivent sortir en code 0, la seconde affichant `Restauration vérifiée.`
Si Compose n'est pas pilotable depuis le shell du serveur, renseigner `PG_CONTAINER` :

```bash
PG_CONTAINER=$(docker ps -qf name=postgres) scripts/db-backup.sh /srv/backups/zevent
```
