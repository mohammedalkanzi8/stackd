# STACKD — where we left off

**Last session:** 3 August 2026
**Live now:** https://stackd-7bc.pages.dev
**Custom domain:** `stackd.com.sa` attached, certificate was still provisioning
at end of session — check it serves before announcing the link anywhere
**Repo:** `/home/kanzi/stackd` (git, all committed)

---

## Pick up here

### 1. ~~Point the domain~~ — done, 3 Aug 2026

The DNET nameservers were changed to `chuck` / `lilyana.ns.cloudflare.com` and
the Cloudflare zone went **active**. Both `stackd.com.sa` and
`www.stackd.com.sa` are attached to the Pages project, and `www` 301-redirects
to the apex via `functions/_middleware.js`.

The apex is canonical because that is what the printed menu and the Instagram
bio point at. The redirect lives in the repo rather than as a Cloudflare
Redirect Rule so it is versioned and testable — and because the stored API
token is Pages-scoped and cannot write zone rulesets.

### 2. Roll the Cloudflare API token

The token was pasted into a chat transcript, so treat it as exposed.

**Cloudflare → My Profile → API Tokens → Roll**, then update
`~/.stackd-cf-token` (gitignored, chmod 600). The file holds a shell-sourceable
line, `CLOUDFLARE_API_TOKEN=…`, not a bare token — keep that shape, wrangler
reads it from the environment.

Its scope is Pages-only: it can read the zone list and deploy, but not read DNS
records or write zone rulesets. That is enough for everything this project does.

### 3. Six menu conflicts still open

See `docs/DISCREPANCIES.md`. The blocking one:

**Real calorie figures for Soft Drink and Kenza.** Both printed menus copied
the sauces column (67 / 62 / 75), which is why water was listed at 75 kcal.
Those two are currently `null` — the site omits them rather than publishing
numbers known to be wrong. Saudi menu-labelling rules require accuracy.

Also unresolved: Giants calorie counts (1100/1200 digital vs 1500/1600
in-store), Classic-Stackd calories (the in-store board disagrees with itself),
and the Arabic names for Tortilla Strips and Chicken Strips (currently my
translations, not confirmed).

### 4. Food photography — the biggest visual gap

Slots are built and waiting. Drop files into `apps/web/public/menu/` named by
slug, then set `image:` on the item in `packages/shared/src/menu.ts`.

Brief in `apps/web/public/menu/README.md`. Short version: 4:3, 1200px wide,
natural light, shot about 30° above.

Could not be sourced automatically — Instagram serves a login wall, TikTok a
bot-detection shell, and the photos embedded in the supplied menu image are
about 120×90px.

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
| Microsoft 365 for email | Chosen by owner. Records ready in `docs/deploy/README.md`, not yet applied |
| Arabic is the default locale | Khobar restaurant; English is secondary |
| Money as integer halalas | `2700` = 27.00 SAR. Never floats |
| **Prices are VAT-inclusive** | KSA requires it. 27 SAR *contains* its VAT. Never add 15% on top — see `splitVatInclusive` |
| Loyalty as append-only ledger | Points are money; disputes need an audit trail |
| Points earned on the pre-VAT net | A 60 SAR ticket earns 52, not 60 |
| Photos on dishes only | Sauces and drinks stay text cards; 17 placeholder tiles looked unfinished |
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
