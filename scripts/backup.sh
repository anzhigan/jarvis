#!/usr/bin/env bash
#
# Daily backup of Postgres + MinIO. Run on the VPS via cron.
#
#   0 3 * * * /projects/jarvis/scripts/backup.sh >> /var/log/jarvis-backup.log 2>&1
#
# Output: /var/backups/jarvis/<date>/{db.sql.gz, minio/}. Keeps last 7 days.
#
# Required environment (read from .env in the project root):
#   POSTGRES_PASSWORD   — for the db container
#   MINIO_ROOT_USER     — mc admin user
#   MINIO_ROOT_PASSWORD — mc admin password
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/jarvis}"
KEEP_DAYS="${KEEP_DAYS:-7}"
TODAY="$(date +%F)"
DEST="$BACKUP_ROOT/$TODAY"

mkdir -p "$DEST"
cd "$PROJECT_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env"

echo "[$(date)] Backup start → $DEST"

# 1. Postgres dump (custom format → smaller, restorable with pg_restore)
$COMPOSE exec -T db pg_dump -U postgres -Fc jarvis > "$DEST/db.dump"
echo "  db dump: $(du -h "$DEST/db.dump" | cut -f1)"

# 2. MinIO mirror — uses `mc` already inside the minio container.
mkdir -p "$DEST/minio"
$COMPOSE exec -T minio sh -c '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null &&
  mc mirror --quiet --overwrite local/jarvis /tmp/_backup_jarvis
'
$COMPOSE cp minio:/tmp/_backup_jarvis "$DEST/minio"
$COMPOSE exec -T minio rm -rf /tmp/_backup_jarvis
echo "  minio: $(du -sh "$DEST/minio" | cut -f1)"

# 3. Prune old backups
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

echo "[$(date)] Backup OK"
