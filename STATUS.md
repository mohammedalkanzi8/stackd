# STACKD — where we left off

**Last session:** 5 August 2026
**Live now:** https://stackd.com.sa — verified serving, `www` 301s to the apex
**Email:** MXroute, live and working (SPF + DKIM + DMARC all present)
**Repo:** `/home/kanzi/stackd` (git, all committed)
**Theme:** dark for everyone; light only via the header toggle
**Phone:** 054 755 7666 · **Contact email published:** info@stackd.com.sa

---

## 5 August 2026 — deployment, and the hosting decision closed

**Hosting is settled: an in-Kingdom VM, and Cloudflare stays a proxy for the
static site only.** The full guide is `docs/deploy/SERVER.md`.

**Hostinger cannot host this**, which is worth recording because `PLAN.md` still
assumed it. Two independent reasons: shared hosting cannot run Node at all, and
Hostinger has data centres in eight places — USA, UK, France, Netherlands,
Lithuania, India, Singapore, Brazil — **none in the Middle East**. Either one
disqualifies it for anything holding customer data.

**Recommended: Oracle Cloud Riyadh (`me-riyadh-1`) or Jeddah.** In-Kingdom and
the cheapest option. Google Cloud Dammam is the alternative and is ~20 minutes
from the shop. AWS's Saudi region was announced for 2026 and is still not GA;
Azure's is targeted Q4 2026. Bahrain and UAE are **not** Saudi.

⚠ **Correction to what was written earlier in this session: Oracle's Always Free
tier is 2 ARM cores and 12 GB, not 4 and 24.** Oracle halved the Ampere A1
allowance on **15 June 2026** with no announcement — the docs just changed, and
free accounts over the new limit had instances shut down until resized. A
terminated instance above the limit may not be recreatable.

2 cores and 12 GB still runs the whole stack comfortably for one branch; it only
makes building the images on the box slow, so build one app at a time.

Two things remain **unverified and only a signup attempt settles them**: whether
a Saudi region is offered as a home region for a free account, and whether A1
capacity is obtainable there at all ("out of host capacity" is a long-standing
complaint in busy regions). The home region is permanent, so it is chosen once.
If free capacity is unavailable, a paid A1 pair is roughly $15/month — take it
rather than bending the architecture.

**The customer portal hostname must stay DNS-only (grey cloud).** Proxying
`my.stackd.com.sa` would terminate TLS at Cloudflare's edge, putting customer
names, phones and order history through a US company's network — the exact
cross-border transfer PDPL governs. Enforcement began September 2024 and SDAIA
still publishes no adequacy list, so any such transfer needs SDAIA-approved SCCs.
The apex and `www` stay proxied; they serve a menu and no personal data. Grey
cloud is also mechanically required, because Caddy's HTTP-01 challenge fails if
Cloudflare answers it — which presents as a certificate bug and is a DNS one.

### What is in the repo now

`deploy/` — one Dockerfile parameterised by app, Compose with Postgres and Caddy,
`Caddyfile`, `env.example`, `backup.sh`. Both Next apps now build
`output: 'standalone'` with `outputFileTracingRoot` at the repo root; without that
root the traced bundle silently misses `@stackd/server` and fails with
MODULE_NOT_FOUND on the first request, not at build time.

**Only the customer portal is published.** Admin is reachable only through Caddy
on its own hostname, gated by `ADMIN_ALLOW_CIDR`, which defaults to open so a
first deploy is not a lockout — **narrowing it is a real step, not an optional
one.**

### ⚠ What is NOT verified

**Docker is not installed on this machine, so the container build has never
run.** Expect to fix something on the first `docker compose up`.

What was actually proven: the standalone production server starts, serves pages,
talks to Postgres and serves its static chunks (assembled by hand exactly as the
Dockerfile does it, then run with `node server.js`); the Compose file is valid
YAML with only 80/443 published; `backup.sh` parses; and a real `pg_dump` of
`stackd_dev` restored into a fresh database with 17 items, 26 RLS-enabled tables
and all 18 functions intact.

### The platform shim moved, and it is not a dev file

`supabase/local/00_shim.sql` → **`supabase/01_platform_shim.sql`**. It supplies
the `auth` schema and PostgREST roles that `schema.sql` references, so it is
**required on every plain-Postgres deployment**, which is now all of them. Living
in a folder called `local/` actively misled. Only `supabase/local/dev-data.sql`
never ships.

### ⚠ The day this first runs in production, freeze schema.sql

