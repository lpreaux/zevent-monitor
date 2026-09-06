# ZEvent Monitor 2026 — Plan de projet

App Android (React Native / Expo) pour suivre en temps réel le ZEvent 2026
(10e et dernière édition, du vendredi 4 septembre 18h au lundi 7 septembre au petit matin,
concert d'ouverture le 3 septembre 20h).

## Décisions produit actées

- Backend accepté : service **Dockerisé**, déployé sur le serveur dédié via **Dockploy**.
- Distribution Android via **EAS Build** (compte Expo déjà disponible), APK installable directement.
- Comparaison 2025/2026 avec une **vraie courbe superposée**.
- AlwaysOn avec un **mode paysage plein écran** conçu comme écran secondaire.
- Notifications configurables finement : paliers globaux, favoris en live, paliers des favoris,
  gros dons au-dessus d'un seuil et récapitulatifs programmables.
- Donation goals : privilégier la source communautaire InGDoc/EvenMoreStats, avec cache et copie de
  secours, plutôt qu'une ressaisie complète manuelle.

## 1. Sources de données (vérifiées le 3 septembre 2026)

### 1.1 API officielle zevent.fr — `GET https://zevent.fr/api/`
Publique, sans authentification, `Cache-Control: max-age=15` (rafraîchissement utile toutes les 15 s).
`https://zevent.fr/api/app` renvoie exactement la même charge utile.

```jsonc
{
  "live": [                       // 337 streamers
    {
      "twitch_id": "44842076",
      "display": "Aducine",
      "twitch": "aducine",         // login Twitch (deep link twitch.tv/<twitch>)
      "profileUrl": "https://static-cdn.jtvnw.net/...png",
      "online": false,
      "game": "Offline",           // jeu / catégorie en cours
      "viewersAmount": { "number": 0, "formatted": "0" },
      "streamlabsId": "9565...",   // id membre Streamlabs Charity (peut être null)
      "donationUrl": "https://zevent.fr/don/aducine",
      "ref": "JcxwUJBKbfagyJX7hHeU3g",
      "donationAmount": { "number": 0, "formatted": "0 €" }   // cagnotte perso
    }
  ],
  "globalDonationUrl": "https://zevent.fr/don",
  "streamlabsCampaignId": "945347494282402228",
  "donationAmount": { "number": 0, "formatted": "0 €" },      // cagnotte globale
  "viewersCount":   { "number": 0, "formatted": "0" },        // viewers cumulés
  "calendar": [],                 // planning (vide avant lancement, structure à découvrir au J0)
  "marquee": null,                // bandeau d'annonce
  "widgetVersionId": 3,
  "eventSourceDisabled": false,
  "websiteMode": "offline",       // "offline" | "concert" | "online"
  "eventSourceWhitelist": ["cagnotte:global"]
}
```

Notes :
- `websiteMode` pilote l'état de l'app (avant / concert / live).
- Les champs `eventSource*` laissent penser à un flux SSE côté site, mais aucun endpoint n'est exposé
  dans les bundles JS. On part sur du **polling 15 s**.
- **Aucune trace de donation goals** dans cette API ni dans les bundles du site. Voir 1.3.
- `calendar` **est resté vide après l'ouverture** (vérifié le 3 septembre 2026 à 21h40, `websiteMode`
  déjà passé à `concert`). Le routeur du site n'expose d'ailleurs aucune route `/planning` : le repli
  WebView initialement prévu vers `zevent.fr/planning` n'existe pas. Le planning réel vient donc
  d'EvenMoreStats (§1.6) ; `calendar` reste lu par un parseur tolérant au cas où il se remplirait.

### 1.2 API Streamlabs Charity (publique, non documentée, JSON)
Base : `https://streamlabscharity.com/api/v1/`

