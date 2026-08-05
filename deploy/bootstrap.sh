#!/usr/bin/env bash
#
# One-time setup for a fresh Oracle Cloud Ubuntu instance.
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/stackd/master/deploy/bootstrap.sh | bash
#   # or, having cloned already:
#   bash deploy/bootstrap.sh
#
# Installs the packages a Minimal image lacks, opens 80/443 in the host firewall
# without disturbing anything else, and installs Docker.
#
# Safe to run twice. It does NOT touch the VCN security list — that lives in the
# Oracle console and is a separate, equally mandatory step.

set -euo pipefail

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
say 'Packages'
# ---------------------------------------------------------------------------
# Ubuntu Minimal ships without git, and the deploy clones the repo with it.
# iptables-persistent is pulled in now so the firewall rules below survive a
# reboot; pre-seeding the debconf answers stops it opening an interactive prompt
# that would hang a piped install.
sudo apt-get update -qq
echo 'iptables-persistent iptables-persistent/autosave_v4 boolean false' | sudo debconf-set-selections
echo 'iptables-persistent iptables-persistent/autosave_v6 boolean false' | sudo debconf-set-selections
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git curl ca-certificates iptables-persistent

# ---------------------------------------------------------------------------
say 'Host firewall'
# ---------------------------------------------------------------------------
# Oracle's Ubuntu images ship an INPUT chain that ends in a catch-all REJECT and
# permits little beyond SSH. `ufw` does not manage these rules, so `ufw allow 80`
# reports success and changes nothing — a genuinely misleading half hour.
#
# The rule has to go ABOVE the REJECT or it is never reached. Rather than
# hardcoding a line number, find the first REJECT and insert before it, so this
# keeps working when Oracle changes the default ruleset.
open_port() {
  local port="$1"
  if sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    echo "  ${port}/tcp already allowed"
    return
  fi
  local reject_line
  reject_line="$(sudo iptables -L INPUT -n --line-numbers \
    | awk '$2 == "REJECT" { print $1; exit }')"
  if [ -n "$reject_line" ]; then
    sudo iptables -I INPUT "$reject_line" -p tcp --dport "$port" -j ACCEPT
    echo "  ${port}/tcp inserted at position ${reject_line}, above the REJECT"
  else
    sudo iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
    echo "  ${port}/tcp appended (no REJECT rule found)"
  fi
}

open_port 80
open_port 443
sudo netfilter-persistent save >/dev/null
echo '  saved; rules will survive a reboot'

# ---------------------------------------------------------------------------
say 'Docker'
# ---------------------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  echo "  already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# ---------------------------------------------------------------------------
say 'Done'
# ---------------------------------------------------------------------------
cat <<'NEXT'
  Log out and back in for docker group membership to apply, then check:

    docker run --rm hello-world

  STILL REQUIRED, and not something this script can do — in the Oracle console:

    Networking -> Virtual Cloud Networks -> your VCN -> Security Lists
      -> Default Security List -> Add Ingress Rules

    Source 0.0.0.0/0   IP Protocol TCP   Destination Port 80
    Source 0.0.0.0/0   IP Protocol TCP   Destination Port 443

  Both firewalls must allow the traffic. With only one open the site is
  unreachable and nothing on this machine logs a reason.

  Then follow docs/deploy/SERVER.md from section 4.
NEXT
