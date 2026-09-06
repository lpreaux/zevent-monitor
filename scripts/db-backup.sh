#!/usr/bin/env bash
# Sauvegarde PostgreSQL du service `postgres` de docker-compose.yml, avec empreinte et
# manifeste de contrôle (phase 0 du plan docs/plans/web-backoffice-monorepo.md).
#
# Le manifeste enregistre le nombre de lignes des tables métier : il sert de référence au
# test de restauration (scripts/db-restore.sh), qui compare la copie restaurée à l'original.
#
# Usage :
#   scripts/db-backup.sh [dossier-de-sortie]
# Variables :
#   PG_SERVICE    nom du service Compose (défaut : postgres)
#   PG_CONTAINER  identifiant de conteneur, court-circuite la résolution Compose
#   BACKUP_KEEP   nombre de sauvegardes conservées dans le dossier (défaut : 7)
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${1:-${root_dir}/backups}"
pg_service="${PG_SERVICE:-postgres}"
backup_keep="${BACKUP_KEEP:-7}"

# .env fournit POSTGRES_USER / POSTGRES_DB en local comme sur le serveur Dockploy.
if [[ -f "${root_dir}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${root_dir}/.env"
  set +a
fi
pg_user="${POSTGRES_USER:-zevent}"
pg_db="${POSTGRES_DB:-zevent}"

container="${PG_CONTAINER:-}"
if [[ -z "${container}" ]]; then
  container="$(docker compose -f "${root_dir}/docker-compose.yml" ps -q "${pg_service}" 2>/dev/null || true)"
fi
if [[ -z "${container}" ]]; then
  echo "Conteneur PostgreSQL introuvable. Renseigner PG_CONTAINER ou lancer docker compose." >&2
  exit 1
fi

mkdir -p "${out_dir}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="${out_dir}/${pg_db}-${stamp}.dump"
manifest_file="${out_dir}/${pg_db}-${stamp}.manifest.json"

echo "Sauvegarde de ${pg_db} depuis ${container:0:12} vers ${dump_file}"
# Format custom : restauration sélective possible et compression intégrée.
docker exec -i "${container}" pg_dump -U "${pg_user}" -d "${pg_db}" \
  --format=custom --no-owner --no-privileges > "${dump_file}"

# Empreinte enregistrée avec un chemin relatif : une sauvegarde déplacée ou recopiée reste
# vérifiable, et c'est bien le fichier voisin qui est contrôlé, pas son chemin d'origine.
(cd "${out_dir}" && sha256sum "$(basename "${dump_file}")" > "$(basename "${dump_file}").sha256")

# Comptages de référence : toute restauration doit les retrouver à l'identique.
counts_sql="SELECT json_object_agg(relname, n) FROM (
  SELECT c.relname, (xpath('/row/c/text()', query_to_xml(
    format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS n
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND n.nspname = 'public'
) t;"
counts="$(docker exec -i "${container}" psql -U "${pg_user}" -d "${pg_db}" -tAc "${counts_sql}")"
version="$(docker exec -i "${container}" psql -U "${pg_user}" -d "${pg_db}" -tAc 'SHOW server_version')"
size_bytes="$(wc -c < "${dump_file}" | tr -d ' ')"

cat > "${manifest_file}" <<JSON
{
  "database": "${pg_db}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "serverVersion": "${version}",
  "dumpFile": "$(basename "${dump_file}")",
  "sizeBytes": ${size_bytes},
  "sha256": "$(cut -d' ' -f1 < "${dump_file}.sha256")",
  "rowCounts": ${counts:-null}
}
JSON

echo "Manifeste : ${manifest_file}"

# Rotation : ne garder que les BACKUP_KEEP sauvegardes les plus récentes.
mapfile -t obsolete < <(ls -1t "${out_dir}/${pg_db}-"*.dump 2>/dev/null | tail -n "+$((backup_keep + 1))")
for old in "${obsolete[@]:-}"; do
  [[ -n "${old}" ]] || continue
  rm -f "${old}" "${old}.sha256" "${old%.dump}.manifest.json"
  echo "Sauvegarde expirée supprimée : $(basename "${old}")"
done

echo "Terminé : $(du -h "${dump_file}" | cut -f1)"