| Endpoint | Contenu | Usage |
|---|---|---|
| `teams/@zevent-2026/zevent-2026` | team 2026 : `amount_raised` (en **centimes**), campagne, dates, cause (Fondation de France) | cagnotte globale de secours |
| `teams/@zevent-2025/zevent-2025` | idem 2025 : `amount_raised: 1663629690` → 16 636 296,90 € | stats édition précédente |
| `teams/@zevent-2024/zevent-2024` | idem 2024 : 10 085 785,34 € | historique |
| `teams/{teamId}/members?page=N` | 20/page, 303 membres 2026 (`user.display_name`, `slug`, `is_live`, `livestream.viewers`, `platforms.twitch`) | roster, viewers |
| `teams/{teamId}/donations` | ~100 derniers dons : `display_name`, `converted_amount` (centimes), `comment`, `country`, `created_at`, `z_event_name.twitch_display_name` | **feed de dons en direct** |

Ids : team 2026 `945347664248182491` (campagne `945347494282402228`), team 2025 `834830628347318649`.
Les éditions 2021–2023 ne sont pas sur Streamlabs Charity (→ données figées, cf. 1.4).

### 1.3 InGDoc / EvenMoreStats — donation goals et historique

`https://zevent.gdoc.fr/` est le site communautaire des **InGDocs** (« Les Ingés du GDoc »), un
collectif de viewers qui documente des événements communautaires depuis plusieurs années. Le site
indique explicitement qu'il n'est ni officiel ni lié au staff du ZEvent. Équipe 2026 affichée :
Avrell, Maniarr, Neereos, Proxyfil, Ullie, Worazme et Yenaman.

Le frontend Nuxt charge une API JSON publique mais non documentée hébergée par EvenMoreStats :

| Endpoint observé | Contenu | Usage envisagé |
|---|---|---|
| `GET /events/{eventId}/donation_goals/overview` | participants, cagnotte, nombre de goals, prochain goal, Twitch | synchronisation globale |
| `GET /participations/{participationId}/donation_goals` | liste complète : nom, montant en centimes, catégorie, état, liens | paliers d'un streamer |
| `GET /stats/amount_raised?event_id={eventId}` | cagnotte globale et montants par participation | source communautaire de contrôle |

Base observée le 3 septembre 2026 : `https://api.ppr.evenmorestats.fr`. Le sous-domaine `ppr`,
l'absence de documentation et l'absence de contrat de stabilité interdisent d'en faire une dépendance
directe de l'app. Le backend l'interroge à fréquence raisonnable, valide les réponses, les met en cache
et conserve le dernier snapshot valide. Avant diffusion publique, demander si possible l'accord des
InGDocs/EvenMoreStats et les créditer dans l'app.

Stratégie donation goals :

1. source primaire : synchronisation InGDoc/EvenMoreStats par le backend ;
2. snapshot versionné `content/goals-2026.json`, exporté depuis cette source, pour démarrage hors ligne
   et panne de l'API ;
3. corrections éditoriales locales dans `content/goals-overrides.json` avec source et date ;
4. articles Rotek/Dexerto utilisés pour contrôle ponctuel, pas comme source à scraper.

Schéma proposé :
```jsonc
{
  "streamer": "anyme",
  "source": "ingdoc",
  "updatedAt": "2026-09-03T12:00:00Z",
  "goals": [
    { "id": "...", "amountCents": 200000, "label": "...", "category": "donation", "reached": false }
  ]
}
```
La progression = cagnotte personnelle officielle vs `amountCents / 100`. Ne pas persister `done`
comme vérité locale : recalculer l'état et conserver séparément l'identifiant de notification envoyée.

