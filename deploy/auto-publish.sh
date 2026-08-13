#!/usr/bin/env bash
#
# Publishes stackd.com.sa when the menu has actually changed.
#
# Runs on the VM from cron. The website is a static export on Cloudflare Pages,
# so a price edited in the admin portal reaches customers only when the site is
# rebuilt and re-uploaded — `npm run sync:menu`, then `npm run deploy`. Until
# this script existed those were two commands on a developer's laptop, and the
# site quietly served the old price in between.
#
# ⚠ WHY THIS RUNS HERE AND NOT ON CLOUDFLARE. The Pages project is DIRECT UPLOAD
# only: no Git connection and no build command, so there is nothing on
# Cloudflare's side that could rebuild. And the database is not publicly
# reachable — Compose publishes 80 and 443 and nothing else — so a remote
# builder could not read the menu even if one existed. The VM is the only place
# that has the repo, the database and the uploaded photos together.
#
# ⚠ THE CHEAP CHECK IS THE WHOLE DESIGN. Cron fires every couple of minutes, but
# all it usually does is one small SQL query and a file comparison. The heavy
# container — install, Next build, upload — starts only when the fingerprint
# actually moved. A menu edit is rare; polling must not cost anything.
#
# Install:
#   */2 * * * * /opt/stackd/deploy/auto-publish.sh >> /var/log/stackd-publish.log 2>&1
#
set -euo pipefail

ROOT=/opt/stackd
COMPOSE="docker compose -f $ROOT/deploy/docker-compose.yml"
STATE=$ROOT/deploy/.last-published
LOCK=/tmp/stackd-publish.lock

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')" "$*"; }

# One publish at a time. A build takes minutes and cron fires every two, so
# without this a slow build would be joined by a second and a third.
exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

# ---------------------------------------------------------------------------
# The fingerprint
#
# Covers exactly what ends up on the website: every field sync-menu.mjs reads,
# plus the rewards catalogue and the earn rate, which the site states in its own
# copy. `md5` of a stable ordering — this only ever needs to answer "different
# or not", never "what changed".
#
# ⚠ `docker compose exec -T` READS STDIN and will swallow the rest of this
# script if left connected. `< /dev/null` on every call. That trap is recorded
# in STATUS and has bitten this project before.
# ---------------------------------------------------------------------------
db_fingerprint() {
  $COMPOSE exec -T db psql -U stackd -d stackd -tAc "
    select md5(string_agg(x, '|' order by x)) from (
      select concat_ws(':', c.slug, c.name_en, c.name_ar, c.show_photos,
                       i.slug, i.name_en, i.name_ar, i.description_en,
                       i.description_ar, i.price, i.calories, i.spicy,
                       i.image_url, i.photo_note) as x
        from categories c join menu_items i on i.category_id = c.id
       where c.is_active and i.is_active
      union all
      select concat_ws(':', 'reward', r.name_en, r.name_ar, r.points_cost,
                       r.discount_amount, r.is_active) from rewards r
      union all
      select concat_ws(':', 'settings', s.earn_percent, s.min_redeem_points,
                       s.signup_bonus) from loyalty_settings s
    ) t;" < /dev/null | tr -d '[:space:]'
}

# Photographs change the site without touching a row, so they are part of the
# fingerprint too. Name, size and mtime is enough to notice a replacement.
photo_fingerprint() {
  find "$ROOT/apps/web/public/menu" -type f -printf '%f %s %T@\n' 2>/dev/null \
    | sort | md5sum | cut -d' ' -f1
}

want="$(db_fingerprint)-$(photo_fingerprint)"
have="$(cat "$STATE" 2>/dev/null || echo none)"

if [ -z "${want%%-*}" ]; then
  log "could not read the database; leaving the site alone"
  exit 1
fi

if [ "$want" = "$have" ]; then
  exit 0
fi

log "menu changed ($have -> $want); publishing"

# ⚠ The state file is written only on SUCCESS. A failed build must be retried on
# the next tick, not marked as done — otherwise one broken publish leaves the
# site permanently stale and silent about it.
if $COMPOSE --profile publish run --rm publish; then
  echo "$want" > "$STATE"
  log "published"
else
  log "PUBLISH FAILED — the site still shows the previous menu, will retry"
  exit 1
fi
