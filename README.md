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
src/content/              snapshots versionnés (goals 2026, courbe historique 2025)
server/                   backend Fastify, jobs et accès PostgreSQL
docker-compose.yml        déploiement du backend et de PostgreSQL (Dockploy)
docker-compose.override.yml  port 3000 publié en local uniquement
scripts/                  imports ponctuels des snapshots src/content/
```

## Sources de données envisagées

- API publique de `zevent.fr` pour l'état officiel de l'événement ;
- API publique de Streamlabs Charity pour les informations complémentaires et les dons récents ;
- données communautaires InGDoc / EvenMoreStats pour les donation goals ;
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

Pour régénérer les snapshots versionnés dans `src/content/` (courbe 2025 et donation goals 2026,
cf. PLAN.md §1.3 et §1.5) :

```bash
npm run content:import-history-2025
npm run content:export-goals-2026
```

## Déploiement Dockploy

Créer un projet **Docker Compose** pointant vers ce dépôt et conserver `docker-compose.yml` comme
fichier de composition (Dockploy l'utilise seul, sans fusionner `docker-compose.override.yml` : aucun
port n'est donc publié sur l'hôte, le service reste joignable uniquement via le domaine HTTPS choisi
côté Dockploy). Définir au minimum `POSTGRES_PASSWORD` avec une valeur longue et aléatoire ;
`POSTGRES_DB`, `POSTGRES_USER`, `LOG_LEVEL`, `COLLECTOR_ENABLED`, `COLLECT_INTERVAL_MS`,
`GOALS_SYNC_ENABLED` et `GOALS_SYNC_INTERVAL_MS` sont optionnelles et documentées dans `.env.example`
(`SERVER_PORT` n'a d'effet qu'en local). Le volume nommé `postgres-data` conserve les échantillons
lors des redéploiements.

Après le premier déploiement, vérifier la santé et l'accumulation pendant au moins une minute :

```bash
npm --prefix server run verify:deployment -- https://api.example.org
```

La commande échoue si `/healthz` ou `/readyz` ne répond pas correctement, ou si le nombre de points
retourné par `/v1/collection-status` n'augmente pas. Les autres routes disponibles sont `/v1/state`,
`/v1/timeseries?edition=2026&resolution=1m` et `/v1/goals`, alimentée toutes les 5 min par
synchronisation avec EvenMoreStats/InGDoc (source communautaire non officielle, cf. PLAN.md §1.3).

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
allumé, verrouillage d'orientation paysage/portrait relâché en quittant l'écran, gradation logicielle
en quatre paliers et déplacement lent anti burn-in. La mise en page s'adapte au ratio d'écran
(une ou deux colonnes) via `src/lib/always-on-layout.ts`, couvert par `npm test` sur sept ratios
(2:3, 16:9, 9:20 et 4:3, portrait et paysage, avec et sans encoche).

## Avertissement

Ce projet est communautaire et non officiel. Il n'est ni affilié ni associé au ZEvent, à ses organisateurs ou aux services tiers mentionnés.
