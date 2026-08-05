#!/usr/bin/env bash
#
# Nightly database backup.
#
#   deploy/backup.sh                    # write a dump, prune old ones
#   BACKUP_DIR=/mnt/backups deploy/backup.sh
#
# Install as a cron entry on the VM:
#   0 4 * * *  cd /opt/stackd && deploy/backup.sh >> /var/log/stackd-backup.log 2>&1
#
# 04:00 Riyadh is deliberate: the branch closes at 03:00, so this runs when the
# day's trade is finished and nobody is mid-order.
#
# ⚠ A backup that has never been restored is not a backup. See the restore drill
# in docs/deploy/SERVER.md and actually do it once.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/stackd/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.yml}"

# Read the database name and user out of the same .env the stack uses, so this
# cannot drift from what is actually running.
if [ -f deploy/.env ]; then
  # shellcheck disable=SC1091
  set -a; . deploy/.env; set +a
fi
DB="${STACKD_DB:-stackd}"
USER_NAME="${POSTGRES_USER:-stackd}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$BACKUP_DIR/stackd_${STAMP}.sql.gz"

echo "[$(date -Is)] dumping $DB -> $OUT"

# --clean --if-exists so the dump can be replayed straight over an existing
# database. Custom format would be smaller, but plain SQL can be read, grepped
# and partially recovered by hand at 2am, which matters more at this size.
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump --clean --if-exists --no-owner --no-privileges -U "$USER_NAME" "$DB" \
  | gzip -9 > "$OUT.tmp"

# Only becomes a real backup once it is complete — a half-written file that
# looks like yesterday's is worse than an obvious failure.
mv "$OUT.tmp" "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"

# A dump that is suspiciously small usually means the container answered but the
# database was empty. Fail loudly rather than quietly rotating good ones away.
BYTES="$(stat -c%s "$OUT")"
if [ "$BYTES" -lt 2000 ]; then
  echo "[$(date -Is)] ABORT: dump is only ${BYTES} bytes — refusing to prune" >&2
  exit 1
fi

echo "[$(date -Is)] wrote $SIZE"

find "$BACKUP_DIR" -name 'stackd_*.sql.gz' -mtime "+${KEEP_DAYS}" -print -delete \
  | sed 's/^/[pruned] /'

echo "[$(date -Is)] done. $(find "$BACKUP_DIR" -name 'stackd_*.sql.gz' | wc -l) backups on disk"

# Off-site copy. Everything above still lives on the one VM that could die, so
# this is the step that turns it into an actual backup. Uncomment once you have
# somewhere in-Kingdom to put it — object storage from the same provider is fine,
# and keeps the data in the Kingdom.
#
# rclone copy "$OUT" stackd-backups:stackd/db/
