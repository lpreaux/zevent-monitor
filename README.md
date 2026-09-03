# ZEvent Monitor

Application Android dédiée au suivi en temps réel du ZEvent 2026. Elle réunira la cagnotte globale, les streams favoris, les donation goals, le planning, les statistiques et des notifications configurables dans une interface pensée pour le mobile et l'affichage Always-On.

> [!IMPORTANT]
> Le projet est actuellement en phase de conception. Le code de l'application et du backend n'est pas encore initialisé. La feuille de route détaillée est disponible dans [PLAN.md](PLAN.md).

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
app/                 routes et écrans Expo Router
src/                 API, composants, état local et cache mobile
server/              backend Fastify, jobs et accès PostgreSQL
content/             snapshots et données historiques versionnées
docker-compose.yml   déploiement du backend et de PostgreSQL
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

## Statut

🚧 Conception en cours — aucune version installable n'est encore disponible.

## Avertissement

Ce projet est communautaire et non officiel. Il n'est ni affilié ni associé au ZEvent, à ses organisateurs ou aux services tiers mentionnés.
