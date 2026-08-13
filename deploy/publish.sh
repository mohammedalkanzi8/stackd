#!/bin/sh
#
# One publish of stackd.com.sa: database -> menu.ts -> static export -> Cloudflare.
#
# Runs inside the publish container, which has the dependencies baked in and the
# repo bind-mounted at /repo. Called by deploy/auto-publish.sh when the menu
# fingerprint has moved.
#
set -eu

say() { printf '\n=== %s ===\n' "$1"; }

cd /repo

# ---------------------------------------------------------------------------
say "1/3  regenerating the menu from the database"
# ---------------------------------------------------------------------------
# ⚠ Rewrites the region between the <generated:menu> markers in
# packages/shared/src/menu.ts and nothing else. BRANCH, BRAND and the helpers
# below those markers are hand-written and survive.
npm run sync:menu

# ---------------------------------------------------------------------------
say "2/3  building the static export"
# ---------------------------------------------------------------------------
# ⚠ NEXT_PUBLIC_* is compiled in at build time. Without the portal URL every
# "My points" link on the live site would point at localhost — the fallback in
# apps/web/app/portal-url.ts is the real domain for exactly this reason, but
# passing it explicitly keeps the built output independent of that fallback.
NEXT_PUBLIC_PORTAL_URL="${NEXT_PUBLIC_PORTAL_URL:-https://my.stackd.com.sa}" \
  npm run build

# ---------------------------------------------------------------------------
say "3/3  uploading to Cloudflare Pages"
# ---------------------------------------------------------------------------
# ⚠ `wrangler pages deploy` HAS REPORTED SUCCESS FOR DEPLOYS THAT WENT NOWHERE
# in this project before, so the caller verifies afterwards rather than trusting
# the exit code alone. See STATUS, 3 August.
wrangler pages deploy apps/web/out \
  --project-name=stackd \
  --branch=master \
  --commit-dirty=true

say "done"
