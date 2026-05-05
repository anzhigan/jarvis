#!/usr/bin/env bash
#
# Restore Postgres + MinIO from a backup directory created by ./backup.sh
#
# Usage:
#   ./restore.sh /var/backups/jarvis/2026-05-05
#
# WARNING: drops and recreates the `jarvis` database, and overwrites every
# object in the MinIO bucket. Run only when you mean it.
set -euo pipefail

if [[ -z "${1:-}" ]] || [[ ! -d "$1" ]]; then
  echo "Usage: $0 <backup-dir>" >&2
  exit 1
fi

SRC="$(cd "$1" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env"

echo "Restoring from: $SRC"
read -p "This will OVERWRITE current data. Continue? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "Aborted."; exit 1; }

# 1. Postgres
echo "→ Restoring Postgres…"
$COMPOSE exec -T db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS jarvis;"
$COMPOSE exec -T db psql -U postgres -d postgres -c "CREATE DATABASE jarvis;"
$COMPOSE exec -T db pg_restore -U postgres -d jarvis < "$SRC/db.dump"

# 2. MinIO
echo "→ Restoring MinIO…"
$COMPOSE cp "$SRC/minio/." minio:/tmp/_restore_jarvis
$COMPOSE exec -T minio sh -c '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null &&
  mc mb --ignore-existing local/jarvis &&
  mc mirror --quiet --overwrite /tmp/_restore_jarvis local/jarvis &&
  rm -rf /tmp/_restore_jarvis
'

echo "Restore complete. Restart api so it picks up any schema state:"
echo "  $COMPOSE restart api"