### 1.4 Historique des éditions (données figées dans l'app)
| Édition | Dates | Total | Streamers |
|---|---|---|---|
| 2016 (Projet Avengers) | 4–6 mars | 170 770 € | 16 |
| 2017 | 8–10 sept. | 451 851 € | 30 |
| 2018 | 9–11 nov. | 1 094 731 € | 37 |
| 2019 | 20–22 sept. | 3 509 878 € | 54 |
| 2020 | 16–18 oct. | 5 724 377 € | 54 |
| 2021 | 29–31 oct. | 10 064 480 € | 51 |
| 2022 | 9–11 sept. | 10 182 126 € | 57 |
| 2024 | 6–8 sept. | 10 145 881 € | 135 |
| 2025 | 5–7 sept. | 16 179 096 € (site) / 16 636 297 € (Streamlabs) | 327 |

### 1.5 Courbe historique 2025

Le site InGDoc 2025 charge
`https://cache.evenmorestats.fr/019d3f95-bd24-7e5d-861b-1de6243e3169/global.json`.
Ce fichier contient les séries `lan`, `remote` et `all` avec **332 points à intervalle de 10 minutes**,
du 5 septembre 2025 à 18h00 au 8 septembre à 01h10 (Europe/Paris). La série `all` permet donc la vraie
courbe superposée demandée.

À importer une fois dans `content/history/zevent-2025.json` avec URL source, date de récupération et
checksum. L'app ne doit pas dépendre du cache tiers à chaque affichage. Pour comparer équitablement,
les deux courbes sont alignées sur **T+0 = ouverture de la collecte** et affichées soit en euros, soit
en pourcentage du total final. Les chiffres communautaires divergent légèrement selon la date et la
méthode de clôture : afficher la provenance du total retenu au lieu de mélanger les sources.

### 1.6 Planning des émissions — EvenMoreStats (vérifié le 3 septembre 2026)

`GET https://api.ppr.evenmorestats.fr/events/{eventId}/shows` renvoie le planning complet du week-end
(21 entrées au lancement 2026), non paginé :

```jsonc
[
  {
    "id": "01a00b12-eee6-73ae-abb9-2a006ebdc126",
    "name": "Concert ZEvent",
    "description": "",                                  // texte libre, parfois avec des liens
    "schedule": { "start": "2026-09-03T18:00:00Z", "end": "2026-09-03T21:30:00Z" },  // UTC
    "all_day": false,
    "participants": [
      {
        "streamer_id": "019d3f9d-…",
        "streamer_name": "LittleBigWhale",
        "profile_url": "https://static-cdn.jtvnw.net/…png",
        "role": "host",                                  // "host" | "guest" | "participant"
        "socials": { "twitch": { "id": "121652526", "login": "littlebigwhale" } },  // parfois {}
        "broadcaster": false
      }
    ]
  }
]
```

Mêmes réserves qu'au §1.3 (source communautaire, non documentée, sous-domaine `ppr`) : seul le
backend l'interroge, toutes les 10 min, avec validation, cache du dernier snapshot valide en base
(`planning_snapshots`) et snapshot embarqué `src/content/planning-2026.json` pour le hors-ligne.

Les horaires sont publiés en UTC mais vécus en heure de Paris : l'app convertit explicitement, sans
dépendre du fuseau de l'appareil (`src/lib/planning.ts`).

L'application streamer officielle `app.zevent.fr` (API `api.zevent.fr`, overlays, bidwar, tombola,
donation goals) est authentifiée et ne contient aucun planning exploitable côté public.

## 2. Stack technique

