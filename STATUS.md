# STACKD — where we left off

**Last session:** 3 August 2026
**Live now:** https://stackd.com.sa — verified serving, `www` 301s to the apex
**Email:** MXroute, live and working (SPF + DKIM + DMARC all present)
**Repo:** `/home/kanzi/stackd` (git, all committed)

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
| **MXroute** for email, not Microsoft 365 | Set up and working 3 Aug 2026. Supersedes the earlier M365 plan — don't "fix" the DNS back to the Outlook records. Live values in `docs/deploy/README.md` |
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
