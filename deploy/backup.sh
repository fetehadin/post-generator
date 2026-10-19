#!/usr/bin/env bash
# Nightly database backup (NFR-17). Runs on the server from the repo root, e.g. with cron:
#   15 3 * * * cd /srv/voxlace && ./deploy/backup.sh >> /var/log/voxlace-backup.log 2>&1
# Keeps 14 days on the server and copies each dump off the server to $BACKUP_REMOTE.
set -euo pipefail

SETTINGS=deploy/.env
set -a
# shellcheck disable=SC1090
. "$SETTINGS"
set +a

DIR="${BACKUP_DIR:-/var/backups/voxlace}"
FILE="$DIR/voxlace-$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
mkdir -p "$DIR"

docker compose -f deploy/docker-compose.prod.yml --env-file "$SETTINGS" exec -T db \
  pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-owner \
  | gzip -9 > "$FILE"
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a "$FILE" "$BACKUP_REMOTE/"
  echo "copied off the server to $BACKUP_REMOTE"
else
  echo "WARNING: BACKUP_REMOTE is empty, so this backup exists only on the server" >&2
fi

find "$DIR" -name 'voxlace-*.sql.gz' -mtime +14 -delete

# Restore (test this once, NFR-17):
#   gunzip -c FILE | docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env \
#     exec -T db psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
