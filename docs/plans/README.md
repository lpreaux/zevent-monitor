# Plans du projet

Ce dossier contient les plans de produit et d'architecture transverses au monorepo. Il reste à la
racine dans la future structure afin qu'un plan puisse couvrir plusieurs applications et packages.

## Convention

- Un fichier par initiative, nommé en `kebab-case` d'après son sujet : `web-backoffice-monorepo.md`.
- Un plan lié à une édition ou une échéance commence par celle-ci : `2026-mobile-app.md`.
- Aucun nouveau fichier générique `PLAN.md` : son rôle devient ambigu dès que plusieurs chantiers
  coexistent.
- Chaque plan commence par les métadonnées `title`, `status`, `scope`, `created` et `updated`.
- Les statuts autorisés sont `proposed`, `accepted`, `active`, `completed` et `superseded`.
- `scope` utilise les futurs noms de workspaces (`mobile`, `web`, `api`, `worker`) ou `monorepo`.
- Les décisions durables sont consignées dans le plan concerné. Lorsqu'elles sont remplacées, le
  plan précédent passe à `superseded` et pointe vers son successeur au lieu d'être supprimé.
- Les liens depuis le code et la documentation utilisent un chemin relatif complet sous
  `docs/plans/`.

## Index

| Plan | Statut | Périmètre |
| --- | --- | --- |
| [Application mobile ZEvent Monitor 2026](2026-mobile-app.md) | `active` | mobile, api |
| [Application web, back-office et monorepo](web-backoffice-monorepo.md) | `accepted` | monorepo, web, api, worker |