| Besoin | Choix |
|---|---|
| Framework | **Expo SDK 54+** (dev build, pas Expo Go à cause de certains modules natifs), TypeScript, `expo-router` |
| UI « shadcn » | **react-native-reusables** (port officiel de shadcn/ui pour RN) + **NativeWind v4** (Tailwind). shadcn/ui lui-même est web-only |
| Data fetching / polling | **TanStack Query** (`refetchInterval: 15000`, `refetchIntervalInBackground: false`) |
| État local / préférences | **Zustand** + `react-native-mmkv` (favoris, AlwaysOn, thème, préférences), synchronisées au backend pour les notifications |
| AlwaysOn | `expo-keep-awake` + verrouillage paysage optionnel, écran AMOLED noir et anti burn-in |
| Notifications | `expo-notifications` + **Expo Push Service** ; détection et planification côté backend |
| Graphiques | `victory-native` (Skia) ou `react-native-gifted-charts` |
| Historique local | `expo-sqlite` pour cache de lecture, récapitulatifs et fonctionnement dégradé |
| Animations | `react-native-reanimated` (compteur qui défile, barres de progression) |
| Build | EAS Build (APK profile `preview` pour install directe) |
| Backend | **Node.js TypeScript + Fastify**, PostgreSQL, job planifié interne, image Docker multi-stage |
| Déploiement | `docker-compose.yml` compatible Dockploy, volumes PostgreSQL, healthcheck et variables d'environnement |

## 3. Architecture

```
app/                      (expo-router)
  (tabs)/
    index.tsx             Dashboard
    streamers.tsx         Liste + recherche + favoris
    planning.tsx          Planning
    stats.tsx             Stats & comparaisons
    recaps.tsx            Historique des récapitulatifs
  streamer/[twitch].tsx   Fiche streamer (paliers, viewers, lien Twitch, dons)
  settings/
    notifications.tsx    Réglages granulaires, seuils et horaires
  always-on.tsx           Écran secondaire portrait/paysage
src/
  api/zevent.ts           fetch + zod schema de /api/
  api/streamlabs.ts       team, members, donations
  api/backend.ts          historique, préférences, push, récapitulatifs
  content/goals-2026.json snapshot de secours des paliers
  content/history/        courbe 2025 + métadonnées de provenance
  store/                  zustand (favoris, prefs)
  db/                     sqlite (cache et récapitulatifs)
  components/ui/          react-native-reusables
server/
  src/jobs/               collecte, détection d'événements, récapitulatifs, push
  src/routes/             état courant, timeseries, goals, planning, devices, prefs, recaps
  src/db/                 migrations et accès PostgreSQL
  Dockerfile
docker-compose.yml
```

### 3.1 Backend Dockerisé

Le backend devient une partie nécessaire du produit, pas une option. Un seul collecteur central évite
que chaque téléphone interroge agressivement les sources et permet courbes, notifications et récaps
même lorsque l'app est fermée.

- interrogation de `zevent.fr/api/` toutes les **15 s** pendant l'événement ;
- conservation d'un point brut lors d'un changement et d'un point au moins toutes les minutes ;
- agrégation 1 min pour le direct, puis 5/10 min pour l'historique long terme ;
- interrogation du feed Streamlabs toutes les 15–30 s, avec déduplication par identifiant de don ;
- synchronisation InGDoc moins fréquente (goals toutes les 5 min, planning toutes les 10 min) et cache persistant ;
- PostgreSQL pour les séries, événements détectés, appareils, préférences, récaps et déduplication ;
- horodatage UTC en base, affichage et horaires utilisateur en `Europe/Paris` ;
- endpoints publics en lecture protégés par rate limiting ; écriture des préférences liée à un
  `installationId` et un secret généré au premier lancement (pas de compte utilisateur en V1) ;
- rétention : données brutes 7 jours, agrégats et récapitulatifs conservés sans limite en V1 ;
- `/healthz`, logs structurés, sauvegarde quotidienne PostgreSQL et redémarrage automatique.

Tables minimales : `samples`, `donations`, `detected_events`, `goals_snapshots`, `planning_snapshots`, `devices`,
`notification_preferences`, `favorites`, `recap_schedules`, `recaps`, `recap_contents`, `push_deliveries`.

### 3.2 API de l'app

