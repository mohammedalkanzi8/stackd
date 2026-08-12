# Product

<!-- impeccable:product-schema 1 -->

One record for the whole STACKD platform. The three apps — `apps/web` (the public
site), `apps/portal` (customers), `apps/admin` (staff) — are surfaces of one
restaurant and share their users, brand, menu, market and legal constraints.
Surface strategy (mode, narrative, CTA sequence) belongs in each surface brief,
not here.

## Platform

web

All three apps are web. `PLAN.md` proposes an Expo iOS/Android app; it is **not
built** and nothing in the repo implements it. Treat native as undecided, not
planned-and-late.

## Users

**Primary — a hungry local, on a phone.** Someone in or near North Khobar working
out where to eat, usually late, usually arriving from Instagram
(`@stackdchicken`), TikTok (`@Stackd`), or a map search. Their job is to decide
whether STACKD is worth the trip, and then to make the trip. Confirmed: the
website's job is to turn them into a walk-in, and **success is measured at the
counter, not on the site.**

**Members** (`my.stackd.com.sa`) — existing customers checking a points balance,
showing their member QR to a cashier, claiming a reward, claiming a receipt after
a cash purchase, or recovering a forgotten password.

**Staff** (`admin.stackd.com.sa`) — four roles on one branch: `cashier`,
`kitchen`, `manager` (labelled **Admin**), `owner` (labelled **Super Admin**).
They enrol members at the counter, scan member codes, run the day's orders, void
mistakes, read reports, and print signup material.

⚠ **Loyalty signups happen at the counter, not on the website.** Confirmed
12 Aug 2026. Any future design that assumes web self-signup is the main path is
designing for a flow that does not carry the volume.

## Product Purpose

STACKD is a single-branch fried chicken restaurant in North Khobar, Eastern
Province, Saudi Arabia. It sells stacked chicken sandwiches, loaded bowls, sides
and sauces, and trades late — 16:00 to 04:00, every day.

The digital platform exists to do two things: **bring a first-time customer
through the door**, and **bring them back**. The website does the first. STACKD
Rewards — the loyalty programme, run through the customer and staff portals —
does the second.

Success is footfall and repeat visits, not sessions or signups.

## Positioning

**The food itself.** Confirmed: the recipe is what a competitor could not
truthfully copy. Not the price, not the branding — those support it. The stack,
the sauces and the Giants bowls are the product, and the platform's job is to
show them honestly and make them wanted.

The practical consequence: **photography and menu truth carry the persuasion.**
This is why the food images are real photographs of real product at the size it
is served, why nothing is ever added to food in an image, and why the printed
menu, the database and the site are held in agreement.

## Operating Context

- **One branch.** STACKD, North Khobar / ستاكد - الخبر الشمالية. Al Khobar Al
  Shamalia, Al Khobar 31311. `050 033 8808`. `info@stackd.com.sa`.
- **Hours 16:00–04:00 daily.** Late-night trade is real trade. The reporting
  trading day runs to 05:00 — the closing hour plus one — so a ticket finalised
  at 04:20 belongs to the night that is ending, not the day beginning.
- **Three ways to get the food, all live:** dine in at the branch, takeaway from
  the counter, and delivery through third-party platforms.
- ⚠ **No first-party online ordering exists** — not on the website, not in the
  customer portal. Nothing in the codebase implements it. The site must not
  imply otherwise. (`PLAN.md` says "pickup ordering, no delivery"; that is
  **stale**. `BRANCH.services` is correct: dine-in, takeaway and delivery.)
- **The counter is the loyalty surface.** Cashiers enrol members and scan codes;
  receipts carry a claim QR so an anonymous cash sale can still be credited later.
- **POS is Kashier Pro by DKEYS** (Dammam). Integration is open — no webhook or
  API documentation published; asked for directly. Kashier has its own loyalty
  module which must stay switched off.
- **Bilingual Arabic and English, both first class**, RTL and LTR. A monolingual
  surface in Al Khobar excludes half the people looking at it.
- **Money is SAR, stored as halalas** (2700 = 27.00). Never floats. One loyalty
  point is one halala by design, so a points total *is* a halala total.
- **ZATCA VAT invoicing.** Invoice numbers are sequential per branch with no
  gaps, which is why a voided order is marked rather than deleted.

## Capabilities and Constraints

**The website is a static export.** `apps/web` builds to plain HTML/CSS/JS and
ships to Cloudflare Pages. No server, no API routes, no middleware, no
request-time rendering, no `next/image` optimisation. Consequences that bind
every future design:

- Images must be correctly sized before they ship. `CardMedia` declares
  1200×900 and `scripts/shoot-to-web.mjs` writes exactly that.
- Locale routing is a `[locale]` segment plus `generateStaticParams`, not Next's
  i18n config.
- The site cannot hold an account or read a database. Anything needing one is an
  outbound link to `my.stackd.com.sa`.
- Anything placed in `public/` is published. A README once shipped to
  `stackd.com.sa/menu/README.md`.

**The menu is generated, not authored.** `packages/shared/src/menu.ts` is
rewritten between its `<generated:menu>` markers by `npm run sync:menu`, from the
database. Hand edits inside the markers are overwritten. `BRANCH` and `BRAND`
below those markers are hand-written and safe.

**Menu shape:** 5 categories, 17 items. Mains 27–48 SAR. Sauces are deliberately
text-only cards, on the printed menu as well as the site.

