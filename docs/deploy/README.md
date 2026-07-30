# Deploying stackd.com.sa

**Host:** Cloudflare Pages (free)
**Domain:** `stackd.com.sa`, registered at DNET
**Email:** Microsoft 365 (set up later — DNS records below when you are ready)

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

Add `www.stackd.com.sa` as well; Cloudflare will redirect it to the apex.

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

## Microsoft 365 email — for later

Email is independent of hosting. Once DNS is on Cloudflare, add these in
**Cloudflare → DNS**. Microsoft gives you the exact values during setup; the
shapes are:

| Type | Name | Value | Proxy |
|---|---|---|---|
| MX | `@` | `stackd-com-sa.mail.protection.outlook.com` (priority 0) | DNS only |
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | DNS only |
| CNAME | `autodiscover` | `autodiscover.outlook.com` | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@stackd.com.sa` | DNS only |
| CNAME | `selector1._domainkey` | (from Microsoft) | DNS only |
| CNAME | `selector2._domainkey` | (from Microsoft) | DNS only |

**Every mail record must be "DNS only" — grey cloud, not orange.** Proxying a
mail record through Cloudflare breaks delivery. This is the single most common
mistake when moving DNS to Cloudflare.

Start DMARC at `p=quarantine`. Move to `p=reject` once you have watched the
reports for a few weeks and confirmed nothing legitimate is failing.

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
