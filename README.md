# ZEvent Monitor

Application Android dédiée au suivi en temps réel du ZEvent 2026. Elle réunira la cagnotte globale, les streams favoris, les donation goals, le planning, les statistiques et des notifications configurables dans une interface pensée pour le mobile et l'affichage Always-On.

> [!IMPORTANT]
> Le socle Expo/Fastify, les adaptateurs et la collecte PostgreSQL 2026 sont opérationnels. La feuille de route détaillée est disponible dans [PLAN.md](PLAN.md).

## Objectifs

- Suivre la cagnotte globale et les cagnottes individuelles en direct.
- Retrouver, rechercher et mettre en favoris les streamers participants.
- Consulter les donation goals et leur progression.
- Comparer les courbes de collecte 2025 et 2026 sur un même axe temporel.
- Afficher un tableau de bord paysage Always-On utilisable comme écran secondaire.
- Recevoir des alertes granulaires : paliers, débuts de live, gros dons et récapitulatifs.
- Continuer à fonctionner en mode dégradé lorsqu'une source tierce est indisponible.

## Architecture cible

Le projet prendra la forme d'un monorepo composé de deux parties :

- une application **React Native / Expo** en TypeScript, avec Expo Router, TanStack Query, Zustand et NativeWind ;
- un backend **Node.js / Fastify** avec PostgreSQL, distribué par Docker et destiné à être déployé via Dockploy.

Le backend centralisera la collecte des différentes sources, conservera les séries temporelles et pilotera les notifications Expo. L'application privilégiera ce backend et conservera localement le dernier état valide.

```text
src/app/                  routes et écrans Expo Router
src/                      API, composants, état local et cache mobile
src/content/              snapshots versionnés (goals 2026, planning 2026, courbe historique 2025)
server/                   backend Fastify, jobs et accès PostgreSQL
docker-compose.yml        déploiement du backend et de PostgreSQL (Dockploy)
docker-compose.override.yml  port 3000 publié en local uniquement
scripts/                  imports ponctuels des snapshots src/content/
```

## Sources de données envisagées

- API publique de `zevent.fr` pour l'état officiel de l'événement ;
- API publique de Streamlabs Charity pour les informations complémentaires et les dons récents ;
- données communautaires InGDoc / EvenMoreStats pour les donation goals et le planning ;
- snapshots versionnés pour l'historique et le fonctionnement hors ligne.

Les API tierces non documentées seront interrogées uniquement par le backend, avec validation, limitation de fréquence, cache persistant et dernier snapshot valide. Leur disponibilité et leurs conditions de réutilisation ne sont pas garanties.

## Feuille de route

1. Initialiser l'application Expo et le backend Fastify.
2. Mettre en place les adaptateurs de données, leur validation et le cache.
3. Déployer la collecte et le stockage PostgreSQL.
4. Construire le dashboard, les favoris et les fiches streamer.
5. Ajouter les statistiques et la comparaison 2025/2026.
6. Implémenter le mode Always-On, les notifications et les récapitulatifs.
7. Produire et tester un APK avec EAS Build.

Le détail des priorités, décisions techniques, risques et critères d'acceptation se trouve dans [PLAN.md](PLAN.md).

## Développement local

Prérequis : Node.js 24+, npm et Docker.

```bash
# Application mobile
npm install
npm start

# Backend seul en mode développement
npm --prefix server install
npm run server:dev
```

Le démarrage complet avec PostgreSQL se fait à partir d'une copie locale de `.env.example` :

```bash
docker compose up --build
```

`docker compose` fusionne automatiquement `docker-compose.override.yml` en l'absence de `-f` explicite :
le service `server` est alors publié sur `http://localhost:${SERVER_PORT:-3000}`. Ce fichier n'est
utile qu'en local (voir section suivante pour Dockploy).

Le backend expose `GET /healthz` pour la santé du processus et `GET /readyz` pour vérifier sa connexion PostgreSQL. La suite de vérification locale s'exécute avec `npm run check` (types, tests mobiles `npm test`, build et tests du serveur).

Pour régénérer les snapshots versionnés dans `src/content/` (courbe 2025, donation goals et planning
2026, cf. PLAN.md §1.3, §1.5 et §1.6) :

```bash
npm run content:import-history-2025
npm run content:export-goals-2026
npm run content:export-planning-2026
```

## Déploiement Dockploy

