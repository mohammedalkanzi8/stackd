# STACKD — where we left off

**Last session:** 30 July 2026
**Live now:** https://stackd-7bc.pages.dev
**Repo:** `/home/kanzi/stackd` (git, all committed)

---

## Pick up here

### 1. Point the domain (blocked on you, 5 minutes)

`stackd.com.sa` is registered at **DNET** and added to Cloudflare, but the zone
is still `pending` because the nameservers have not been changed.

Log into DNET and replace:

```
ns10.dnetns.com          ->   chuck.ns.cloudflare.com
ns11.dnetns.com          ->   lilyana.ns.cloudflare.com
```

Once Cloudflare reports the zone active, attach the custom domain to the Pages
project and it goes live on `stackd.com.sa`. Cloudflare writes the DNS records
itself — nothing to type by hand.

### 2. Roll the Cloudflare API token

The token was pasted into a chat transcript, so treat it as exposed.

**Cloudflare → My Profile → API Tokens → Roll**, then update
`~/.stackd-cf-token` (gitignored, chmod 600).

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
npm test          # 50 tests
npm run build     # static export to apps/web/out/
npm run deploy    # build + push to Cloudflare Pages
npm run preview   # single-file shareable preview
```

**Never run `npm run build` while `npm run dev` is running.** They share
`.next` and the production build corrupts the dev server (500s on every route).
Recovery: `pkill -f "next dev" && rm -rf apps/web/.next && npm run dev`

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