The init scripts apply the schema **once**, against an empty volume. After that,
editing `schema.sql` changes what a fresh database would get and does nothing to
the running one — they diverge silently, and the first person to find out is
whoever restores a backup onto a schema that no longer matches.

Freeze it, start `supabase/migrations/0001_*.sql`, apply them explicitly. There
is a note at the top of the file saying so. Do it on the day.

---

## 4 August 2026 — the customer portal, and a session bug worth remembering

### ⚠ The bug: navigating the admin nav signed you out

**Cause: a module-scoped fallback secret.** `next dev` compiles each route
separately and hands the new bundle its own module registry, so the per-boot
random signing key was **different per route**. Sign in, two or three pages work,
then the nav logs you out — because that page was compiled later, against another
key.

Setting `STACKD_ADMIN_SECRET` hides it completely, which is exactly why every
test I ran missed it: they all pinned the env var. Reproduced only by running
`npm run admin` the way a person actually does.

**Fix: the dev fallback lives on `globalThis`**, like the pg pool already did.
The rule generalises — anything in a Next app that must survive dev module
reloading goes on `globalThis`, not in a module variable.

### apps/portal — the customer loyalty portal

`npm run portal` → **http://localhost:3002**. Register, sign in, see points, show
the member QR, claim rewards, read the history. Fixture login `0555000001` /
`stackd-dev`.

**A third app, deliberately, not a route group inside admin.** One misconfigured
route in a shared app puts customers on the staff pages. It also carries its own
cookie name: a shared one would mean signing into one portal silently signed you
into the other.

The claim page **moved here from admin**, which is where it always belonged —
the person scanning a receipt is a customer, not staff. Signed in, claiming is
one tap; signed out, they enter their member code or follow a link to join.

`customer_credentials` mirrors `staff_credentials`, for the same reasons, and
drops just as cleanly the day customers move to phone OTP as PLAN.md specifies.

**`packages/server` now holds what both portals share** — db, password hashing,
money parsing, QR, and the session factory. It is separate from
`packages/shared` because everything in it touches Node, and `packages/shared` is
bundled into the browser for the website. Importing it from a client component is
a build error, which is the point.

### Website header

Home and **My points** icons, both locales. My points is an ordinary outbound
link, not a route: the site is a static export and cannot hold an account. On a
phone the labels are visually hidden and only the glyphs remain, but
`aria-label` keeps them announced.

`NEXT_PUBLIC_PORTAL_URL` must be set before a production build or that link
points at localhost on the live site.

### Getting it onto stackd.com.sa

The site is static on Cloudflare Pages and **cannot serve `/registration` or
`/login` itself.** Reaching those exact paths needs either a Pages Function
proxying them to the portal, or a subdomain like `my.stackd.com.sa`. Both need
the portal hosted somewhere first — the same PDPL decision still open below.

### Environment that must be set before anything is printed or deployed

| Variable | Consequence of leaving it |
|---|---|
| `STACKD_PORTAL_SECRET` / `STACKD_ADMIN_SECRET` | Restart signs everyone out; production refuses to sign at all |
| `STACKD_PORTAL_URL` | Every printed QR encodes `localhost` and does nothing on a phone |
| `NEXT_PUBLIC_PORTAL_URL` | The website's My points link points at localhost |

The Signup QR page shows a warning banner while the URL still says localhost, so
this is hard to print by accident.

### Submit buttons show they are working

Server actions navigate on completion, so between the click and the new page
there was no feedback at all — long enough on shop wifi for someone to press
again and submit twice. `SubmitButton` disables while pending, spins, and sets a
`progress` cursor. `useFormStatus` only reports the form it is rendered *inside*,
which is why it is a component and not a hook call in the page.

---

## 4 August 2026 — points per dish, and the bill QR

**The loyalty model changed shape.** Points were computed from the order total.
They are now computed **line by line**: each line earns either its item's fixed
`points_award` (times quantity) or the per-riyal rate on that line. Mixing the
two is the point — most of the menu earns by value, while a dish being pushed can
be worth a flat number regardless of price. A Scoopy-Doo set to 200 earns 200,
not the 21 its 25 SAR would otherwise give.

Blank means earn by value. **`0` means earns nothing**, which is a different
thing and is what you want on a bottle of water.

An order with **no line items falls back to its ticket total.** Every POS
integration until someone writes one sends a total and nothing else, and that
must not silently earn zero.

The earn rate, expiry window, sign-up bonus and claim window are now rows in
`loyalty_settings`, editable on the portal's **Points** page, not constants.

**Reward discounts are deliberately not deducted before earning.** The customer
already paid for that discount in points; shrinking what the visit earns would
take the same points twice.

### The bill QR

