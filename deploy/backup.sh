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
#
# ⚠ READ, NOT SOURCED. `. deploy/.env` treats the file as shell, and Compose's
# .env format is not shell: an unquoted value containing a space or a redirect
# character is legal there and a syntax error here. That is not hypothetical —
#
#     MAIL_FROM=STACKD Rewards <rewards@stackd.com.sa>
#
# aborted this script on `set -euo pipefail` with "syntax error near unexpected
# token `newline'", pointing at a line that has nothing to do with backups.
# Mail kept working the whole time, because Compose reads the file correctly, so
# nothing else in the system looked wrong. Found on 26 Aug 2026, when a
# pre-migration backup would not run.
#
# Only the two fields this script needs are read, and only up to the first `=`,
# so no future value can break it whatever it contains.
envval() {
  [ -f deploy/.env ] || return 0
  sed -n "s/^$1=//p" deploy/.env | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
DB="${STACKD_DB:-$(envval STACKD_DB)}"
DB="${DB:-stackd}"
USER_NAME="${POSTGRES_USER:-$(envval POSTGRES_USER)}"
USER_NAME="${USER_NAME:-stackd}"

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