| Route | Rôle |
|---|---|
| `GET /v1/state` | état courant normalisé et fraîcheur des sources |
| `GET /v1/timeseries?edition=2026&resolution=1m` | courbe 2026 |
| `GET /v1/timeseries?edition=2025&resolution=10m` | courbe historique figée |
| `GET /v1/goals` | paliers mis en cache + provenance |
| `GET /v1/planning` | planning mis en cache + provenance |
| `PUT /v1/device` | token Expo, fuseau et version de l'app |
| `PUT /v1/preferences` | favoris, seuils, catégories et horaires de récaps |
| `GET /v1/recaps` / `GET /v1/recaps/:id` | historique et détail |
| `DELETE /v1/recaps/:id` | retrait d'un récap créé à la main |
| `POST /v1/recaps/generate` | récap à la volée : `durationMinutes`, ou bornes `from`/`to` |
| `GET /v1/recap-days` / `GET /v1/recap-days/:key` | journées publiques 9 h → 9 h (sans appareil) |
| `GET /v1/donations/recent?limit&twitch&minCents&withComment` | feed des derniers dons observés |
| `GET /v1/donations/top?window=1h|6h|24h|all` | top donateurs nominatifs (anonymes exclus) |
| `GET /v1/donations/largest?window&twitch` | plus gros dons observés |
| `GET /v1/donations/stats?window&twitch` | médiane, moyenne, distribution par tranche, pays |
| `GET /v1/streamers/:twitch/donations` | synthèse, plus gros dons et derniers dons d'un streamer |
| `GET /v1/streamers/momentum?window=10` | streamers ayant le plus progressé sur N minutes, rangs |
| `GET /v1/timeseries/rate?bucket=60` | euros levés par tranche, depuis `samples` |
| `GET /v1/timeseries/streamers?twitch=a,b,c` | courbes de cagnotte par streamer (jusqu'à 5) |

Les routes de dons portent un bloc `observed` (nombre de dons vus, première/dernière date) : le feed
Streamlabs ne montrant qu'une centaine de dons par relevé, ces classements sont établis « d'après
les dons observés » et l'app l'affiche systématiquement. Les réponses sont mises en cache mémoire
15 à 60 s côté serveur.

Les mutations sont idempotentes. Aucun commentaire de don ni token push ne doit apparaître dans les
logs. Le service n'envoie une notification qu'après insertion réussie d'une clé de déduplication.

## 4. Fonctionnalités

### P0 — MVP (avant vendredi 18h)
- Dashboard : cagnotte globale (compteur animé), viewers, `websiteMode`, bandeau `marquee`,
  bouton **AlwaysOn** (keep-awake + thème noir + luminosité réduite optionnelle).
- Backend Dockerisé opérationnel dans Dockploy : collecte 2026, stockage PostgreSQL, endpoints état,
  courbe, goals et healthcheck.
- Sélection de streamers favoris ; cartes favoris sur le dashboard (cagnotte perso, live/offline, jeu, viewers).
- Liste des streamers : recherche, tri (cagnotte, viewers, en live), badge live.
- Fiche streamer : paliers InGDoc mis en cache avec barre de progression, bouton « Regarder sur Twitch » (deep link
  `twitch://stream/<login>` puis fallback web), bouton « Faire un don ».
- Planning : shows EvenMoreStats regroupés par journée (heure de Paris), fusionnés avec `calendar`
  officiel via un parseur tolérant, repli sur le snapshot embarqué.
- EAS Build configuré (`preview` APK + `production` AAB), test d'installation sur le téléphone.

### P1 — pendant le week-end
- Feed des derniers dons (Streamlabs `donations`) avec messages, filtrable par streamer favori. ✅
  Onglet **Dons** : feed (filtres favoris / ≥ 100 € / messages), classements (top donateurs par
  fenêtre, plus gros dons) et analyse (médiane, moyenne, distribution par tranche, pays).
- Stats : total par édition, courbe 2026 collectée côté serveur et **superposition 2025/2026** alignée
  sur le temps écoulé ; repères 1 M€/5 M€/10 M€, totaux finaux, nombre de streamers, €/streamer et
  viewers max. Toute projection est marquée comme estimation et peut être désactivée.
- Mode paysage « écran secondaire » : grosse cagnotte, delta récent, top 5 favoris, live/planning en
  cours ; plein écran, AMOLED, keep-awake et léger déplacement anti burn-in.
- Notifications push granulaires, chaque catégorie étant désactivable indépendamment :
  - cagnotte globale : liste de seuils ou pas configurable (par défaut chaque million) ;
  - favori : démarrage de live ;
  - favori : donation goal atteint ou prochain palier proche ;
  - favori : gros don reçu, avec seuil global et surcharge possible par streamer ;
  - plages silencieuses, son/vibration et bouton « tout suspendre ».
- Récapitulatifs : page dédiée, historique local + serveur, notification résumant l'information
  principale avec deep link vers le détail.
- Horaire par défaut : **09h00 Europe/Paris**, récapitulant les 24 h précédentes. L'utilisateur peut
  ajouter autant d'horaires que nécessaire (ex. 09h, 17h, 20h, 00h) ; chaque récap couvre la période
  depuis le précédent horaire programmé, sans doublon.
- **Journées de l'événement** : l'application publie un récap par tranche de **9 h à 9 h, heure de
  Paris**, accessible sans appareil enregistré et depuis l'ouverture de la collecte. La frontière à
  9 h garde la nuit attachée à la soirée qui la précède, et le fuseau fixe fait que « Samedi » désigne
  la même période pour tout le monde — condition pour partager le contenu et le calculer une fois.
  Les bornes viennent de la collecte réelle (`min`/`max(sampled_at)`), pas du calendrier annoncé ;
  une tranche d'ouverture de moins de six heures est reversée dans la journée suivante. La journée en
  cours est recalculée derrière un cache mémoire court, les journées closes sont pré-générées par le
  planificateur.
- Génération à la volée sur une durée choisie (1 h, 3 h, 6 h, 12 h, 24 h ou valeur personnalisée),
  **ou sur des bornes explicites** pour revenir sur un moment précis du week-end une fois passé.
  Le récap est déterministe en V1 : progression globale, seuils franchis, gros dons, nouveaux lives,
  goals atteints, top progressions et moments forts. Pas de dépendance à un LLM. Le contenu v3 ajoute
  la courbe de la période (pas adapté à la durée, charge utile constante), la meilleure heure, la part
  de la cagnotte apportée et les dons observés du feed (top donateurs, moyenne, plus gros don).
- **Contenu mutualisé, affichage personnel** : le contenu ne dépend que de la période, jamais de
  l'appareil. Il est donc calculé une seule fois et partagé anonymement (`recap_contents`, clé
  `period_start`/`period_end`) : deux utilisateurs sur la même plage — le cas courant, les horaires
  proposés étant les mêmes — réutilisent le même calcul. La personnalisation (favoris mis en tête,
  lives et goals filtrés) se fait à l'affichage, dans l'app, à partir des favoris locaux.