The counterpart to a cashier scanning a member's code. Most walk-ins are
anonymous at the till, so the receipt carries a QR instead: the customer scans it
later, the points land, and the sale is linked to them retroactively — which is
the only moment that link can ever be made for a cash purchase.

`order_claims` holds the token. It is a **bearer token**: whoever holds the
receipt can claim it, like a paper voucher, exactly once. The alternative is
asking someone to prove they made a cash purchase, which nobody can do.

Two things the database enforces rather than trusting the app with:

- **Reprinting reissues the same code.** `issue_order_claim()` is idempotent on
  `order_id`, so a reprint cannot mint a second claim on one sale.
- **An order that already credited a member cannot also issue a QR.** Otherwise
  one sale pays out twice — once at the till, and again to whoever picks the
  receipt up off the table.

⚠ **`STACKD_CLAIM_BASE_URL` must be set before a single receipt is printed.** It
is the address the QR encodes, it defaults to `http://localhost:3001`, and paper
cannot be corrected afterwards.

### Also new in the portal

- **Orders** — the day's trade by trading day and source, per-order detail with
  line items, VAT breakdown, points, and the QR to print.
- **Staff** — add people, change roles, reset passwords, deactivate. Owner only:
  a manager who could promote themselves to owner is not a manager. Staff are
  **deactivated, never deleted**, because `loyalty_transactions.actor_id` points
  at them and those names are the whole reason the column exists.
- **Sign someone up** — any staff member can enrol a customer at the counter,
  which is the moment it matters. Phones normalise to E.164 from `054 755 7666`,
  `0512345678` or `+9665…`.
- **Item photos** — upload and replace from the portal. They write into
  `apps/web/public/menu/` named by slug, because the site is a static export and
  images must be real files at build time; a new photo needs `npm run build`
  before anyone sees it. The filename never contains request input — it comes
  from the item's slug, which is `[a-z0-9-]` — and the photo route reads only what
  the database says the file is.

A test-harness lesson worth keeping: `rejects()` in the schema tests now runs
inside its own savepoint. A failed statement aborts the whole transaction, so a
second expectation in one test was reporting "current transaction is aborted"
instead of whatever it was actually checking.

---

## 4 August 2026 — the data model is real

**Postgres 18 installed locally; the schema applies clean and 79 tests pass**
(40 shared + 19 functions + 20 schema). `npm run sync:menu` regenerates the
website menu from the database and reports no semantic change, which is the proof
that the model covers everything the site renders.

Setup is a one-time three lines, and needs a real terminal — `sudo` cannot prompt
for a password through the agent's shell:

```bash
sudo apt install -y postgresql
sudo service postgresql start
sudo -u postgres createuser --superuser "$USER"   # role for peer auth on the socket
```

`sudo service postgresql start` again after each WSL restart; there is no systemd
here to do it. Then `npm run db:reset && npm test`.

**The model changed shape in four ways.** Full reasoning is in the file comments.

1. **RLS on every table, no exceptions.** The previous revision enabled it on
   nine tables and missed seven — `branch_hours`, `branch_menu_availability`,
   `modifier_groups`, `modifiers`, `menu_item_modifier_groups`,
   `order_item_modifiers` and `tax_invoices`, the last of which holds the ZATCA
   hash chain. Behind PostgREST a table with RLS off is not merely readable, it
   is **world-writable with the anon key**, which ships inside the app bundle.
   `supabase/schema.test.mjs` now asserts `relrowsecurity` across the whole
   schema, so the eighth one someone adds cannot quietly miss it.
2. **Staff exist.** There was no way to tell a cashier from a customer, so the
   kitchen display could not read the orders it exists to display. New `staff`
   table plus an `is_staff_at()` helper, which **must** stay `security definer` —
   a policy on `orders` that reads `staff` directly needs `staff` readable, and
   the policy permitting that reads `staff` again. That recursion is a runtime
   error, so it surfaces as a broken kitchen display, not a failed migration.
3. **Walk-in tickets are modelled.** `orders.customer_id` is now nullable and
   `source` is `app` or `pos`. The Phase 2 cashier-scan flow ships *before* app
   ordering, and it could not be represented at all. Customers carry a
   `member_code` for the QR — deliberately not the `auth.users` UUID, which
   authenticates elsewhere and should not be printed on a receipt.
4. **Points are minted by a function, not by a comment.** `mint_loyalty_points()`
   is security definer and revoked from `anon`/`authenticated`; the grant is the
   control. Partial unique indexes make a double-mint a constraint violation
   rather than free money.

