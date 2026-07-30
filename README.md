# STACKD — Digital Platform

Website, iOS/Android app, and loyalty program for **STACKD / ستاكد**
American street food · الخبر الشمالية (North Khobar), KSA

> **Street food. Real flavor. Stacked right.** · *Don't Eat. Get STACKD*

---

## Status

| Piece | State |
|---|---|
| Data model (`supabase/schema.sql`) | Written — **not yet executed against a database** |
| Menu seed (`supabase/seed.sql`) | Written — 13 items, official Arabic names |
| Design tokens (`packages/shared/src/tokens.ts`) | Done |
| Website | Not started — blocked on address/hours/photos |
| Mobile app | Not started |
| Kitchen display | Not started |

⚠ **Read [`docs/DISCREPANCIES.md`](docs/DISCREPANCIES.md) first.** Seven conflicts
between the two supplied menus are unresolved, including wrong calorie data on
both printed menus.

---

## Environment setup required

This machine is **Ubuntu 26.04 on WSL2** and has neither Node nor Postgres
installed in Linux. The `npm` currently on `PATH` is Windows' npm bleeding
through WSL interop:

```
$ type npm
npm is /mnt/c/Program Files/nodejs/npm
```

Do **not** build with that — native modules compile for the wrong platform and
Expo's tooling misbehaves on Windows paths mounted under `/mnt/c`.

### Install Node in WSL

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Then confirm it resolves to Linux, not Windows:

```bash
command -v node   # should print /usr/bin/node
```

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
