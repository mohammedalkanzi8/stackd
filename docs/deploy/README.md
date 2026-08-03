# Deploying stackd.com.sa

**Host:** Cloudflare Pages (free)
**Domain:** `stackd.com.sa`, registered at DNET
**Email:** MXroute — live and working as of 3 August 2026 (not Microsoft 365)

Cloudflare was chosen over Hostinger because the site is a static export and
Cloudflare has data centres in **Dammam, Jeddah and Riyadh**. Dammam is roughly
20 minutes from the branch; Hostinger's nearest server is Germany, about
4,500 km away. Cloudflare Pages also has no bandwidth cap, which matters for a
brand whose traffic spikes come from TikTok.

---

## One-time setup

### 1. Create the Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages**.

Either connect a Git repository (recommended — every push deploys itself) or
choose direct upload and use the CLI below.

**Build settings — these exact values:**

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `apps/web/out` |
| Root directory | `/` (repository root) |
| Node version | `22` |

Root directory must stay at the repository root. This is an npm workspaces
monorepo, so `npm install` has to run at the top level, and the `functions/`
directory is resolved from there too.

### 2. Add the custom domain

**Pages project → Custom domains → Set up a domain →** `stackd.com.sa`

Add `www.stackd.com.sa` as well.

**Check the production branch first.** Custom domains serve the *production*
deployment only. If the project's `production_branch` does not match the branch
you deploy from, every deploy lands as a **preview**, reports success, and
changes nothing on the live domain. This project deploys from `master`, so
`production_branch` is `master` and `npm run deploy` pins `--branch=master`.
On 3 Aug 2026 it was set to `main` — a branch that does not exist here — and the
live site stayed frozen on a week-old build through several "successful" deploys.

**Use the dashboard, not the API.** Attaching a custom domain through the
dashboard also creates the proxied `CNAME` that points the hostname at the Pages
project. Attaching it through the API does not create that record unless the
token has DNS edit permission — and the project token is Pages-scoped only. The
domain then sits at `status: pending` **with an empty error message**, because
certificate validation is over HTTP and cannot complete while the hostname
resolves to nothing. It waits forever and never explains why. This happened on
3 Aug 2026.

If a domain is stuck `pending`, check for the DNS record first:

```bash
curl -s -H "accept: application/dns-json" \
  "https://cloudflare-dns.com/dns-query?name=stackd.com.sa&type=CNAME"
```

No `Answer` field means the record is missing. Add it by hand:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `@` | `stackd-7bc.pages.dev` | **Proxied** — orange cloud |
| CNAME | `www` | `stackd-7bc.pages.dev` | **Proxied** — orange cloud |

Both must be proxied. Grey cloud does not serve Pages. Note this is the opposite
of the mail records, which must all be grey.

`www` does **not** redirect to the apex on its own — Cloudflare serves the same
site on both hostnames, which splits search ranking. The 301 comes from
`functions/_middleware.js` in this repo.

**Expect "server not found" for up to 30 minutes after adding the records, even
though the site is live.** While the hostname had no `A` record, every resolver
that was queried cached that *negative* answer, and this zone's negative-cache
TTL is the SOA minimum — **1800 seconds**. The real records have a 161-second
TTL, so the stale "no such name" outlives them by ten times over. If an ISP
round-robins between cache nodes the site appears to work, then fail, then work
again. This looked like an outage twice on 3 Aug 2026; both times nothing was
wrong.

Confirm the server is fine before touching anything — query a resolver directly
instead of trusting the local one:

```bash
curl -s -H "accept: application/dns-json" \
  "https://cloudflare-dns.com/dns-query?name=stackd.com.sa&type=A"
curl -s "https://dns.google/resolve?name=stackd.com.sa&type=A"
```

If both return `104.21.x.x` / `172.67.x.x` addresses, DNS is correct and the
problem is a cache between you and them. Flush the OS resolver, clear Chrome's
separate cache at `chrome://net-internals/#dns`, and **reboot the router** — it
caches for the whole network. Testing over mobile data uses a different resolver
and settles the question immediately.