Créer un projet **Docker Compose** pointant vers ce dépôt et conserver `docker-compose.yml` comme
fichier de composition (Dockploy l'utilise seul, sans fusionner `docker-compose.override.yml` : aucun
port n'est donc publié sur l'hôte, le service reste joignable uniquement via le domaine HTTPS choisi
côté Dockploy). Définir au minimum `POSTGRES_PASSWORD` avec une valeur longue et aléatoire ;
`POSTGRES_DB`, `POSTGRES_USER`, `LOG_LEVEL`, `COLLECTOR_ENABLED`, `COLLECT_INTERVAL_MS`,
`GOALS_SYNC_ENABLED`, `GOALS_SYNC_INTERVAL_MS`, `PLANNING_SYNC_ENABLED` et
`PLANNING_SYNC_INTERVAL_MS` sont optionnelles et documentées dans `.env.example`
(`SERVER_PORT` n'a d'effet qu'en local). Le volume nommé `postgres-data` conserve les échantillons
lors des redéploiements.

Après le premier déploiement, vérifier la santé et l'accumulation pendant au moins une minute :

```bash
npm --prefix server run verify:deployment -- https://api.example.org
```

La commande échoue si `/healthz` ou `/readyz` ne répond pas correctement, ou si le nombre de points
retourné par `/v1/collection-status` n'augmente pas. Les autres routes disponibles sont `/v1/state`,
`/v1/timeseries?edition=2026&resolution=1m`, `/v1/goals` (synchronisée toutes les 5 min) et
`/v1/planning` (toutes les 10 min), toutes deux alimentées par EvenMoreStats/InGDoc (source
communautaire non officielle, cf. PLAN.md §1.3 et §1.6).

Les récapitulatifs sont disponibles via les routes authentifiées `GET /v1/recaps`,
`GET /v1/recaps/:id`, `POST /v1/recaps/generate` et `GET`/`PUT /v1/recap-schedules`.

Les dons archivés depuis le feed Streamlabs alimentent des routes publiques de lecture :
`GET /v1/donations/recent`, `/v1/donations/top?window=1h|6h|24h|all`, `/v1/donations/largest`,
`/v1/donations/stats`, `/v1/streamers/:twitch/donations`, `/v1/streamers/momentum?window=10`,
`/v1/timeseries/rate?bucket=60` et `/v1/timeseries/streamers?twitch=a,b`. Le feed ne montrant
qu'une centaine de dons par relevé, chaque réponse indique le nombre de dons observés (`observed`).
`RECORD_DONATION_MIN_CENTS` (1 000 € par défaut) fixe le plancher de l'alerte « nouveau record ».
Le worker `RECAPS_ENABLED` (intervalle `RECAPS_INTERVAL_MS`) produit les récaps programmés dans le
fuseau de chaque appareil et envoie un push avec deep link vers leur détail.

## Notifications push

La détection et l'envoi se font côté serveur : une alerte arrive donc même application fermée.

- **Enregistrement de l'appareil** : l'application génère au premier lancement un `installationId`
  et un secret aléatoire, conservés localement, puis appelle `PUT /v1/device` avec le token Expo, le
  fuseau et la plateforme. Les écritures suivantes (`GET`/`PUT /v1/preferences`, `DELETE /v1/device`)
  s'authentifient avec `x-installation-id` et `Authorization: Bearer <secret>`. Le serveur ne
  conserve qu'une empreinte salée du secret ; il n'y a pas de compte utilisateur en V1.
- **Préférences** : catégories indépendantes (paliers de la cagnotte avec pas configurable, démarrage
  de live d'un favori, palier de favori atteint ou proche, gros dons avec seuil global et surcharge
  par streamer), plage silencieuse évaluée dans le fuseau de l'appareil, son, vibration, interrupteur
  général et suspension temporaire. Réglages dans l'app : onglet Accueil → icône cloche.
- **Déduplication** : chaque événement détecté porte une clé unique (`detected_events.dedupe_key`) et
  chaque envoi une contrainte `(installation_id, event_id)` posée *avant* l'appel à Expo. Deux
  collectes identiques ne peuvent donc pas produire deux notifications.
- **Reçus Expo** : traités périodiquement (`PUSH_RECEIPTS_INTERVAL_MS`) ; un token rejeté
  (`DeviceNotRegistered`) est effacé automatiquement.
- **Amorçage** : au tout premier passage, les paliers déjà atteints et le feed de dons initial sont
  enregistrés sans notification, et un don plus vieux que `DONATIONS_MAX_AGE_MS` n'est plus annoncé.

Variables serveur associées : `NOTIFICATIONS_ENABLED`, `EXPO_ACCESS_TOKEN` (facultatif),
`GOAL_NEAR_RATIO`, `PUSH_RECEIPTS_INTERVAL_MS`, `DONATIONS_ENABLED`, `DONATIONS_INTERVAL_MS`,
`DONATIONS_MAX_AGE_MS` et `STREAMLABS_TEAM_ID`.

Côté Android, la réception exige une build EAS : `eas init` (pour `extra.eas.projectId`) puis un
projet FCM associé au compte Expo. Sans cela, l'application reste utilisable et l'écran de réglages
indique pourquoi l'enregistrement échoue.

## Statut

✅ Étapes 1 à 4 terminées côté dépôt — collecte officielle 2026, stockage PostgreSQL, déploiement
Docker/Dockploy vérifiable, synchronisation des donation goals et snapshots versionnés (courbe 2025,
secours goals 2026). Le déploiement sur le serveur dédié reste à déclencher avec les accès de
l'instance Dockploy.

✅ Étape 5 (PLAN.md §6) — application mobile : dashboard temps réel (cagnotte animée, viewers,
websiteMode, bandeau `marquee`), favoris persistés, liste des streamers (recherche + tri) et fiche
streamer (paliers InGDoc avec progression, deep link Twitch, lien de don). Données consommées via le
backend (`EXPO_PUBLIC_API_BASE_URL`, défaut `https://zevent-api.lofgplv.fr`), TanStack Query en
polling 15 s, Zustand + AsyncStorage pour les favoris. Aucune version mobile installable n'est encore
publiée (EAS Build : étape 11).

✅ Étape 6 (PLAN.md §6) — statistiques : superposition des courbes 2025/2026 alignées sur le temps
écoulé (euros ou % du total 2025), repères de paliers, projection désactivable, repères 2026 et
tableau des éditions précédentes avec la provenance des totaux.

✅ Étape 7 (PLAN.md §6) — mode AlwaysOn : écran secondaire `/always-on` (fond AMOLED noir, cagnotte
géante, progression sur 1 h, viewers, streamers en live, heure et top 5 des favoris), écran maintenu
allumé, verrouillage d'orientation paysage/portrait relâché en quittant l'écran, gradation en quatre
paliers et déplacement lent anti burn-in. La mise en page s'adapte au ratio d'écran (une ou deux
colonnes) via `src/lib/always-on-layout.ts`, couvert par `npm test` sur sept ratios (2:3, 16:9, 9:20
et 4:3, portrait et paysage, avec et sans encoche).

L'écran propose cinq dispositions cyclables (bouton, double tap ou balayage) :

| Disposition | Contenu |
| --- | --- |
| Vue d'ensemble | cagnotte géante, progression 1 h, prochain palier rond, viewers / live / heure, favoris |
| Cagnotte XXL | la cagnotte et le prochain palier, rien d'autre, lisible de loin |
| Focus streamer | un favori en grand : avatar, live, jeu, viewers, cagnotte perso, rang et part du global, prochain donation goal, show en cours |
| Planning | les shows en cours et à venir, avec compte à rebours |
| Cycle auto | alterne les trois premières toutes les 30 s |

Le Focus se choisit en touchant un favori sur l'écran, en balayant horizontalement, depuis le bouton
« écran secondaire » d'une fiche streamer, ou par rotation automatique (30 s / 1 min / 3 min). Le
confort d'un écran laissé allumé passe par `expo-brightness` (vraie luminosité, restaurée en sortant ;
repli sur le voile noir quand le module est absent), une gradation nocturne automatique (23 h → 8 h),
une gradation sous 20 % de batterie hors charge (`expo-battery`) et un verrou tactile façon kiosque
(appui long pour déverrouiller). Gestes : double tap = disposition suivante, balayage = favori ou
disposition, appui long = quitter.

✅ Étape 8 (PLAN.md §6) — notifications : enregistrement du token Expo, préférences granulaires
synchronisées avec le backend et moteur d'alertes dédupliqué (paliers globaux, lives des favoris,
donation goals atteints ou proches, gros dons issus du feed Streamlabs). Voir la section
« Notifications push » ci-dessus.

✅ Étape 10 (PLAN.md §6) — planning réel : synchronisation des « shows » InGDoc/EvenMoreStats côté
backend (`GET /v1/planning`, table `planning_snapshots`), fusion avec le champ `calendar` officiel de
`zevent.fr/api/` dès qu'il devient exploitable (il est resté vide au lancement de l'édition 2026), et
écran mobile regroupé par journée en heure de Paris : badge « en cours », compte à rebours, filtre
« À venir / Tout », participants cliquables (fiche interne ou Twitch) et repli sur le snapshot
embarqué `src/content/planning-2026.json` quand le backend est injoignable.

## Avertissement

Ce projet est communautaire et non officiel. Il n'est ni affilié ni associé au ZEvent, à ses organisateurs ou aux services tiers mentionnés.