**Loyalty:** earn is a percentage of the bill (`loyalty_settings.earn_percent`,
currently 10%), or a fixed per-item award where one is set. 500-point floor on
counter redemptions; the rewards catalogue is deliberately exempt. 100 points =
1 riyal.

**PDPL — customer personal data stays in the Kingdom.** The database and both
portals run on Oracle Cloud Riyadh (`me-riyadh-1`), verified from instance
metadata. `my.stackd.com.sa` and `admin.stackd.com.sa` must stay DNS-only at
Cloudflare; proxying them would terminate TLS at a US edge and become the exact
cross-border transfer PDPL governs. The apex and `www` are proxied and carry no
personal data.

⚠ **Some `calories` are `null` on purpose** — it means the printed menu carries a
value known to be wrong. See `docs/DISCREPANCIES.md` §4. Null is "we don't
publish a number", not "we forgot one".

## Brand Commitments

- **Name:** STACKD / ستاكد
- **Tagline:** *Street food. Real flavor. Stacked right.* / *طعام الشارع. نكهة
  حقيقية. مرصوص بإتقان.*
- **Slogan:** *Don't Eat. Get STACKD* / *لا تأكل. خذ ستاكد*
- **Palette, as implemented:** `--red: #b82712`, `--gold: #eca70f`, with
  `--red-hot: #e8391c`, `--red-deep: #7f1b0c`, `--red-dark: #3d0d06`,
  `--gold-soft: #f7d583`, on near-black. ⚠ `PLAN.md` records `#D8231A`; that is
  **stale** — `apps/web/app/globals.css` is the truth.
- **Green and gold are seasonal only** (National Day 94) and are not the brand.
- **Type:** Tajawal and Cairo, self-hosted woff2, Arabic and Latin cuts,
  generated by `scripts/fetch-fonts.mjs` into both `apps/web` and `apps/admin`.
- **Dark by default**, light only via the header toggle.
- **The rooster is the mascot**, in a rounded badge. ⚠ The full-body artwork's
  right foot is broken in the *source vector* — page 2 of the supplied PDF is an
  auto-traced bitmap that degraded below the shins. Not fixable in code. A clean
  full-body vector from the designer is the only fix.
- **STACKD Rewards has its own mark:** three ascending chevrons, gold on red, in
  the same badge shape the rooster sits in, so it reads as family rather than a
  second logo.

**Two Arabic typography rules, learned expensively and non-negotiable:**

1. **Never letter-space Arabic.** It is cursive; tracking pulls the joins open
   into gaps mid-word.
2. **`text-transform: uppercase` is meaningless in Arabic** and travels with
   letter-spacing in copy-pasted label styles. Undo both under `:lang(ar)`.

**Copy rules:** no em dashes in visible copy, including the browser tab title.
Each language keeps its own numerals where a sheet is language-led (`١٠٪` on the
Arabic print sheets, `10%` on the English).

## Evidence on Hand

**Real and usable:**

- **Photography** — `apps/web/public/menu/*.webp`, 10 photographs, August 2026
  shoot. Sources in `new_shots/`, pipeline `scripts/shoot-to-web.mjs`, brief
  `docs/menu-photography.md`. That is every food item that takes a photo card —
  3 burgers, 2 strips, 2 Giants, 3 sides — with **no branded placeholders left**.
  The remaining 7 items are the 4 sauces and 3 drinks, which are text-only cards
  by decision, on the printed menu as well as the site.
- **The menu, prices and calories**, agreeing with the printed menu and the
  database.
- **The branch** — real address, phone, Google Maps link, hours.
- **The loyalty programme** — live, with real members and a real ledger.

**Absent. Do not fabricate any of it:**

- No testimonials, reviews, star ratings, or customer quotes.
- No press, awards, or "as featured in".
- No follower counts, order counts, or "N customers served".
- No delivery-platform ratings.

⚠ **There is still no photograph of Fire-Attack.** Its card is the Scoopy-Doo
photograph, differently cropped and graded, which is honest only because the
owner confirmed they are one dish with a different sauce. If that ever stops
being true, the card is a lie and needs a real shot.

## Product Principles

1. **The counter is the conversion.** The website's job ends when someone decides
   to come. Design for the decision, not for a funnel the shop does not have.
2. **The food is the argument.** Show it honestly and at the size it is served.
   Nothing is added to food in an image, ever — no drawn-on garnish, no
   fabricated heat, no sauce that was not there.
3. **Both languages are first class.** Not a translation layer over an English
   site. Arabic gets its own typography, its own numerals where appropriate, and
   correct `dir` on every run.
4. **Late is normal.** The shop opens at 16:00 and closes at 04:00. Hungry at
   1 a.m. is the core case, not an edge one.
5. **One source of truth per fact.** Hours, the earn rate, the redemption floor
   and the menu each live in exactly one place and are read from there. Every
   time this project has published something false, it was a second copy that
   drifted.

## Accessibility & Inclusion

- **Bilingual AR/EN with correct direction per run.** Without `dir` on each
  foreign-language run, the bidi algorithm strands trailing punctuation on the
  wrong side.
- **Phone first.** Most visitors arrive on a phone from a social link. On small
  screens the header labels are visually hidden and only glyphs remain, with
  `aria-label` keeping them announced.
- **WCAG contrast is a fixed defect class here**, not an aspiration — four
  failures were found and fixed in light mode on 3 Aug 2026. Gold as text
  darkens with the theme rather than using `--gold` directly, because `--gold`
  reaches 9.2:1 on the dark ground and fails on cream.
- No product-specific standard has been mandated beyond this.
