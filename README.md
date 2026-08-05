# STACKD — Digital Platform

Website, iOS/Android app, and loyalty program for **STACKD / ستاكد**
American street food · الخبر الشمالية (North Khobar), KSA

> **Street food. Real flavor. Stacked right.** · *Don't Eat. Get STACKD*

---

## Status

| Piece | State |
|---|---|
| Data model (`supabase/schema.sql`) | **Applies and is tested** — RLS on every table, loyalty ledger, walk-in orders |
| Menu seed (`supabase/seed.sql`) | Source of truth — 17 items; the website is generated from it |
| Design tokens (`packages/shared/src/tokens.ts`) | Done |
| Hours / money / VAT logic | Done — **79 tests passing** (40 shared + 19 functions + 20 schema) |
| Website | **Builds and exports** — 6 pages, AR + EN. Needs real photos |
| Typography | Self-hosted Tajawal + Cairo (SIL OFL), Arabic + Latin subsets |
| Admin portal (`apps/admin`) | **Runs locally** — orders, members, points, rewards, menu, staff |
| Customer portal (`apps/portal`) | **Runs locally** — register, sign in, points, redeem |
| Mobile app | Not started |
| Kitchen display | Not started |

⚠ **Read [`docs/DISCREPANCIES.md`](docs/DISCREPANCIES.md) first.** Four conflicts
between the two supplied menus remain unresolved, including wrong calorie data on
both printed menus. (Water price is resolved: 2 SAR. Both Arabic names were
resolved from STACKD's own launch posters on 3 Aug 2026.)

---

## Running it

```bash
npm install
npm run db:reset  # rebuild the local database from supabase/*.sql
npm test          # hours logic, VAT math, i18n paths, menu integrity, redirects, schema
npm run dev       # website          → http://localhost:3000/ar/
npm run admin     # staff portal     → http://localhost:3001
npm run portal    # customer rewards → http://localhost:3002
npm run build     # static export into apps/web/out/
```

Three apps, three ports, deliberately. They must not share a port or a `.next`
directory — see the warning below about what that corruption looks like.

| App | What it is | Runtime |
|---|---|---|
| `apps/web` | The public website | Static export, no server |
| `apps/admin` | Staff: orders, members, menu, staff | Server, internal |
| `apps/portal` | Customers: points and rewards | Server, public-facing |

`npm test` includes the schema tests, which need a running local Postgres (see
below). They **fail loudly** rather than skipping when the database is
unreachable — a schema test that quietly passes because nothing ran is worse than
no test. To run everything else without a database:
`STACKD_SKIP_DB_TESTS=1 npm test`.

## Deploying to Hostinger

`npm run build` produces `apps/web/out/`. Upload its **contents** (including the
dotfile `.htaccess`) into `public_html`. There is no build step on the server.

The `.htaccess` redirects `/` to `/ar/` — or `/en/` when the browser prefers
English — because a static export has no middleware. It also sets cache headers:
fingerprinted assets for a year, HTML for ten minutes so a menu change appears
promptly.

Enable the HSTS line in `.htaccess` only after HTTPS is confirmed working on
`stackd.com.sa`; a bad cert with HSTS on locks visitors out for a year.

---

## Environment notes

Ubuntu 26.04 on WSL2. Node 22 is installed at `/usr/bin/node`.

Beware: Windows' npm is also on `PATH` via WSL interop
(`/mnt/c/Program Files/nodejs/npm`). If `command -v node` ever returns a
`/mnt/c/` path, the shell picked up the Windows toolchain — native modules will
compile for the wrong platform and Expo will misbehave on `/mnt/c` paths.

`npm audit` reports 3 high-severity advisories in `postcss` and `sharp`,
transitively via Next. Both are build-time only, and image optimisation is
disabled for the static export, so nothing ships to the browser. Worth clearing
on a Next upgrade regardless.

### Postgres — required for the schema tests

One-time setup. WSL2 has no systemd here, so it's `service`, not `systemctl`:

```bash
sudo apt install -y postgresql
sudo service postgresql start
sudo -u postgres createuser --superuser "$USER"   # peer auth over the unix socket
```

`sudo service postgresql start` again after each WSL restart.

`npm run db:reset` connects over the **unix socket**, not TCP. Debian ships
`local all all peer` in `pg_hba.conf`, so a role named after the OS user needs no
password; the same connection over TCP hits `scram-sha-256` and fails with
"password authentication failed" for a role that has no password — an error that
reads like a permissions problem and is really a transport one. Override with
`DATABASE_URL` to point at a real server.

---

## The database

`supabase/schema.sql` is canonical and is applied as a whole. Nothing has run
against production yet, so there is no migration chain — **the day it first does,
freeze the file and start `supabase/migrations/0001_*.sql`.** Editing it in place
after that point silently diverges from what is deployed.

```bash
npm run db:reset                  # drop, rebuild, seed, add dev fixtures
npm run db:reset -- --no-dev-data # menu only, no fake users
npm run test:db                   # just the schema tests
```

| File | Ships to production? |
|---|---|
| `supabase/schema.sql` | Yes — the model |
| `supabase/seed.sql` | Yes — the real menu, branch and rewards |
| `supabase/local/00_shim.sql` | **No** — fakes the Supabase platform (`auth` schema, PostgREST roles) |
| `supabase/local/10_dev_data.sql` | **No** — test users, staff logins, a customer to earn points |

The shim exists so `schema.sql` stays byte-identical to what a real Supabase
project would receive. Never edit the schema to accommodate local Postgres; edit
the shim.

Against a real Supabase project, the shim is unnecessary:

```bash
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

### The menu is generated from the database

```bash
npm run sync:menu   # database → packages/shared/src/menu.ts
```

Only the region between the `<generated:menu>` markers is rewritten. `BRANCH`,
`BRAND`, the types and the helpers in that file are hand-written and stay put.

To change the menu: edit `supabase/seed.sql` → `npm run db:reset` →
`npm run sync:menu` → `npm test`. Editing `menu.ts` directly gets overwritten.

Photo provenance notes live in `menu_items.photo_note` and are re-emitted as
comments on each run, so the caveats in `STATUS.md` § 4 survive regeneration.

---

## The admin portal

```bash
npm run admin     # http://localhost:3001
```

Sign in with `owner@stackd.local` / `stackd-dev` — one of three fixtures seeded by
`db:reset`. Set a real password with `npm run admin:passwd -- <email>`.

| Page | Does |
|---|---|
| Overview | Points outstanding, members, recent ledger movements |
| Orders | The day's trade; per-order detail and the bill QR |
| Members | Look up by code, name or phone; view the ledger; adjust points; sign someone up |
| Points | Earn rate, expiry, sign-up bonus, and a fixed award per dish |
| Rewards | Add, edit and retire the catalogue |
| Menu | Prices, calories, spicy flag, availability, and item photos |
| Staff | Add people, change roles, reset passwords, deactivate (owner only) |

### How points are earned

Every riyal spent earns at the rate on the **Points** page, calculated on the
pre-VAT net. Any dish can override that with a fixed award — a Scoopy-Doo can be
worth exactly 200 points whatever it costs, which is how you push one item
without discounting it. Blank means "earn by value"; `0` means "earns nothing",
and those are not the same thing.

An order with no line items falls back to its ticket total, because every POS
integration until someone writes one sends a total and nothing else.

### The bill QR

Most walk-ins are anonymous at the till. Instead of losing the points, the
receipt carries a QR: the customer scans it whenever they like and the points
land in their account, which also links that sale to them retroactively.

It is a **bearer token** — whoever holds the receipt can claim it, exactly like a
paper voucher, and only once. That is the trade-off, and the alternative is
asking someone to prove they made a cash purchase, which nobody can do.

Reprinting a receipt reissues the *same* code, never a second claim on one sale.
An order that already credited a member at the till cannot also issue a QR.

⚠ **Set `STACKD_CLAIM_BASE_URL` before a single receipt is printed.** It is the
address the QR points at, it defaults to `http://localhost:3001`, and paper
cannot be corrected afterwards.

**It runs a server, unlike the website.** `apps/web` is a static export with no
runtime; `apps/admin` is deliberately the opposite — server components talk to
Postgres directly and nothing about the connection reaches the browser. It
listens on **3001** so it can run alongside `npm run dev` without the two
corrupting each other's `.next`.

Three things worth knowing before extending it:

- **It bypasses RLS.** The portal connects as the database owner, the same
  posture `service_role` has. That is right for an admin tool, but it means RLS
  is not a safety net here: every mutation must go through a server action that
  has already called `requireStaff()` or `requireRole()`.
- **Menu edits do not reach the live site on their own.** Run `npm run sync:menu`
  then `npm run deploy`. The portal says so on the page.
- **Set `STACKD_ADMIN_SECRET` before deploying.** Without it, sessions are signed
  with a per-boot random key, so every restart signs everyone out. In production
  the app refuses to sign a session at all rather than fall back to a default.

---

## The customer portal

```bash
npm run portal    # http://localhost:3002
```

Sign in as `0555000001` or `one@stackd.local`, password `stackd-dev` — a fixture
seeded by `db:reset`. Customers reach it three ways: the **My points** link in the
website header, the printed **signup QR** by the till (admin → Signup QR), or the
QR on their receipt.

| Route | Does |
|---|---|
| `/registration` | Name, email, mobile, password. Signs you straight in. |
| `/login` | Mobile *or* email, plus password |
| `/points` | Balance, the member QR to show at the counter, rewards to claim, history |
| `/claim/[token]` | The bill QR lands here. One tap when signed in. |

It is a **third app, not a route group inside admin**. One misconfigured route in
a shared app puts customers on the staff pages, and that boundary is worth the
extra process. It also gets its own cookie name — a shared one would mean signing
into one portal silently signed you into the other.

⚠ **This is the app that puts customer personal data on the public internet**,
which is exactly what the PDPL hosting question gates. Local until that is
answered.

### Environment before it goes anywhere

| Variable | Why |
|---|---|
| `STACKD_PORTAL_SECRET` | Signs customer sessions. Without it, a restart signs everyone out; in production the app refuses to sign at all rather than use a default. |
| `STACKD_ADMIN_SECRET` | The same, for staff. |
| `STACKD_PORTAL_URL` | The portal's public address. Every printed QR encodes it. |
| `NEXT_PUBLIC_PORTAL_URL` | Where the website's **My points** link points. Baked in at build time. |

The two portal URLs are separate on purpose: one is read by a server at runtime,
the other is compiled into a static site. They should hold the same value.

### Putting it at stackd.com.sa

The website is a static export on Cloudflare Pages and cannot serve
`/registration` or `/login` itself — those need a server and a database. Reaching
them at those exact paths needs one of:

- a **Pages Function** proxying `/registration`, `/login`, `/points` and `/claim/*`
  through to the portal, or
- a **subdomain** such as `my.stackd.com.sa` pointed straight at it.

The subdomain is simpler and is what the QR should encode; the paths above are
what the design assumes. Either way the portal has to be hosted somewhere first,
which is the same blocked decision.

---

Names and descriptions are deliberately **not** editable in the portal. They are
bilingual and the Arabic came off STACKD's own menu board and launch posters —
`supabase/seed.sql` is the right place to change those, carefully.

**Photos upload into `apps/web/public/menu/`**, named by slug, because the
website is a static export and every image has to be a real file at build time.
That is also why a new photo needs `npm run build` before anyone sees it. Crop to
4:3 first; anything else is cropped to fit and you lose control of what gets cut.

---

## Architecture

```
stackd/
├── apps/
│   ├── web/        Next.js static export → Hostinger shared hosting
│   ├── mobile/     Expo → App Store + Google Play
│   └── kitchen/    Order display for the in-store tablet
├── packages/shared/  Design tokens, types, money/VAT math, i18n
└── supabase/         Schema, seed, edge functions
```

**Why hosting is split:** Hostinger shared hosting serves the static site fine,
but cannot run the app backend — no persistent processes, no push. Supabase
provides Postgres, auth, realtime, and storage. Pickup ordering needs realtime:
the customer is standing there watching for "ready".

---

## Design decisions

| Decision | Why |
|---|---|
| Money as integer halalas | Never float. `2700` = 27.00 SAR |
| Order lines snapshot name + price | A price change must not rewrite past receipts |
| Loyalty as append-only ledger | Points are money; disputes need an audit trail. Balance is a cached projection, rebuildable from the ledger |
| Points minted server-side only | RLS blocks all client writes to the ledger |
| `_en` / `_ar` columns, not a translations table | Two locales, both needed on every read |
| VAT stored on the order | Rate changes must not alter history |
| Loyalty inside the main app | A separate app triples cost; customers won't install two |
| Green+gold kept as seasonal override | It's National Day 94 artwork, not the core identity |
| The VAT **rate** is stored, not just the amount | Storing `vat_total` alone half-keeps the rule: after a rate change nobody can tell what an old row was computed at |
| RLS on every table, no exceptions | Behind PostgREST, RLS off means world-**writable** with the anon key. On with no policy is the correct deny-all for server-only tables |
| Points minted only by `mint_loyalty_points()` | The grant is the control. "Server-side only" as a comment is not one |
| Rolling point expiry, not per-lot | Expiring each lot on its anniversary needs FIFO consumption tracking and a second table. Rolling inactivity is one query and is explainable at the counter |
| Walk-in (POS) orders modelled now | The cashier scan flow ships in Phase 2, before app ordering. Adding it later means reshaping `orders` after it holds data |
| Gapless invoice numbers come from a counter table | Sequences deliberately don't roll back — a failed insert burns its number, which ZATCA does not allow |
| `orders.service_date` is stored, not derived | `created_at::date` is STABLE, not IMMUTABLE, so Postgres rejects it in an index. Storing it also gets the 03:00 trading-day boundary right |

---

## Brand

- **Red** `#B82712`, ink `#1B1C19`, gold `#ECA70F`, paper `#FEFEFE` — all sampled
  from the Illustrator vector source, not estimated from a photo
- Logo vectors extracted to `apps/web/public/brand/`: `logo.svg` (flat,
  transparent), `logo-on-white.svg`, `rooster.svg` (detailed illustration, used
  as hero art)
- Mascot: white rooster, red comb, arms crossed, in a red rounded badge
- IG [`@stackdchicken`](https://instagram.com/stackdchicken) · TikTok `@Stackd`

Full token set in `packages/shared/src/tokens.ts`.

---

## Compliance

- **VAT** 15%, stored explicitly per order
- **ZATCA Phase 2** — Wave 24 (turnover > SAR 375K) deadline was **30 June 2026**,
  already passed. Confirm whether STACKD is in scope. Applies to the till today,
  independent of this project.
- **Menu labelling** — calories must be displayed and accurate. See
  `docs/DISCREPANCIES.md` §4.
- **Payments** — Moyasar recommended (Mada ~1.95% + SAR 1, T+1 settlement).
  Apple Pay routes via Mada in KSA.
- **`.com.sa`** requires a Commercial Registration, via an accredited registrar.
  Run a SAIP trademark search first — other `Stack'd` restaurants operate in KSA.

---

## Fonts

Type is **Tajawal** (display) and **Cairo** (body), both SIL Open Font Licence,
self-hosted rather than loaded from Google's CDN.

Both families ship matched Arabic *and* Latin, so the same faces run in both
locales — a bilingual brand should not change typeface when it changes language.

```bash
node scripts/fetch-fonts.mjs
```

Downloads woff2 into `apps/web/public/fonts/` and regenerates
`apps/web/app/fonts.generated.css` (imported by the layout, so Next bundles the
`@font-face` rules into the main stylesheet — no extra blocking request).

Only the `arabic` and `latin` subsets are kept, and each rule carries a
`unicode-range`, so an English page never downloads the Arabic files. The layout
preloads just the two faces the current locale renders.

Licence text travels with the fonts in `apps/web/public/fonts/OFL.txt`, as OFL
requires. Do not delete it.