**Four bugs found, and only executing the SQL could have found any of them.**
This is the whole argument for doing this before the app exists.

*Redemption could never have worked.* The loyalty balance trigger — unchanged
from the first revision — was one `insert ... on conflict (customer_id) do
update`. Postgres evaluates CHECK constraints on the **proposed** row before it
detects the conflict, and the proposed row carries the raw delta. So redeeming 50
points builds a speculative row with `balance = -50`, trips `check (balance >=
0)`, and raises before the DO UPDATE branch is ever considered — *even when the
balance row plainly exists with enough points in it*. Reproduced at top level,
outside any function. It is now split: an `insert ... on conflict do nothing` to
ensure the row, then an UPDATE that does the arithmetic, whose check runs against
the final row. **Do not fold it back into an upsert**; there is a comment on it
saying so.

*The schema could never have been created.* `create unique index ... on orders
(branch_id, pickup_code, (created_at::date))` is rejected outright by Postgres:
casting a timestamptz to date reads the session TimeZone, making it `STABLE`, and
index expressions must be `IMMUTABLE`. Replaced with a stored `service_date`,
which also fixes the semantics — the trading day runs to 03:00, so a 01:30 order
belongs to the previous evening's ticket numbering, not to the calendar date.

*`seed.sql` had already drifted from `menu.ts`.* The two Arabic names resolved
from STACKD's own launch posters on 3 Aug (`تورتيلا الدجاج`, `ستربس الدجاج`)
landed in the TypeScript and never went back into the SQL. That is the drift
`npm run sync:menu` now exists to stop.

*Anonymous access broke after any earlier impersonation.* `current_setting(...,
true)` reverts a custom GUC to the **empty string**, not to unset, once it has
been `SET LOCAL` and the transaction has ended — so `auth.uid()` hit `''::json`
and raised "invalid input syntax for type json". It works in a fresh session and
fails the moment a previous transaction set a JWT claim, which is a horrible
thing to debug. Fixed in the local shim, which now guards the empty string before
the cast.

**Two lessons about the tests themselves, both the same shape as the
`node --test functions/` trap below.** A `reset role` in a `finally` masked every
real assertion error behind "current transaction is aborted", because the tests
that expect a query to raise leave the transaction aborted. And `asRole()`
originally opened a bare `begin` inside an already-open transaction — Postgres
treats that as a warning-only no-op, so the inner `rollback` silently discarded
the outer test's setup and looked exactly like a policy bug. It nests via
savepoints now.

The schema tests were verified by breaking an assertion on purpose and confirming
red (1 fail, exit 1), then restoring. Do that for any new test entry point.
They also **fail loudly rather than skip** when the database is unreachable;
`STACKD_SKIP_DB_TESTS=1` is the only, explicit, opt-out.

**The menu is generated from the database from here on.**
`packages/shared/src/menu.ts` is rewritten between its `<generated:menu>` markers
by `npm run sync:menu`. Hand edits inside that region are overwritten. Everything
outside it — the types, `BRANCH`, `BRAND`, the helpers — is hand-written and
stays. Photo provenance notes live in `menu_items.photo_note` and are re-emitted
as comments each run, so the § 4 caveats below survive regeneration.

To change the menu: edit `supabase/seed.sql` → `db:reset` → `sync:menu` → `test`.

**What is not in this pass:** the Moyasar integration itself (the `payments`
table is there, the edge function is Phase 3), ZATCA XML and hash chaining (table
and gapless counter are there, UBL 2.1 is Phase 3 and still gated on the missing
CR and VAT numbers), and the in-Kingdom hosting decision, which stays open — see
"The app backend needs rethinking" below. The schema is plain Postgres and does
not change with that decision; only where it runs does.

---

## 4 August 2026 — the admin portal

`npm run admin` → **http://localhost:3001**. Sign in `owner@stackd.local` /
`stackd-dev`. Four pages: overview, members, rewards, menu.

**Deliberately local-only for now, and that is the whole design.** A hosted
portal means answering the question deferred twice below — where the database
lives, given Supabase has no Middle East region and PDPL expects Saudi personal
data to stay in the Kingdom. A loyalty portal is names, phones and order history,
so it is exactly what that decision gates. Running it against `stackd_dev` gets a
real working tool with zero exposure; deploying it later changes a connection
string, not the app.

**It is the first thing here that runs a server.** `apps/web` is
`output: 'export'` — no runtime, no secrets, no database, correct for a menu and
useless for a portal. `apps/admin` is the opposite. It listens on **3001** so it
never shares `.next` with `npm run dev`; see the warning below about what that
corruption looks like.

