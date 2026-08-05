# Deploying the portals

The website is already live on Cloudflare Pages and does not change. This is
about the two things that need a real server: the **customer loyalty portal** and
the **staff admin portal**, plus the Postgres they share.

> ⚠ **Nothing in this document has been run.** The container build could not be
> tested — Docker is not installed on the development machine. What *was* proven:
> the standalone production server starts, serves pages, talks to Postgres and
> serves its static assets; the Compose file is valid YAML; the backup script
> dumps and restores the real database intact. The Dockerfile is the unverified
> part. Expect to fix something on the first `docker compose up`.

---

## 1. Where it has to run, and why

Customer names, phone numbers and order history are personal data of people in
Saudi Arabia. Since September 2024 the PDPL cross-border rules are enforced, and
SDAIA has published **no adequacy list** — so every transfer out of the Kingdom
needs Standard Contractual Clauses approved by them. The way to avoid that
paperwork entirely is to not transfer anything.

**The server and the database go in-Kingdom.**

| Provider | Regions | Notes |
|---|---|---|
| **Oracle Cloud** | Riyadh (`me-riyadh-1`), Jeddah | Cheapest in-Kingdom option. See the free-tier caveats below. |
| Google Cloud | Dammam (`me-central2`) | ~20 min from the branch. Managed Postgres available. Costs money. |
| STC Cloud, SITE, Mobily | Saudi | Saudi-owned. Usually a sales conversation, not a signup form. |
| ~~AWS~~ | Bahrain, UAE | **Not Saudi.** The in-country region was announced for 2026 and is not GA. |
| ~~Azure~~ | — | Saudi Arabia East targeted Q4 2026. |
| ~~Hostinger~~ | 8 sites, none in the Middle East | Cannot be used for this. |

A single VM is plenty. One branch, a few hundred orders a day.

### ⚠ Oracle's Always Free tier, accurately

**It is now 2 ARM cores and 12 GB, not 4 and 24.** Oracle halved the Ampere A1
allowance on **15 June 2026** — no blog post, no email, the documentation simply
changed. Free accounts running larger instances had them **shut down** until
manually resized, and a terminated instance above the new limit may not be
recreatable.

2 cores and 12 GB still runs this stack comfortably: Postgres, two Next servers
and Caddy idle well under 1 GB for a single branch. Building the images on the
box will be slow on two ARM cores, so build one app at a time.

**What is confirmed:** Riyadh and Jeddah are live commercial regions, and Oracle
states the Free Tier is available in all commercial regions. Always Free compute
only exists in your tenancy's **home region**, and the home region is permanent —
choose Riyadh or Jeddah at signup and never again.

**What is not confirmed, and can only be settled by trying:** whether a Saudi
region is offered as a home region on the signup form, and whether A1 capacity is
actually obtainable there. "Out of host capacity" on Ampere A1 is a common and
long-standing complaint in busy regions.

**If free capacity is not available,** a paid A1 instance is roughly $0.01 per
core-hour — about **$15/month for 2 cores**, plus a few dollars for storage. That
is the fallback, and it is not worth twisting the architecture to avoid.

---

## 2. DNS

Two records, both pointing at the VM's public IP.

| Name | Type | Value | Cloudflare proxy |
|---|---|---|---|
| `my` | A | VM public IP | **DNS only — grey cloud** |
| `admin` | A | VM public IP | **DNS only — grey cloud** |

**The grey cloud on `my` is the whole point.** Proxying it means Cloudflare
terminates TLS and sees customer data in the clear, which is the cross-border
transfer we just avoided by hosting in-Kingdom. The apex and `www` stay proxied —
they serve a menu and no personal data.

It is also required mechanically: Caddy gets its certificate over HTTP-01, which
fails if Cloudflare answers the challenge instead of the server. A proxied record
here looks like a certificate bug and is a DNS one.

Leave the existing apex and `www` records alone.

---

## 3. The VM

Create an instance in Riyadh:

- **Shape:** Ampere A1 (`VM.Standard.A1.Flex`), **2 OCPU / 12 GB** — the current
  Always Free ceiling. Asking for more silently costs money, or gets refused.
- **Image:** Canonical Ubuntu 24.04 (aarch64).
- **Boot volume:** 50 GB is inside the free allowance (200 GB total across all
  volumes).
- Save the SSH private key when it is offered. It is shown once.

If the console says **"Out of host capacity"**, that is Ampere A1 being busy in
that region, not a mistake on your part. Either retry over a few hours, or switch
the shape to paid — roughly $15/month for 2 cores. Do **not** solve it by moving
to a region outside the Kingdom.

### ⚠ Oracle blocks ports in two places, and one of them is invisible

This is the single most common way an OCI deployment appears broken. Both must
be opened or the site is simply unreachable, with nothing in any log on the box.

**1. The VCN security list** (in the Oracle console — Networking → your VCN →
Security Lists → default). Add ingress rules:

| Source | Protocol | Port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**2. The host firewall inside the instance.** Oracle's Ubuntu images ship with
iptables rules that reject everything except SSH, and they persist across
reboots. `ufw` does not manage them, so `ufw allow 80` looks like it worked and
changes nothing.

```bash
# See the REJECT rules that are already there
sudo iptables -L INPUT -n --line-numbers

# Allow HTTP and HTTPS, before the catch-all REJECT
sudo iptables -I INPUT 6 -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 7 -p tcp --dport 443 -j ACCEPT

# Persist, or a reboot silently undoes it
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

Check the line numbers from the first command — insert **above** the final
`REJECT`, not after it, or the rules never match.

### Then Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in for this to apply
docker --version
```