### 3. Point DNET at Cloudflare

Cloudflare will show two nameservers, something like:

```
xxxx.ns.cloudflare.com
yyyy.ns.cloudflare.com
```

In the DNET control panel, replace the existing nameservers with those two.

Propagation is usually under an hour but can take up to 24. HTTPS is issued
automatically once the domain resolves — no certificate to buy or renew.

---

## Deploying from the command line

If you did not connect Git:

```bash
npm run deploy
```

That builds and pushes `apps/web/out` to the `stackd` project. First run opens a
browser to authorise Wrangler against your Cloudflare account.

To publish to a preview URL instead of production:

```bash
npm run deploy:preview
```

---

## What handles routing

Cloudflare Pages ignores `.htaccess`. Three files replace it:

| File | Purpose |
|---|---|
| `apps/web/public/_redirects` | `/` → `/ar/` fallback |
| `apps/web/public/_headers` | Security headers, cache policy |
| `functions/index.js` | Accept-Language detection on `/` |

`public/` is copied verbatim into `out/`, so the first two land at the output
root where Cloudflare expects them.

Request order is **Functions → static assets → _redirects**. The Function
handles `/` normally; the `_redirects` rule is the safety net if Functions are
ever misconfigured, so the domain root is never a 404.

The old Apache config is preserved at `docs/deploy/htaccess-apache.txt` in case
the site ever moves to Apache hosting. It is deliberately **outside** `public/`
— left there, Cloudflare would serve it as a publicly readable file.

---

## Enabling HSTS (after launch, not before)

Once `https://stackd.com.sa` is confirmed working, uncomment the
`Strict-Transport-Security` line in `apps/web/public/_headers` and redeploy.

Do not enable it earlier. HSTS tells browsers to refuse plain HTTP for a year;
turning it on before the certificate is verified can lock visitors out with no
quick way back.

---

## Email — MXroute, live since 3 August 2026

Microsoft 365 was the earlier plan; **MXroute** is what was actually set up, and
it is working. Recorded here so nobody "fixes" the DNS back to the Outlook
records. What is live:

| Type | Name | Value | Proxy |
|---|---|---|---|
| MX | `@` | `sunfire.mxrouting.net` (priority 10) | DNS only |
| MX | `@` | `sunfire-relay.mxrouting.net` (priority 20) | DNS only |
| TXT | `@` | `v=spf1 include:mxroute.com -all` | DNS only |
| TXT | `x._domainkey` | `v=DKIM1; k=rsa; p=…` (MXroute uses the `x` selector) | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=…@dmarc-reports.cloudflare.net` | DNS only |

**Every mail record must be "DNS only" — grey cloud, not orange.** Proxying a
mail record through Cloudflare breaks delivery. This is the single most common
mistake when moving DNS to Cloudflare.

DMARC is at `p=none`, which only collects reports — a spoofed STACKD email is
still delivered today. Reports go to Cloudflare's DMARC Management dashboard.
Once a few weeks of reports show nothing legitimate failing, move to
`p=quarantine`, then `p=reject`.

Note the apex carries both `MX` records and the website's `CNAME`. That
combination is illegal in plain DNS but valid here because Cloudflare flattens
apex CNAMEs — adding or changing the website record does not affect mail.

---

## Checks after going live

```bash
curl -I https://stackd.com.sa/                 # expect 302 -> /ar/ or /en/
curl -I https://stackd.com.sa/ar/              # expect 200
curl -I -H "Accept-Language: en-US" https://stackd.com.sa/   # expect -> /en/
curl -I https://stackd.com.sa/ar/menu/         # expect 200
```

Then confirm in a browser:

- `https://` works and the padlock is valid
- `www.stackd.com.sa` redirects to the apex
- The ع | EN switch keeps you on the same page
- The "Open now" pill reflects the real time in Riyadh