**The portal bypasses RLS.** It connects as the database owner, the same posture
`service_role` has, which is right for an admin tool and means **RLS is not a
safety net in this app**. `requireStaff()` / `requireRole()` at the top of every
page and every server action is the only check there is. Adding a page without
one adds a hole.

Roles: everyone signed in can look members up; only `manager` and `owner` can
change points, rewards or prices. A cashier sees no Edit buttons and the action
throws if called anyway — verified by posting to it as a cashier.

**Point adjustments write to the ledger, never to the balance.** The balance is a
cached projection and would be overwritten by the next transaction, leaving no
record of who did what. `manual_adjust` rows carry the actor, which the database
insists on. Over-drawing is refused with "That would take the balance below
zero", not a raw constraint name.

**Staff passwords are scrypt in `staff_credentials`,** kept out of `staff` so a
row saying who someone is can be selected without a hash riding along, and so the
whole table drops cleanly if staff ever move to GoTrue like customers. The login
verifies a dummy hash when the account does not exist, so timing and wording do
not reveal which emails are real.

⚠ **Set `STACKD_ADMIN_SECRET` before this is ever deployed.** Without it, session
cookies are signed with a per-boot random key. Locally that just means a restart
signs you out; in production the app refuses to sign a session at all rather than
fall back to a shared default that would make every cookie forgeable.

**Menu edits do not reach the live site on their own** — `npm run sync:menu`, then
`npm run deploy`. The page says so in a banner. Item names and descriptions are
deliberately not editable there: they are bilingual and the Arabic came off
STACKD's own board and posters, so `seed.sql` is the place to change them.

Two things found while testing it, both worth remembering. `next build` imports
every module to collect page data, so a secret checked at module scope fails the
BUILD on a machine with no runtime secret — resolve lazily. And the first
`$ACTION_ID_` in a page's HTML belongs to the layout's **sign out** form, not to
the form you meant; posting to it silently logs you out and looks exactly like a
broken session.

---

## Shipped 3 August 2026

Live and verified on the real domain. Four commits: `c009538`, `c29a32b`,
`bf49d39`, plus `a06ac88` / `4b54a5f` / `638fc5e` for the domain and DNS work.

- Domain live: apex serves, `www` 301s to it, certificates active
- All 8 dish photos wired up (see § 4 for the caveats — two are real problems)
- Dark default + header theme toggle, and four WCAG failures fixed in light mode
- Favicons — there were none, and `/favicon.ico` was throwing on every page load
- `metadataBase` set so shared links render a preview
- Vertical rhythm rebuilt on a named scale; section gaps roughly a third tighter
- Phone → 054 755 7666; email card publishes `info@stackd.com.sa`
- Em dashes gone from all visible copy, including the browser tab title

**Three bugs found this session all failed silently while reporting success.**
Worth remembering as a pattern: `node --test functions/` passed with a
deliberately failing assertion, `wrangler pages deploy` reported success for
deploys that went nowhere, and a Pages custom domain sat `pending` with a blank
error message. Verification commands for each are in the sections below and in
`docs/deploy/README.md`.

**⚠ `info@stackd.com.sa` is published on the live site and in Google's
structured data.** It must exist as a real mailbox or alias on MXroute or mail to
it bounces. Send a test message.

**Nothing has ever been reviewed visually by me** — this environment has no
browser. Every visual judgement so far is the owner's. Run `npm run dev` and look
before shipping design changes.

---

## Pick up here

### 1. ~~Domain~~ — done and verified, 3 Aug 2026

`stackd.com.sa` serves the site; `www.stackd.com.sa` 301s to the apex via
`functions/_middleware.js`. The apex is canonical because that is what the
printed menu and the Instagram bio point at.

Two traps cost most of that session. Both are now fixed, but read this before
touching deployment again — see also `docs/deploy/README.md` § 2.

**Trap 1 — the Pages project's production branch was `main`, which does not
exist in this repo.** The only branch is `master`, and there is no remote.
`wrangler pages deploy` labels a deployment with the current git branch, so
every deploy since the first one landed as a **preview**. Custom domains serve
*production*, so the live site was frozen on the 30 July deployment while each
new deploy reported success. The first deploy to a new project becomes
production automatically, which is why it looked fine initially.

Fixed by setting `production_branch` to `master` and pinning `--branch=master`
in the `deploy` script. **Keep that flag** — without it the label follows
whatever branch is checked out, and deploying from a feature branch silently
goes to preview again. To confirm a deploy actually went live:

```bash
# env should be "production" and the date should be now
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/pages/projects/stackd" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['result']['canonical_deployment']; print(d['environment'], d['created_on'])"
```

