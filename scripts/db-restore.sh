#!/usr/bin/env bash
# Restaure une sauvegarde produite par scripts/db-backup.sh et vérifie qu'elle est exploitable.
#
# Par défaut, la restauration se fait dans une base jetable : c'est le test de restauration
# exigé avant le premier backfill (phase 0 du plan docs/plans/web-backoffice-monorepo.md).
# La base de production n'est jamais touchée sans `--into <db> --force`.
#
# Usage :
#   scripts/db-restore.sh <fichier.dump> [--into <base>] [--force] [--keep]
# Variables :
#   PG_SERVICE    nom du service Compose (défaut : postgres)
#   PG_CONTAINER  identifiant de conteneur, court-circuite la résolution Compose
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg_service="${PG_SERVICE:-postgres}"

dump_file=""
target_db=""
force=0
keep=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --into) target_db="$2"; shift 2 ;;
    --force) force=1; shift ;;
    --keep) keep=1; shift ;;
    -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) dump_file="$1"; shift ;;
  esac
done

if [[ -z "${dump_file}" || ! -f "${dump_file}" ]]; then
  echo "Fichier de sauvegarde manquant ou introuvable." >&2
  exit 1
fi

if [[ -f "${root_dir}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${root_dir}/.env"
  set +a
fi
pg_user="${POSTGRES_USER:-zevent}"
pg_db="${POSTGRES_DB:-zevent}"
restore_db="${target_db:-${pg_db}_restore_check}"
is_check_run=0
[[ -z "${target_db}" ]] && is_check_run=1

if [[ "${restore_db}" == "${pg_db}" && "${force}" -ne 1 ]]; then
  echo "Restaurer par-dessus ${pg_db} exige --force." >&2
  exit 1
fi

container="${PG_CONTAINER:-}"
if [[ -z "${container}" ]]; then
  container="$(docker compose -f "${root_dir}/docker-compose.yml" ps -q "${pg_service}" 2>/dev/null || true)"
fi
if [[ -z "${container}" ]]; then
  echo "Conteneur PostgreSQL introuvable. Renseigner PG_CONTAINER ou lancer docker compose." >&2
  exit 1
fi

# Empreinte : une sauvegarde corrompue doit être détectée avant toute restauration.
if [[ -f "${dump_file}.sha256" ]]; then
  echo "Vérification de l'empreinte…"
  (cd "$(dirname "${dump_file}")" && sha256sum -c "$(basename "${dump_file}").sha256")
fi

psql_admin() { docker exec -i "${container}" psql -U "${pg_user}" -d postgres -tAc "$1"; }

echo "Restauration de $(basename "${dump_file}") dans ${restore_db}"
psql_admin "DROP DATABASE IF EXISTS \"${restore_db}\";" > /dev/null
psql_admin "CREATE DATABASE \"${restore_db}\";" > /dev/null
docker exec -i "${container}" pg_restore -U "${pg_user}" -d "${restore_db}" --no-owner --no-privileges < "${dump_file}"

# Comparaison au manifeste : une restauration réussie retrouve les mêmes comptages.
manifest_file="${dump_file%.dump}.manifest.json"
status=0
if [[ -f "${manifest_file}" ]]; then
  echo "Comparaison au manifeste $(basename "${manifest_file}")"
  while IFS=$'\t' read -r table expected; do
    [[ -n "${table}" ]] || continue
    # `< /dev/null` : sans cela, docker exec consommerait la liste des tables lue par la boucle.
    actual="$(docker exec "${container}" psql -U "${pg_user}" -d "${restore_db}" -tAc \
      "SELECT count(*) FROM \"${table}\"" < /dev/null 2>/dev/null || echo "absente")"
    if [[ "${actual}" == "${expected}" ]]; then
      printf '  ok   %-24s %s lignes\n' "${table}" "${actual}"
    else
      printf '  ECHEC %-24s attendu %s, obtenu %s\n' "${table}" "${expected}" "${actual}"
      status=1
    fi
  done < <(node -e '
    const fs = require("fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const [table, count] of Object.entries(manifest.rowCounts ?? {})) console.log(`${table}\t${count}`);
  ' "${manifest_file}")
else
  echo "Aucun manifeste : vérification limitée à la présence des tables."
  docker exec -i "${container}" psql -U "${pg_user}" -d "${restore_db}" -c '\dt'
fi

if [[ "${is_check_run}" -eq 1 && "${keep}" -ne 1 ]]; then
  psql_admin "DROP DATABASE IF EXISTS \"${restore_db}\";" > /dev/null
  echo "Base de test ${restore_db} supprimée."
fi

if [[ "${status}" -ne 0 ]]; then
  echo "Restauration incohérente : ne pas lancer de backfill sur cette sauvegarde." >&2
  exit 1
fi
echo "Restauration vérifiée."
