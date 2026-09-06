---
title: Application web, back-office et monorepo
status: active
scope: monorepo, web, api, worker
created: 2026-09-06
updated: 2026-09-06
---

# Application web, back-office et monorepo

## Objectifs

Créer une application web qui serve d'abord de back-office opérationnel, sans empêcher l'ajout
ultérieur des fonctionnalités publiques de l'application mobile.

Le premier périmètre doit permettre de :

- contrôler l'état et le contenu des récapitulatifs ;
- prévisualiser et relancer leur génération ;
- visualiser la couverture temporelle des données collectées ;
- demander un rechargement sur une période donnée, en priorité pour les dons manquants du vendredi ;
- suivre les traitements, leurs erreurs et leur progression ;
- connaître précisément la provenance et le niveau de complétude des données.

Le chantier comprend la migration vers pnpm et la transformation du dépôt en véritable monorepo.

## Décisions actées

- Le monorepo utilise des workspaces **pnpm** et un unique `pnpm-lock.yaml`.
- **Turborepo** orchestre `dev`, `build`, `typecheck`, `lint` et `test`, avec cache local et CI.
- L'application web utilise **TanStack Start**, **TanStack Router**, **TanStack Query** et shadcn/ui.
- Fastify reste l'unique backend métier et la seule autorité pour les opérations d'administration.
- Le web peut employer les server functions de TanStack Start comme BFF, mais elles ne remplacent
  jamais les contrôles d'autorisation du backend Fastify.
- Les traitements périodiques et longs quittent le processus HTTP pour un worker indépendant.
- La file de traitements repose d'abord sur PostgreSQL. Redis n'est pas nécessaire pour la V1.
- Clerk reste le fournisseur d'identité commun au mobile et au web.
- Les composants shadcn web ne sont pas partagés avec les composants React Native.

