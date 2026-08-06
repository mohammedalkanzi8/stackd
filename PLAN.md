# STACKD — Digital Platform Plan

**Brand:** STACKD / ستاكد — *Street food. Real flavor. Stacked right.*
**Slogan:** Don't Eat. Get STACKD
**Location:** الخبر الشمالية (North Khobar), Eastern Province, KSA
**Social:** IG `@stackdchicken` · TikTok `@Stackd`
**Palette:** red `#D8231A` / near-black / white / checkerboard — *not* green+gold
(that's National Day 94 seasonal only)
**Scope decided:** pickup ordering (no delivery), Expo for iOS + Android, points-per-riyal loyalty

Menu is seeded (`seed.sql`): 5 categories, 17 items, 27–48 SAR mains.
**7 open data conflicts — see `DISCREPANCIES.md`.**

---

## Architecture

```
stackd/
├── apps/
│   ├── web/          Next.js (static export) → Hostinger shared hosting
│   ├── mobile/       Expo / React Native → App Store + Google Play
│   └── kitchen/      Web-based order display for staff (tablet in the store)
├── packages/
│   ├── shared/       Design tokens, types, money + VAT math, i18n strings
│   └── api/          Supabase client, typed queries
└── supabase/
    ├── schema.sql
    └── functions/    Edge functions: checkout, loyalty accrual, ZATCA reporting
```

**Why split hosting:** Hostinger shared hosting serves the static website well and it's
what's already being bought. It cannot run the app backend — no persistent processes,
no push infrastructure. Supabase covers Postgres + auth + realtime + storage on a free
tier that comfortably fits a single-branch restaurant. The two are independent; the
website can read the menu from Supabase at build time and redeploy on menu change.

**Realtime matters here.** Pickup ordering means the customer is waiting and watching.
Supabase realtime pushes `orders.status` changes straight to the app, and to the
kitchen display, without polling.

---

## Critical path

### Phase 0 — Before spending money
- [ ] **SAIP trademark search on "STACKD"** — several `Stack'd` restaurants already
      operate in KSA (HungerStation lists Riyadh, Hofuf, Dammam University) plus
      Stack'd Burger brands in Malaysia, Egypt, NYC. Confirm the mark is defensible
      before building brand equity on it.
- [ ] **Confirm ZATCA wave status.** Wave 24 (turnover > SAR 375K) had a compliance
      deadline of 30 June 2026 — already passed. If turnover clears that threshold,
      Phase 2 e-reporting is already mandatory: UBL 2.1 XML, 9-tag TLV QR, reported
      to ZATCA within 24h of each B2C sale. Check for a ZATCA notification letter.
- [ ] `stackd.com.sa` via an accredited registrar — needs the CR in the business name.

### Phase 1 — Website (2 weeks)
Static, bilingual, fast. This is the highest-leverage piece: it's what Google shows.
- Bilingual AR/EN with true RTL (not a mirrored LTR layout)
- Menu with photos, prices, calories — Saudi menu-labelling rules require calories
- Branch page: map, hours, phone, directions deep-link
- App store badges once the apps ship
- Schema.org `Restaurant` + `Menu` markup — drives Google rich results
- Static export → upload to Hostinger `public_html`

### Phase 2 — Mobile app, menu + loyalty (4 weeks)
Ship *without* ordering first. Gets the app in stores, starts accumulating members,
and removes payment/ZATCA from the critical path.
- Phone OTP auth (Supabase) — phone-first, KSA customers expect this over email
- Menu browsing, item detail, modifiers
- Loyalty: balance, QR code for in-store scan, reward catalogue, ledger history
- Staff scan flow: cashier scans customer QR → points accrue against the real ticket
- Push notifications for reward milestones

### Phase 3 — Pickup ordering (4 weeks)
- Cart with modifiers, branch + time slot picker
- **Moyasar** for payment: publishes Mada pricing (~1.95% + SAR 1 vs Tap's
  2.5% + SAR 1), T+1 settlement, simplest Mada onboarding for a single-brand SME.
  Apple Pay routes through Mada in KSA so it lands on the same rate.
- Order status timeline, realtime, push on `ready`
- Kitchen display app — tablet in the store, accept/prepare/ready
- ZATCA-compliant receipt with QR

### Phase 4 — Growth
- Delivery aggregator listings (HungerStation, Jahez, Keeta) — separate from the app
- Referral codes, birthday rewards, 2x-point promos

---

## Decisions already baked in

| Decision | Rationale |
|---|---|
| Money as integer halalas | Never float. `3450` = 34.50 SAR |
| Order lines snapshot name + price | A menu price change must not rewrite order history |
| Loyalty as append-only ledger | Points are money; disputes need an audit trail. Balance is a cached projection |
| Points minted server-side only | RLS blocks client writes to the ledger |
| `_en` / `_ar` columns, not a translations table | Two locales, both needed on every read |
| VAT stored on the order, not computed | Rate changes must not alter past orders |
| Loyalty inside the main app | A separate loyalty app triples cost and nobody installs two apps |

---

## Blocked on client input

1. **Resolve the 7 menu conflicts** in `DISCREPANCIES.md` — especially the wrong
   drink calories, which are a labelling-compliance issue on both printed menus
2. Full street address + national address, phone, opening hours per weekday
3. Logo files (SVG/PNG transparent) + mascot isolated from the badge
4. Item photos — the digital menu has them, but I need originals not screenshots
5. ~~POS system?~~ **ANSWERED 6 Aug 2026: Kashier Pro, by DKEYS (Dammam).**
   Foodics was evaluated and rejected — it is the default choice at three or
   more branches, and STACKD has one, so its multi-branch advantages are value
   that cannot be collected yet. It is also iPad-only, from SAR 1,499 a till.
   The idle Foodics licence is being cancelled. Integration now waits on whether
   DKEYS will expose a webhook; see STATUS.md.
6. Commercial Registration number + VAT number (needed for ZATCA receipts)
7. Arabic names for Tortilla Strips and Chicken Strips (mine are translations)