- La notification « récap prêt » est une catégorie de préférences à part entière (`recaps`), réglée
  dans le menu Notifications : elle peut être coupée ou soumise à la plage silencieuse sans empêcher
  la génération, le récap restant consultable dans l'historique.
- Widget écran d'accueil Android (cagnotte globale) via `react-native-android-widget`.

### P2 — idées bonus
- Top donateurs / top streamers du moment (delta sur 10 min) pour repérer les moments forts. ✅
  (« Top du moment » sur le dashboard avec évolution de rang, tri « En forme » dans la liste.)
- Visualisations : rythme de collecte €/tranche (Stats), courbe de cagnotte et dons reçus sur la
  fiche streamer, comparaison de jusqu'à 3 favoris sur le même axe (Stats). ✅
- Notification « nouveau record » quand un don dépasse le plus gros don observé
  (`RECORD_DONATION_MIN_CENTS`, 1 000 € par défaut ; catégorie `recordDonations`). ✅
- Page associations (Fondation de France + liste historique, liens).
- Partage d'une carte image « cagnotte à l'instant T ». ✅ (`/share-card`, capture via
  `react-native-view-shot` + `expo-sharing`, repli texte ; nécessite une nouvelle build native.)
- Thèmes : sombre AMOLED, ZEvent (violet), clair.
- Synchronisation multi-appareils via compte optionnel (hors V1).

