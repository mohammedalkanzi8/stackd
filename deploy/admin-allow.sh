#!/usr/bin/env bash
#
# Change which source addresses may reach the staff portal.
#
#   ./admin-allow.sh                      show the current list
#   ./admin-allow.sh add 203.0.113.4      allow one more address (/32 assumed)
#   ./admin-allow.sh set 203.0.113.0/24   replace the list outright
#   ./admin-allow.sh open                 back to the whole internet (panic lever)
#
# Why this exists rather than "edit .env and restart": the allowlist is the one
# setting that can lock you out of the tool you would use to fix it. Recovery is
# an SSH session and a file edit, which is fine at a desk and miserable from a
# phone at the counter. Making the change cheap and checked is what makes
# narrowing the list something you will actually do.
#
# It refuses to write a list that excludes the address you are connected from.
# That is the whole failure mode: a dynamic ISP lease moves, or a /32 is typed
# where a /24 was meant, and the next request is a 403 from the outside.

set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=.env

if [[ ! -f $ENV_FILE ]]; then
	echo "No $PWD/$ENV_FILE — copy env.example first." >&2
	exit 1
fi

current() {
	# Everything after the first '=' to end of line, exactly as compose reads it.
	sed -n 's/^ADMIN_ALLOW_CIDR=//p' "$ENV_FILE" | tail -n 1
}

# The address we are talking to the server FROM. Empty on a console session, in
# which case the lockout check has nothing to compare against and is skipped.
operator_ip() { [[ -n ${SSH_CONNECTION:-} ]] && awk '{print $1}' <<<"$SSH_CONNECTION"; }

# Normalise and validate. A bare address becomes a /32 (or /128), because that
# is what people paste and silently accepting it as something else is worse.
normalise() {
	python3 - "$@" <<-'PY'
		import ipaddress, sys
		out = []
		for raw in sys.argv[1:]:
		    try:
		        out.append(str(ipaddress.ip_network(raw, strict=False)))
		    except ValueError as e:
		        sys.exit(f"Not an address or CIDR: {raw!r} ({e})")
		print(" ".join(dict.fromkeys(out)))
	PY
}

# Would `list` still admit `ip`?
covers() {
	python3 - "$1" "$2" <<-'PY'
		import ipaddress, sys
		ip, nets = ipaddress.ip_address(sys.argv[1]), sys.argv[2].split()
		ok = any(ip in ipaddress.ip_network(n, strict=False) for n in nets)
		sys.exit(0 if ok else 1)
	PY
}

write_and_reload() {
	local new=$1 old
	old=$(current)

	if [[ $new == "$old" ]]; then
		echo "Already $new — nothing to do."
		return
	fi

	local me
	me=$(operator_ip) || true
	if [[ -n $me ]]; then
		if covers "$me" "$new"; then
			echo "You are connected from $me, which the new list still allows."
		else
			echo "REFUSING: you are connected from $me, which '$new' does not cover." >&2
			echo "You would be locked out of the staff portal the moment this applied." >&2
			echo "Add it too, or use 'set' deliberately from a network you are keeping." >&2
			exit 1
		fi
	else
		echo "No SSH_CONNECTION, so the lockout check was skipped. Be sure."
	fi

	python3 - "$ENV_FILE" "$new" <<-'PY'
		import sys
		path, value = sys.argv[1], sys.argv[2]
		lines = open(path).read().splitlines(keepends=True)
		for i, line in enumerate(lines):
		    if line.startswith("ADMIN_ALLOW_CIDR="):
		        lines[i] = f"ADMIN_ALLOW_CIDR={value}\n"
		        break
		else:
		    lines.append(f"ADMIN_ALLOW_CIDR={value}\n")
		open(path, "w").writelines(lines)
	PY

	echo "  was: ${old:-<unset>}"
	echo "  now: $new"

	# Caddy substitutes {$ADMIN_ALLOW_CIDR} when it PARSES the config, from the
	# container's environment — which is fixed at container creation. So a
	# `caddy reload` would re-read the same old value and appear to do nothing.
	# The container has to be recreated. Only caddy restarts; both portals keep
	# running behind it and just refuse connections for a second or so.
	echo "Recreating the caddy container (~2s of refused connections on 80/443)..."
	docker compose up -d caddy
	echo "Done."
}

case "${1:-show}" in
show)
	echo "ADMIN_ALLOW_CIDR=$(current)"
	me=$(operator_ip) || true
	[[ -n ${me:-} ]] && echo "You are connected from $me."
	;;
add)
	shift
	[[ $# -gt 0 ]] || { echo "Usage: $0 add <address|cidr>..." >&2; exit 1; }
	# Assigned on its own line, not interpolated into the call below: a command
	# substitution in an argument does not trip `set -e`, so a rejected address
	# would arrive as an empty list and be reported as a lockout instead of the
	# typo it is.
	added=$(normalise "$@")
	base=$(current)
	# Adding to a list that is already the whole internet means the caller wants
	# the narrow list they named, not 0.0.0.0/0 plus a redundant entry.
	if [[ $base == "0.0.0.0/0" ]]; then
		echo "The list was open to everything; 'add' is taking that to mean you want"
		echo "only the addresses you named. Use 'open' to go back."
		base=""
	fi
	# Unquoted on purpose: both hold space-separated lists that must split.
	# shellcheck disable=SC2086
	merged=$(normalise $base $added)
	write_and_reload "$merged"
	;;
set)
	shift
	[[ $# -gt 0 ]] || { echo "Usage: $0 set <address|cidr>..." >&2; exit 1; }
	wanted=$(normalise "$@")
	write_and_reload "$wanted"
	;;
open)
	write_and_reload "0.0.0.0/0"
	echo
	echo "⚠ The staff portal is now reachable from any address on the internet."
	echo "  requireStaff() is the only thing in front of it. Narrow it again soon."
	;;
*)
	sed -n '3,8p' "$0" | sed 's/^# \?//'
	exit 1
	;;
esac
