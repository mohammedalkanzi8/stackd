# STACKD — Digital Platform

Website, iOS/Android app, and loyalty program for **STACKD / ستاكد**
American street food · الخبر الشمالية (North Khobar), KSA

> **Street food. Real flavor. Stacked right.** · *Don't Eat. Get STACKD*

---

## Status

| Piece | State |
|---|---|
| Data model (`supabase/schema.sql`) | Written — **not yet executed against a database** |
| Menu seed (`supabase/seed.sql`) | Written — 17 items, official Arabic names |
| Design tokens (`packages/shared/src/tokens.ts`) | Done |
| Hours / money / VAT logic | Done — **27 unit tests passing** |
| Website | **Builds and exports** — 6 pages, AR + EN. Needs real photos |
| Mobile app | Not started |
| Kitchen display | Not started |

⚠ **Read [`docs/DISCREPANCIES.md`](docs/DISCREPANCIES.md) first.** Six conflicts
between the two supplied menus remain unresolved, including wrong calorie data on
both printed menus. (Water price is resolved: 2 SAR.)

---

## Running it

```bash
npm install
npm test          # 27 tests: hours logic, VAT math, menu integrity
npm run dev       # http://localhost:3000/ar/
npm run build     # static export into apps/web/out/
```

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

### Postgres (optional — for local schema testing)

The schema targets Supabase, so you can apply it in the Supabase SQL editor
without installing anything locally. For offline work:

```bash
sudo apt install -y postgresql-client   # psql only
# or the full local stack:
npm i -g supabase && supabase init && supabase start   # needs Docker
```

---

## Applying the schema

Against a Supabase project:

```bash
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

`schema.sql` references `auth.users`, which only exists inside Supabase. On a
plain Postgres instance, stub it first or strip the `customers.id` FK.

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

---

## Brand

- **Red** `#D8231A` (the badge), near-black wordmark, white, red/white checkerboard
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