**Trap 2 — attaching a custom domain via the API does not create the DNS
record.** The dashboard does it for you; the API needs DNS edit permission,
which the Pages-scoped token lacks. The domain then sits at `pending` with a
**blank error message** forever, because HTTP certificate validation cannot
resolve a hostname that points nowhere. Attach domains in the dashboard.

The live records, for reference — website proxied, mail not:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `@` | `stackd-7bc.pages.dev` | Proxied — orange |
| CNAME | `www` | `stackd-7bc.pages.dev` | Proxied — orange |
| MX / TXT | mail records | MXroute | DNS only — grey |

`MX` and a `CNAME` coexist at the apex because Cloudflare flattens apex CNAMEs.
Changing the website record does not affect mail.

**Verifying from this machine needs `--resolve`.** WSL here has no IPv6 route
but the resolver sometimes returns only `AAAA`, so `curl` fails with `000` on a
site that is perfectly healthy. Pin the IP and bust the cache:

```bash
IP=$(curl -s -H "accept: application/dns-json" \
  "https://cloudflare-dns.com/dns-query?name=stackd.com.sa&type=A" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['Answer'][0]['data'])")
curl -sI --resolve "stackd.com.sa:443:$IP"     "https://stackd.com.sa/"          # 302 -> /ar/
curl -sI --resolve "www.stackd.com.sa:443:$IP" "https://www.stackd.com.sa/ar/?x=$RANDOM"  # 301 -> apex
```

**Trap 3 — "server not found" after the records went in was stale negative DNS
caching, not an outage.** The zone's negative-cache TTL is 1800s while the A
records live 161s, so a cached "no such name" outlasts the fix tenfold. Verify
against `cloudflare-dns.com` and `dns.google` before debugging anything; details
in `docs/deploy/README.md` § 2. DNSSEC is not enabled, so a validation mismatch
was ruled out as a cause — see § 1c below.

### 1b. Consider turning on HSTS

`apps/web/public/_headers` has HSTS commented out with the note "add once HTTPS
is confirmed working on stackd.com.sa". It now is. Uncommenting it is a
**one-year commitment** — browsers will refuse plain HTTP for the domain and all
subdomains for `max-age`, so any future subdomain without a valid certificate
becomes unreachable with no quick way back. Worth doing, but decide
deliberately, and consider starting at `max-age=300` to test.

### 1c. DNSSEC — half done, waiting on DNET

**Enabled at Cloudflare 3 Aug 2026.** The zone publishes a KSK (key tag 2371)
and a ZSK (34505), both algorithm 13. Nothing validates yet because the
`.com.sa` parent has no `DS` record, so this state is safe and can sit
indefinitely.

**Remaining step: publish this `DS` at DNET.** Verified against the live
`DNSKEY` — the SHA-256 digest was recomputed per RFC 4034 and matches what the
dashboard displayed, so these values are known good, not transcribed:

| Field | Value |
|---|---|
| Key Tag | `2371` |
| Algorithm | `13` (ECDSA P-256 / SHA-256) |
| Digest Type | `2` (SHA-256) |
| Digest | `4D4D5CC686D451A282FEE6757AB9750D446C15E1B8E324E336443954133FDB83` |

One line, if the registrar wants that form:

```
stackd.com.sa. 3600 IN DS 2371 13 2 4D4D5CC686D451A282FEE6757AB9750D446C15E1B8E324E336443954133FDB83
```

`.sa` registrars do not always expose DNSSEC self-service; DNET may need a
support ticket. The `DS` goes at the **registrar**, never in Cloudflare's own
records — the parent zone is what vouches for the key.

**Do not paste the public key (`mdsswUyr3DPW…`) into a digest field.** That is
DNSKEY data, used only by registrars that ask for "key data" format instead of
DS. Getting this wrong returns SERVFAIL from every validating resolver — the one
DNS failure flushing caches cannot fix. Recovery is removing the `DS` at DNET
and waiting out the parent TTL.

Confirm once published — expect `Status 0` and `AD: true`:

```bash
curl -s -H "accept: application/dns-json" \
  "https://cloudflare-dns.com/dns-query?name=stackd.com.sa&type=A&do=1" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('Status', d['Status'], '| AD', d.get('AD'))"
```

**While DNSSEC is armed, never change nameservers or disable DNSSEC at
Cloudflare before removing the `DS` at DNET.** The parent keeps demanding a key
that no longer exists and the domain goes fully dark. Order is always: remove
`DS` → wait for TTL → then change.

### 2. Roll the Cloudflare API token