## 5. Risques
- `calendar` officiel resté vide au lancement 2026 et route `zevent.fr/planning` inexistante → le
  planning repose sur EvenMoreStats (§1.6), avec snapshot embarqué et lien vers zevent.gdoc.fr.
- Streamlabs : API non documentée, peut renvoyer 500 ou changer → toujours facultatif.
- InGDoc/EvenMoreStats : source communautaire non documentée, endpoint actuellement nommé `ppr`,
  licence/réutilisation à confirmer → cache backend, snapshot embarqué, crédit et fonctionnement dégradé.
- Les totaux historiques 2025 diffèrent entre affichages/sources → figer une valeur et sa provenance,
  sans corriger artificiellement la série.
- Rate limiting : le mobile privilégie notre backend ; seul le collecteur central appelle les sources
  à haute fréquence, avec backoff et dernier état valide.
- Android ne garantit pas le polling local en arrière-plan → toutes les alertes fiables passent par
  Expo Push et le backend ; les tâches locales ne servent que de secours.
- Gros dons : le feed Streamlabs ne montre qu'une fenêtre récente → polling fréquent, déduplication et
  signalement « données possiblement incomplètes » après une interruption prolongée.
- Fuseaux/changement de jour : stocker en UTC, calculer les horaires avec le fuseau de l'appareil et
  tester explicitement minuit ainsi que les changements d'heure.
- Push : token expiré, reçu invalide ou doublon → traiter les receipts Expo, désactiver les tokens
  invalides et utiliser des clés d'idempotence.

## 6. Planning de réalisation
1. Initialiser le monorepo Expo + serveur, NativeWind, navigation, Fastify, PostgreSQL et Docker.
2. Implémenter les adaptateurs de sources avec schémas Zod, fixtures et cache du dernier état valide.
3. Déployer le backend dans Dockploy et vérifier immédiatement que la collecte 2026 s'accumule.
4. Importer et figer la courbe InGDoc 2025 ; exporter un snapshot des donation goals 2026.
5. Construire dashboard, favoris, liste et fiche streamer.
6. Construire stats et courbe 2025/2026 superposée.
7. Ajouter AlwaysOn paysage et tests sur plusieurs ratios d'écran.
8. Ajouter enregistrement du token Expo, préférences granulaires et moteur de notifications dédupliqué.
9. Ajouter génération, planification, historique et deep links des récapitulatifs.
10. Implémenter le planning réel au lancement avec fallback. ✅
11. Produire l'APK EAS `preview`, tester installation, veille, rotation, push et reprise réseau.

## 7. Critères d'acceptation essentiels

- Une fermeture complète de l'app n'interrompt ni la courbe 2026, ni les alertes push, ni les récaps.
- Deux collectes identiques ne produisent jamais deux notifications pour le même événement.
- La comparaison affiche bien 2025 et 2026 sur le même axe de temps écoulé et indique la source 2025.
- L'app reste utilisable avec le dernier état connu si Streamlabs ou InGDoc est indisponible.
- Chaque type d'alerte et chaque favori peut être activé/désactivé sans modifier les autres réglages.
- Les horaires 09h/17h/20h/00h produisent quatre périodes contiguës sans trou ni chevauchement.
- Un récap manuel sur les X dernières heures est consultable ensuite dans l'historique.
- Le mode paysage reste allumé, lisible à distance et ne force pas le paysage sur les autres écrans.
