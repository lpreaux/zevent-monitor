---
title: Format d'import de dons (repli fichier)
status: active
scope: api, worker
created: 2026-09-06
updated: 2026-09-06
---

# Format d'import de dons (repli fichier)

Le spike de la phase 0 a montré que le feed Streamlabs permet un backfill complet
([mesures](streamlabs-donations.md)). Ce format reste néanmoins spécifié et alimente **le même
pipeline** que l'adaptateur réseau : la source est publique, non documentée et sans engagement, et
une archive locale peut devenir la seule copie d'une période.

Un import fichier n'est pas un chemin de secours dégradé : il produit les mêmes jobs, la même
idempotence, la même provenance et la même couverture qu'un import réseau. Seul l'adaptateur
change.

## NDJSON (format de référence)

Un objet JSON par ligne, encodage UTF-8, sans virgule terminale ni tableau englobant. C'est
exactement ce que produit :

```bash
node scripts/spike-streamlabs-history.mjs coverage \
  --from 2026-09-03T22:00:00Z --to 2026-09-04T22:00:00Z --out vendredi.ndjson
```

```json
{"id":"455768204818539114","createdAt":"2026-09-03T22:00:04+00:00","amountCents":1000,"donor":"Finesteel","comment":null,"country":"France","streamlabsMemberId":"956603976860703540","memberSlug":"paramiaasmr","memberDisplayName":"ParamiaASMR"}
```

| Champ | Type | Obligatoire | Règle |
| --- | --- | --- | --- |
| `id` | string | oui | identifiant Streamlabs du don, clé d'idempotence (`donations.id`) |
| `createdAt` | string ISO 8601 avec fuseau | oui | date du don ; sans fuseau explicite, la ligne est rejetée |
| `amountCents` | entier > 0 | oui | montant converti en centimes, devise de la team (EUR) |
| `donor` | string | oui | nom affiché du donateur ; chaîne vide refusée |
| `comment` | string ou `null` | non | texte du commentaire, jamais l'objet `{ text }` brut |
| `country` | string ou `null` | non | nom anglais ou code ISO alpha-2 ; normalisé à l'import |
| `streamlabsMemberId` | string ou `null` | non | membre soutenu, à rapprocher de `streamers.streamlabsId` |
| `memberSlug` | string ou `null` | non | repli de résolution du login Twitch |
| `memberDisplayName` | string ou `null` | non | repli de résolution du login Twitch |

Un don sans membre (`streamlabsMemberId` nul) est valide : il s'agit d'un don adressé à la team et
non à un streamer. Ce cas représentait 0,1 % du vendredi 2026.

## CSV

Accepté avec les mêmes noms de colonnes, en-tête obligatoire, séparateur `,`, guillemets doubles
selon RFC 4180. Le CSV existe pour les exports tiers ; le NDJSON reste le format de référence
parce qu'il supporte les commentaires multilignes sans échappement ambigu.

## Contrôles à l'import

L'import valide **avant** d'écrire quoi que ce soit :

1. chaque ligne passe le schéma Zod de `packages/contracts` ; une ligne invalide est rejetée avec
   son numéro de ligne, sans interrompre le lot ;
2. les identifiants dupliqués dans le fichier sont réduits à leur première occurrence ;
3. la période couverte par le fichier est calculée à partir des lignes acceptées, jamais déclarée
   par l'opérateur ;
4. une période hors des bornes de l'édition (`schedule` de `GET /events`) est refusée ;
5. le fichier est empreint en SHA-256 et cette empreinte devient la clé d'idempotence du job :
   rejouer le même fichier ne crée pas un second import.

## Écriture et provenance

Les lignes sont insérées par l'upsert existant (`ON CONFLICT (id)`), avec les colonnes de
provenance prévues par le plan : `source` (`streamlabs-feed`, `streamlabs-backfill`, `file-import`),
`ingested_at`, `updated_at` et `import_job_id`.

Deux règles non négociables :

- **aucune notification** n'est émise pour des lignes importées, quelle que soit leur date ;
- la **couverture réelle** du job est celle des lignes acceptées, pas la période demandée ; les
  récaps qui chevauchent cette couverture passent à `stale`.

Le JSON brut de la source n'est pas conservé : il contient des données personnelles (nom du
donateur, commentaire libre, pays) dont la duplication n'apporte rien qui ne soit déjà dans les
colonnes ci-dessus.