Postgres is never exposed to the host or the internet — the app containers reach
it over the internal Compose network, which is why only 80 and 443 are open.

---

## 4. First deploy

```bash
sudo mkdir -p /opt/stackd && sudo chown "$USER" /opt/stackd
git clone <your repo> /opt/stackd
cd /opt/stackd

cp deploy/env.example deploy/.env
chmod 600 deploy/.env
openssl rand -hex 32   # STACKD_PORTAL_SECRET
openssl rand -hex 32   # STACKD_ADMIN_SECRET
openssl rand -hex 32   # POSTGRES_PASSWORD
$EDITOR deploy/.env

docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

The database applies `01_platform_shim.sql`, `schema.sql` and `seed.sql` **once**,
on a first start against an empty volume. Dev fixtures are deliberately not
mounted, so production has no fake staff and no test customers.

Which means **nobody can sign in to admin yet.** Create the first owner:

```bash
docker compose -f deploy/docker-compose.yml exec db psql -U stackd -d stackd -c \
  "insert into auth.users (email) values ('you@stackd.com.sa') returning id;"

# Then, with that id and a branch id from `select id from branches;`
docker compose -f deploy/docker-compose.yml exec db psql -U stackd -d stackd -c \
  "insert into staff (id, branch_id, role, full_name)
   values ('<user-id>', '<branch-id>', 'owner', 'Your Name');"
```

Set their password from a checkout that can reach the database:

```bash
DATABASE_URL=postgres://stackd:<password>@localhost:5432/stackd \
  npm run admin:passwd -- you@stackd.com.sa
```

After that, every other staff member is added through the portal's Staff page.

---

## 5. Point the website at the portal

`NEXT_PUBLIC_PORTAL_URL` is compiled into the static site at **build** time, not
read at run time. Building without it leaves the header's "My points" link
pointing at `localhost` on the live site.

```bash
NEXT_PUBLIC_PORTAL_URL=https://my.stackd.com.sa npm run build
npm run deploy
```

---

## 6. Before anything is printed

`STACKD_PORTAL_URL` is what every QR encodes — the claim code on each receipt and
the signup poster by the till. The admin portal's **Signup QR** page shows a
warning banner while it still says localhost. Paper cannot be corrected.

---

## 7. Backups

```bash
crontab -e
# 0 4 * * *  cd /opt/stackd && deploy/backup.sh >> /var/log/stackd-backup.log 2>&1
```

04:00 Riyadh, after the 03:00 close, so it never runs mid-order.

**Do the restore drill once, now, while nothing depends on it:**

```bash
deploy/backup.sh
docker compose -f deploy/docker-compose.yml exec db createdb -U stackd restore_test
gunzip -c backups/stackd_*.sql.gz | \
  docker compose -f deploy/docker-compose.yml exec -T db psql -U stackd -d restore_test
docker compose -f deploy/docker-compose.yml exec db psql -U stackd -d restore_test \
  -c "select count(*) from menu_items;"
docker compose -f deploy/docker-compose.yml exec db dropdb -U stackd restore_test
```

Everything so far lives on one VM that can die. Uncomment the `rclone` line in
`deploy/backup.sh` and point it at object storage **in the Kingdom** — the
backups are personal data too, and they are subject to the same rules as the
database.

---

## 8. Lock the admin portal down

`ADMIN_ALLOW_CIDR` defaults to the whole internet so a first deploy is not a
lockout. **That default is not a safe resting place.** Narrow it to the shop's
public IP:

```
ADMIN_ALLOW_CIDR=203.0.113.4/32
```

Then `docker compose -f deploy/docker-compose.yml up -d caddy`.

If staff need access from anywhere, put Cloudflare Access or a VPN in front
instead — but note that Cloudflare Access on the admin hostname means proxying
it, and the staff portal shows customer records. The same cross-border question
applies, with the same answer: prefer a VPN.

---

## 9. Updating

```bash
cd /opt/stackd && git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

Schema changes do **not** apply on their own. The init scripts only ever run
against an empty volume — see below.

---

## 10. ⚠ The moment `schema.sql` stops being editable

`supabase/schema.sql` has been the single canonical file because nothing was
live. **The first `docker compose up` ends that.**

From then on, editing it in place changes what a *fresh* database would get and
does nothing to the running one — the two diverge silently, and the first person
to notice is whoever restores a backup onto a schema that no longer matches.

So on the day this first runs in production:

1. Freeze `supabase/schema.sql`. It is now the record of what production started as.
2. Create `supabase/migrations/0001_<change>.sql` for every change after it.
3. Apply them explicitly:
   ```bash
   docker compose -f deploy/docker-compose.yml exec -T db \
     psql -U stackd -d stackd < supabase/migrations/0001_whatever.sql
   ```
4. Keep `db:reset` working for local development by applying the migrations after
   the schema, so a fresh local database still matches production.

There is a note at the top of `schema.sql` saying the same thing. Do it on the
day, not the week after.

---

## 11. Getting `/registration` on the apex instead

The design assumes `my.stackd.com.sa`. If the paths on the main domain matter
more, a Cloudflare Pages Function can proxy `/registration`, `/login`, `/points`
and `/claim/*` through to the portal.

**It cannot be combined with the grey cloud.** Proxying is exactly what routes
customer data through Cloudflare. Take advice on SCCs first, or keep the
subdomain.
