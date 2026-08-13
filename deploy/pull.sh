#!/usr/bin/env bash
#
# Pulls the repo on the VM without tripping over its own generated files.
#
# ⚠ A PLAIN `git pull` ON THIS HOST FAILS, and it fails at the worst moment.
# `npm run sync:menu` rewrites the <generated:menu> and <generated:rewards>
# regions of two TRACKED files during every publish:
#
#   packages/shared/src/menu.ts
#   packages/shared/src/rewards.ts
#
# so the deploy checkout is permanently dirty. Git then refuses any pull that
# touches them — "Your local changes would be overwritten by merge" — which is
# exactly the pull you are doing when you are shipping a hotfix to the menu or
# the rewards copy. The failure is silent if the pull is buried in a one-liner
# and its exit status is not checked.
#
# Discarding those two files is ALWAYS safe: they are outputs. The publish
# regenerates them from the database on the very next run, and the database is
# the source of truth for everything inside the generated regions.
#
# ⚠ NOT the same as `git checkout .` — that would also throw away deploy/.env
# edits or an emergency change made on the box. Only the two generated paths
# are reset, and anything else still dirty is reported rather than destroyed.
#
# Usage:  /opt/stackd/deploy/pull.sh
set -euo pipefail

ROOT=${STACKD_ROOT:-/opt/stackd}
GENERATED=(packages/shared/src/menu.ts packages/shared/src/rewards.ts)

cd "$ROOT"

# Reset only the generated files, and only if they are actually dirty, so the
# command stays quiet on a clean tree.
for f in "${GENERATED[@]}"; do
  if ! git diff --quiet -- "$f"; then
    echo "resetting generated file: $f"
    git checkout -- "$f"
  fi
done

# Anything ELSE still modified is a real local edit. Say so loudly rather than
# letting the pull fail with a message about a file the operator did not touch.
others=$(git status --porcelain --untracked-files=no | awk '{print $2}')
if [ -n "$others" ]; then
  echo "⚠ locally modified files that are NOT generated:"
  printf '   %s\n' $others
  echo "  Commit, stash or revert them before pulling. Nothing was discarded."
  exit 1
fi

git pull --ff-only origin master
git log --oneline -1

# ⚠ The generated files are now the REPO's versions, not the database's, and
# they stay that way until the next publish rewrites them. That is fine for the
# portals — they read the database directly. It matters only for the static
# website, which is built from these files, so let auto-publish notice: its
# code_fingerprint() is a git tree hash and has just moved.
echo
echo "auto-publish will rebuild the website within two minutes."