The token was pasted into a chat transcript, so treat it as exposed.

**Cloudflare → My Profile → API Tokens → Roll**, then update
`~/.stackd-cf-token` (gitignored, chmod 600). The file holds a shell-sourceable
line, `CLOUDFLARE_API_TOKEN=…`, not a bare token — keep that shape, wrangler
reads it from the environment.

Its scope is Pages-only: it can read the zone list and deploy, but not read DNS
records or write zone rulesets. That is enough for everything this project does.

### 3. Menu conflicts — four left of six

See `docs/DISCREPANCIES.md`. Two were closed on 3 Aug 2026 by STACKD's own
launch posters, which gave the official Arabic names and confirmed both items are
new rather than discontinued: `تورتيلا الدجاج` and `ستربس الدجاج`.

**The blocking one: real calorie figures for Soft Drink and Kenza.** Both printed
menus copied the sauces column (67 / 62 / 75), which is why water was listed at
75 kcal. Those two are `null` — the site omits them rather than publishing
numbers known to be wrong. Saudi menu-labelling rules require accuracy.

Also unresolved: Giants calorie counts (1100/1200 digital vs 1500/1600 in-store)
and Classic-Stackd calories (the in-store board disagrees with itself).

### 4. Photography — eight of twelve dishes covered

Every dish now has an image. Sources differ and it matters:

| Item | Source | Quality |
|---|---|---|
| Tortilla Strips, Chicken Strips | July camera shoot | Good |
| Fries | July camera shoot, plain not seasoned | Good |
| Classic / Maple / Big-Stackd, Scoopy-Doo | Instagram post crops | **~3x upscaled, soft** |
| Fire-Attack | **Composite, not a photograph** | See below |

**Two things to fix when you can.**

*Fire-Attack is not a photo of Fire-Attack.* It is the Scoopy-Doo plate,
warm-graded to read spicier, with jalapeno slices drawn in — done at the owner's
explicit instruction, asked for twice. The grade is defensible since the dish
really is Nashville-seasoned. The jalapenos are not in the recipe. The full
caveat sits above the `image:` field in `menu.ts`. One real photo of the dish
removes the whole issue.

*The five poster crops are soft.* Each source was a phone screenshot of an
Instagram post; the food occupies only 333–480px, so it is upscaled with a light
sharpen. Fine at card size, visibly soft on a large screen. **Getting the
original files from whoever designed those posts is the single biggest remaining
visual upgrade.** Still missing entirely: Coleslaw and Cheesy-Cheese.

Adding one: drop a 4:3 file in `apps/web/public/menu/` named by slug, set
`image:` on the item. Brief in `apps/web/public/menu/README.md`.

Instagram cannot be scraped for these — the profile returns a JS shell with no
image URLs and the API 401s without a login. Two posts in the folder the owner
supplied carry Instagram's own `AI info` label; neither was used.

### 5. Light mode was never designed — check it as you go

It shipped hidden behind `prefers-color-scheme` for months, so nobody had looked
at it. Measuring it on 3 Aug found four WCAG AA failures, all fixed:

- brand gold as text was **1.96:1** on cream (9.24:1 on the dark ground) and was
  carrying every eyebrow, the hero slogan, category counts and info-card titles
- the 10.5px tag chips sat at 3.90:1, the spicy variant at 3.51:1
- `--text-faint` at 3.90:1 was used for the footer copyright, ring label, chip keys
- `.card-feature` paints a dark gradient in BOTH themes but only overrode
  `.card-desc`, so the featured card's title and calorie tag vanished

**Rule that came out of it: never set gold type with `var(--gold)`.** Use
`var(--label)`, which darkens to `#7a5200` in light. `--gold` is for decoration
on fixed backgrounds only. The same trap exists for any element with a fixed
dark background — its text must be set explicitly, not left to inherit `--text`.

Contrast is worth measuring rather than eyeballing:

```python
def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[(v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4) for v in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
cr=lambda a,b:(max(lum(a),lum(b))+0.05)/(min(lum(a),lum(b))+0.05)
```

Light ground is `#fbf8f2` (page) and `#fefefe` (cards). AA needs 4.5:1 for normal
text, 3:1 for large. Nothing on the site is "large" except headings.

---

## Commands

```bash
npm run dev       # http://localhost:3000/ar/
npm test          # 59 tests (40 shared + 19 functions)
npm run build     # static export to apps/web/out/
npm run deploy    # build + push to Cloudflare Pages
npm run preview   # single-file shareable preview
```

**Never run `npm run build` while `npm run dev` is running.** They share
`.next` and the production build corrupts the dev server (500s on every route).
Recovery: `pkill -f "next dev" && rm -rf apps/web/.next && npm run dev`