TanStack Start est encore en phase Release Candidate au moment de cette décision. Ses API sont
annoncées comme stables et il fournit SSR, streaming, server functions et déploiement Node/Docker,
mais les versions de TanStack Start, Router et de son adaptateur de déploiement devront être
verrouillées et mises à jour volontairement. Références :
[présentation TanStack Start](https://tanstack.com/start/latest/docs/framework/react/overview),
[hébergement Node/Docker](https://tanstack.com/start/latest/docs/framework/react/guide/hosting),
[installation shadcn](https://ui.shadcn.com/docs/installation/tanstack).

## État initial et contraintes

Le dépôt possède déjà les briques métier nécessaires : Fastify, PostgreSQL, collecte ZEvent,
Streamlabs et EvenMoreStats, notifications, dons et récapitulatifs.

Les principaux points à traiter sont :

- Expo vit à la racine et Fastify dans `server/`, avec deux lockfiles npm ;
- les collecteurs et planificateurs sont lancés dans le même processus que l'API ;
- les migrations sont regroupées dans un tableau TypeScript unique ;
- plusieurs contrats d'API sont redéclarés côté mobile et côté serveur ;
- le collecteur de dons actuel ne demande que les 3 000 derniers dons Streamlabs ;
- Streamlabs est une source publique non documentée : sa pagination historique, mesurée en phase 0,
  fonctionne mais avance de 500 éléments par page pour une fenêtre de 3 000 ;
- le contenu d'un récap clos est mis en cache définitivement puis copié dans chaque récap personnel.

Un import réussi ne suffit donc pas : il doit aussi invalider les contenus dérivés qui chevauchent
la période importée.

## Structure cible

```text
apps/
  mobile/                 application Expo actuelle
  web/                    TanStack Start et back-office shadcn
  api/                    API Fastify HTTP, sans boucle périodique
  worker/                 collecte, imports, notifications et récaps

packages/
  contracts/              schémas Zod et DTO partagés
  database/               migrations, connexion PG et repositories
  domain/                 logique métier pure réellement partagée
  ui/                     composants shadcn, réservés au web
  config-eslint/          configuration ESLint partagée
  config-typescript/      configurations TypeScript partagées

docs/
  plans/                  plans transverses et décisions d'architecture
  sources/                capacités mesurées des sources externes et formats d'import
  ops/                    procédures d'exploitation (sauvegarde, restauration)

scripts/                  opérations ponctuelles, spikes de source et imports versionnés
docker-compose.yml        déploiement Dockploy et développement local
pnpm-workspace.yaml
turbo.json
pnpm-lock.yaml
package.json
```

Le dossier `domain` ne doit pas devenir un fourre-tout. Une logique n'y est extraite que lorsqu'au
moins deux applications en ont réellement besoin et qu'elle n'importe ni Fastify, ni React, ni
React Native.

Les snapshots propres au fonctionnement hors ligne du mobile restent dans `apps/mobile/src/content`
tant qu'ils ne sont pas consommés par un autre workspace.

## Gestion du workspace

Le fichier `pnpm-workspace.yaml` référence `apps/*` et `packages/*`. Les dépendances internes
emploient systématiquement `workspace:*`. Le `packageManager` racine verrouille la version de pnpm.

Pour limiter les risques sur Expo pendant la migration :

1. commencer avec `nodeLinker: hoisted` ;
2. contrôler l'absence de doublons de React, React Native et des modules Expo ;
3. exécuter `expo-doctor` et une build EAS Android ;
4. n'évaluer l'installation pnpm isolée qu'après stabilisation du monorepo.

Turborepo ne gère ni les versions ni le déploiement. Il ne fait qu'ordonner et mettre en cache les
tâches. Le graphe minimal est :

```text
build      dépend de ^build
typecheck  dépend de ^build
test       dépend de ^build
lint       indépendant
dev        persistant, sans cache
```

## Architecture d'exécution

### API

`apps/api` expose les routes publiques, mobiles et administratives. Il valide les entrées, vérifie
les autorisations, effectue les lectures courtes et place les opérations longues dans la file.

Il ne lance plus directement de timer de collecte. Cela évite de multiplier les collecteurs si
l'API est répliquée ou redémarrée indépendamment.

### Worker

`apps/worker` exécute :

- collecte ZEvent ;
- synchronisation des goals et du planning ;
- collecte et backfill des dons ;
- détection et envoi des notifications ;
- reçus Expo ;
- récaps programmés et régénérations administratives.

Une même image de build peut fournir plusieurs commandes, mais les processus et services Compose
restent séparés.

### File PostgreSQL

Une table `jobs` contient au minimum :

- `id`, `type`, `status` et clé d'idempotence ;
- paramètres JSON validés, dont la période `[from, to)` en UTC ;
- utilisateur Clerk demandeur ;
- progression et compteurs lu/inséré/mis à jour/ignoré ;
- curseur de reprise ;
- date de création, début, heartbeat et fin ;
- résultat synthétique ou dernière erreur.

Une table `job_events` conserve un journal append-only. Le worker réclame les travaux par
`FOR UPDATE SKIP LOCKED`, renouvelle un heartbeat et remet en file un travail abandonné selon une
politique explicite. Un verrou empêche deux imports concurrents incompatibles sur le même dataset.

## Authentification et autorisation

L'application web utilise le SDK officiel Clerk pour TanStack React Start et son middleware SSR.
Fastify valide également le bearer token reçu : protéger uniquement les routes ou server functions
web ne serait pas une frontière de sécurité suffisante.

Pour la première version, `ADMIN_CLERK_USER_IDS` contient l'allowlist des administrateurs. Une table
de rôles ou des permissions Clerk Organization ne sera ajoutée que si plusieurs niveaux d'accès
deviennent nécessaires.

Toutes les mutations administratives :

- exigent une clé d'idempotence ;
- écrivent l'identité du demandeur dans l'audit ;
- valident des bornes maximales de période et de volume ;
- n'exposent jamais les secrets des sources dans le navigateur.

## Routes administratives

```text
GET  /v1/admin/overview
GET  /v1/admin/sources
GET  /v1/admin/coverage

GET  /v1/admin/jobs
GET  /v1/admin/jobs/:id
POST /v1/admin/jobs/:id/retry
POST /v1/admin/jobs/:id/cancel

POST /v1/admin/imports/preview
POST /v1/admin/imports
GET  /v1/admin/imports/:id

GET  /v1/admin/recap-periods
GET  /v1/admin/recap-periods/:id
POST /v1/admin/recap-periods/:id/preview
POST /v1/admin/recap-periods/:id/regenerate
```

Les schémas de requête et de réponse appartiennent à `packages/contracts`. Les schémas propres aux
sources externes restent privés au backend.

## Rechargement et couverture des données

### Capacités des sources

Chaque adaptateur déclare ce qu'il sait réellement faire : plage temporelle, pagination, curseur,
ordre stable, reprise et limites de débit. L'API refuse un backfill impossible plutôt que de créer
un job qui ne pourra pas tenir sa promesse.

Le spike de la phase 0 a tranché la question qui bloquait ce chantier : le feed Streamlabs se
remonte intégralement. `page` décale la fenêtre de 500 éléments pour une page de 3 000, l'ordre
croissant est stable et déterministe, et le premier don de l'édition reste accessible. Le vendredi
a été récupéré en entier, sans trou, avec sa preuve de parcours. Aucun filtre de date n'existe :
viser une période impose une dichotomie puis un balayage. Mesures et stratégie retenue dans
`docs/sources/streamlabs-donations.md`, matrice complète dans `docs/sources/README.md`.

Le même pipeline accepte un import JSON ou CSV provenant d'un export ou d'une archive fiable, non
plus comme substitut d'une pagination insuffisante mais comme protection contre la disparition ou
la mutation d'une source publique non documentée. Chaque ligne conserve sa provenance et
l'identifiant du job d'import ; le format est décrit dans
`docs/sources/donation-import-format.md`.

### Niveaux de couverture

L'interface distingue obligatoirement :

- `complete` : la plage a été parcourue entièrement avec une source qui le permet ;
- `observed` : les éléments proviennent d'un feed glissant sans garantie d'exhaustivité ;
- `partial` : import interrompu ou limite de source atteinte ;
- `unknown` : aucune preuve de couverture.

Le vocabulaire « dons observés » reste utilisé tant que l'exhaustivité ne peut pas être démontrée.

### Déroulement d'un backfill

1. L'administrateur choisit dataset, source et période.
2. `preview` renvoie couverture actuelle, capacité de la source et travail estimé.
3. Le job est créé avec une clé d'idempotence.
4. Le worker parcourt la source et valide les lignes par lots.
5. Les identifiants Streamlabs rendent l'upsert rejouable.
6. Les notifications sont toujours désactivées pour les données historiques.
7. Le job enregistre sa couverture réelle, pas seulement la période demandée.
8. Les contenus dérivés qui chevauchent cette couverture deviennent `stale`.

Les dons gagnent les informations `source`, `ingested_at`, `updated_at` et `import_job_id`. Le JSON
source brut ne sera conservé que s'il apporte une valeur de diagnostic compatible avec la
minimisation des données personnelles.

## Cycle de vie des récaps

Un récap personnel doit référencer un contenu canonique par période au lieu d'en conserver une
copie indépendante.

Migration progressive :

1. ajouter `recap_content_id` aux récaps existants ;
2. rattacher les lignes à leur contenu de période ;
3. servir temporairement `COALESCE(contenu canonique, ancien contenu)` ;
4. arrêter les nouvelles copies JSON ;
5. supprimer l'ancien champ uniquement après validation des clients mobiles supportés.

Le contenu canonique porte :

- une révision courante ;
- un état `fresh`, `stale`, `generating` ou `failed` ;
- les dates de génération et d'invalidation ;
- le watermark des données sources utilisées ;
- la dernière erreur éventuelle.

La régénération administrative se fait en deux temps :

1. générer une révision candidate sans remplacer la version publiée ;
2. afficher le diff sur montants, dons observés, donateurs, progressions et highlights ;
3. publier la révision atomiquement après confirmation.

Un backfill invalide automatiquement les récaps dont la période chevauche les données réellement
ajoutées ou modifiées. La régénération automatique pourra être activée plus tard ; elle reste
manuelle dans la première version afin de permettre le contrôle du diff.

## Application web

TanStack Start fournit le rendu serveur et les server functions. TanStack Router gère les routes et
leurs paramètres typés. TanStack Query gère le cache des lectures Fastify, le polling des jobs et
l'invalidation après mutation. Les données métier ne sont pas dupliquées dans un second backend.

Arborescence fonctionnelle initiale :

```text
src/routes/
  __root.tsx
  index.tsx                    future entrée publique
  sign-in.$.tsx
  admin.tsx                   layout protégé
  admin.index.tsx             santé globale
  admin.data.index.tsx        couverture temporelle
  admin.data.reload.tsx       assistant de rechargement
  admin.jobs.index.tsx        historique et travaux actifs
  admin.jobs.$jobId.tsx       progression, logs, retry, annulation
  admin.recaps.index.tsx      périodes et fraîcheur
  admin.recaps.$periodId.tsx  contenu, diff et régénération
  admin.sources.tsx           santé des sources externes
```

Le suivi des jobs commence par un polling TanStack Query. Un flux SSE ne sera ajouté que si le
polling devient insuffisant.

## Déploiement

Le Compose cible contient :

- `postgres` avec volume persistant ;
- `api` avec healthcheck HTTP ;
- `worker` avec contrôle de heartbeat ;
- `web` construit en serveur Node TanStack Start/Nitro ;
- éventuellement un service de migration one-shot si Dockploy le prend correctement en charge.

Les Dockerfiles sont construits avec le contexte à la racine, car les applications dépendent de
packages du workspace. Les images n'embarquent que les workspaces et dépendances nécessaires.

Les migrations sont protégées par un verrou PostgreSQL. Tant que le service one-shot n'a pas été
validé avec Dockploy, l'API peut les appliquer au démarrage avant d'accepter du trafic.

## Plan de réalisation

### Phase 0 — Faisabilité et sauvegarde `réalisée le 6 septembre 2026, hors exécution serveur`

- ✅ remontée historique Streamlabs testée : `scripts/spike-streamlabs-history.mjs`, mesures dans
  `docs/sources/streamlabs-donations.md` ;
- ✅ matrice des capacités de chaque source : `docs/sources/README.md` ;
- ✅ import fichier de secours spécifié : `docs/sources/donation-import-format.md` ;
- ⏳ sauvegarde et restauration : `scripts/db-backup.sh` et `scripts/db-restore.sh` livrés, testés
  de bout en bout sur un PostgreSQL 18 jetable portant le schéma réel (dump, empreinte, manifeste,
  détection d'un dump corrompu, refus sans `--force`, restauration effective, rotation), procédure
  dans `docs/ops/postgres-backup-restore.md` ; **exécution sur l'instance Dockploy restante** et
  obligatoire avant le premier backfill.

Critère de sortie atteint. Ce qui est su du vendredi :

- le feed Streamlabs remonte à `2026-09-03T18:28:12Z`, soit le premier don de l'édition ;
- la journée du vendredi 4 septembre (Europe/Paris) a été récupérée en entier : 152 657 dons,
  2 852 810 €, aucun trou de recouvrement, en 99 requêtes et 4 minutes ;
- le feed entier a été balayé pour chiffrer le manque exact : la base de production ne contient
  aucun don antérieur à `2026-09-04T23:38:16Z`, soit **220 807 dons et 3 471 320 € à rattraper**,
  et un seul trou, en tête ; au-delà de cette date les deux sources concordent ;
- la couverture est `complete` au sens du vocabulaire ci-dessus, avec preuve de parcours et non
  déclaration ;
- le rattrapage se fait en `order=asc` par pas de 5 pages, avec 500 éléments de recouvrement qui
  servent de preuve d'absence de saut ;
- aucun filtre de date n'existe côté source : une période se localise par dichotomie ;
- l'idempotence est assurée par `donation.id`, déjà clé primaire de `donations`.

Ce qui reste non rattrapable, et qui justifie la sauvegarde : `samples`, `goals_snapshots` et
`planning_snapshots` proviennent de sources instantanées, sans historique interrogeable. Un trou de
collecte y est définitif.

### Phase 1 — Monorepo pnpm sans changement métier

- déplacer Expo vers `apps/mobile` et Fastify vers `apps/api` ;
- créer les workspaces, le lockfile unique et le graphe Turborepo ;
- adapter scripts, chemins, Expo/EAS, Docker et Dockploy ;
- supprimer les lockfiles npm uniquement après validation ;
- exécuter tests, typecheck, builds, `expo-doctor` et une build Android de contrôle.

### Phase 2 — Fondations partagées et séparation des processus

- créer `contracts`, `database` et les configurations partagées ;
- découper les migrations en fichiers immuables sans réappliquer les versions existantes ;
- déplacer les boucles périodiques dans `apps/worker` ;
- ajouter jobs, job events, audit et reprise après interruption ;
- mettre en place l'authentification administrateur dans Fastify ;
- initialiser TanStack Start, Clerk et shadcn dans `apps/web`.

### Phase 3 — Backfill et couverture

- implémenter l'adaptateur historique retenu ;
- ajouter l'import JSON/CSV si nécessaire ;
- ajouter provenance et métadonnées d'ingestion ;
- implémenter preview, progression, annulation et retry ;
- calculer et afficher couverture, trous et niveau de confiance ;
- garantir par test qu'un backfill n'émet aucune notification.

### Phase 4 — Révisions de récaps

- normaliser le contenu canonique ;
- ajouter fraîcheur, watermark, révisions et erreurs ;
- invalider les périodes touchées par un import ;
- implémenter génération candidate, diff et publication atomique ;
- couvrir les récaps publics, manuels et programmés.

### Phase 5 — Back-office complet

- dashboard opérationnel et santé des sources ;
- écran de couverture et assistant de rechargement ;
- historique et détail des jobs ;
- liste, aperçu, diff et régénération des récaps ;
- confirmations, erreurs lisibles et journal d'audit.

### Phase 6 — Durcissement

- tests d'intégration avec une base PostgreSQL jetable ;
- tests E2E des parcours administratifs critiques ;
- alertes sur collecte en retard, source indisponible et job bloqué ;
- documentation de sauvegarde, restauration et exploitation ;
- validation du déploiement complet dans Dockploy.

## Critères d'acceptation

- Un seul `pnpm-lock.yaml` permet d'installer et vérifier tout le dépôt.
- Les tests et builds peuvent être lancés globalement ou par workspace.
- L'API peut être redémarrée sans interrompre ni dupliquer un worker.
- Une opération longue survit à un redémarrage du worker ou signale clairement son échec.
- Relancer deux fois le même import ne duplique aucun don.
- Un import historique ne produit jamais de notification push.
- Le back-office ne présente jamais une couverture `complete` sans preuve fournie par l'adaptateur.
- Toute modification de données rend visibles les récaps potentiellement obsolètes.
- Une nouvelle version de récap est prévisualisable avant publication.
- Une erreur de régénération conserve la dernière version publiée.
- Aucune route administrative n'est accessible avec un compte Clerk non autorisé.
- L'app mobile continue à fonctionner pendant et après chaque phase de migration.

## Améliorations ultérieures

- export CSV/JSON des dons, couvertures et récaps ;
- comparaison automatique avant/après régénération ;
- vue d'impact listant les récaps dépendants d'un import ;
- détection d'anomalies de collecte ;
- rôles administrateur/lecteur ;
- flux SSE pour les jobs ;
- reprise progressive des fonctionnalités mobiles dans les routes publiques du web.