**Keep the glob in the test script.** `node --test functions/` — a bare
directory — silently ran nothing on Node 22: it reported `ok 1 - functions`,
`# pass 1`, and exit code 0 even with a deliberately failing assertion in the
file. The functions tests had never actually run. `node --test
"functions/*.test.js"` reports all 19 and exits non-zero on failure. Verify any
change to that line by breaking a test on purpose and confirming red.

---

## Decisions already made — don't relitigate

| Decision | Why |
|---|---|
| Cloudflare Pages, not Hostinger | Cloudflare has a data centre in **Dammam**, ~20 min from the branch. Hostinger's nearest is Germany. Also free, and unlimited bandwidth for TikTok spikes |
| **MXroute** for email, not Microsoft 365 | Set up and working 3 Aug 2026. Supersedes the earlier M365 plan — don't "fix" the DNS back to the Outlook records. Live values in `docs/deploy/README.md` |
| Arabic is the default locale | Khobar restaurant; English is secondary |
| **Dark is the default for every visitor** | `prefers-color-scheme: light` was removed 3 Aug 2026. Light exists only behind the header toggle. The media override meant months of review happened in a cream theme nobody designed |
| Gold type uses `--label`, never `--gold` | `--gold` is 1.96:1 on cream. `--label` darkens to `#7a5200` in light. `--gold` is for decoration on fixed backgrounds only |
| Vertical rhythm is three named steps | `--sp-section` / `--sp-block` / `--sp-group`. Section padding was `clamp(64px, 10vw, 132px)` on both edges — 240px between sections — patched with hand-written inline `paddingBlockStart: 0`. Use `.section + .section` instead |
| The theme toggle picks its icon in CSS | A static export renders at build time and cannot know the visitor's theme. Choosing in JS mismatches on hydration or leaves the button blank until mount |
| Poster-crop photos are accepted, softness and all | Owner's call. Five of eight images are ~3x upscaled Instagram crops. Replace with originals when available; do not re-crop from the screenshots |
| Photos on dishes only | Sauces and drinks stay text cards; 17 placeholder tiles looked unfinished |
| Money as integer halalas | `2700` = 27.00 SAR. Never floats |
| **Prices are VAT-inclusive** | KSA requires it. 27 SAR *contains* its VAT. Never add 15% on top — see `splitVatInclusive` |
| Loyalty as append-only ledger | Points are money; disputes need an audit trail |
| Points earned on the pre-VAT net | A 60 SAR ticket earns 52, not 60 |
| Tajawal + Cairo for both locales | Both ship matched Arabic *and* Latin. A bilingual brand shouldn't change typeface when it changes language |

---

## ⚠ The app backend needs rethinking

**Supabase was recommended early, then ruled out.** Verified: Supabase has **no
Middle East region** — Americas, Europe, Asia-Pacific, South America only.

Saudi **PDPL** requires personal data of people in the Kingdom to be processed
**inside the Kingdom by default**. Cross-border transfer needs SDAIA-approved
Standard Contractual Clauses, and SDAIA has published no adequacy list. Fines
reach **SAR 5 million per breach**.

The loyalty program stores names, phone numbers and order history — squarely
personal data.

**The schema does not change.** `supabase/schema.sql` is plain Postgres and
stays as-is. Only *where it runs* changes: self-hosted Supabase on a Saudi or
Gulf server, or a Saudi cloud provider. Decide before building the app.

No exposure today — the website is static and collects nothing.

---

## Also outstanding

- **ZATCA Phase 2** — Wave 24 (turnover > SAR 375K) deadline was 30 June 2026,
  already passed. Confirm whether STACKD is in scope. Applies to the till now,
  independent of this project.
- **SAIP trademark search** on "STACKD" — other `Stack'd` restaurants already
  trade in Riyadh, Hofuf and Dammam.
- **National Address** (4 letters + 4 digits) — needed for ZATCA invoices; a
  Plus Code does not qualify.
- **CR and VAT numbers** for receipts.

---

## Design history — two directions were rejected

1. **Flat poster** (heavy condensed type, stacked wordmark, checkerboard slabs)
   → rejected as too austere and "too simple"
2. Current: **modern dark** — glow-lit ground, rounded cards, gradient CTAs

The owner wants "modern, attractive, catchy" and referenced chick-fil-a.com.
That reference is photography-led, which is why photos are the top priority.

Feedback applied so far: no scrolling ticker, no dual-language slogan, no
eyebrow dashes, no stat chips in the hero.
