# STACKD — where we left off

**Last session:** 13 August 2026 · **LIVE**
**Live now:** https://stackd.com.sa — verified serving, `www` 301s to the apex
**Email:** MXroute, live and working (SPF + DKIM + DMARC all present). Password
reset codes send as `rewards@stackd.com.sa`; `SMTP_URL` is required in production
**Repo:** `/home/kanzi/stackd` (git, all committed)
**Theme:** dark for everyone; light only via the header toggle
**Phone:** 050 033 8808 · **Published contact:** info@stackd.com.sa (the public
one — `mohamed.kanzi@` is an admin-portal login and is never shown to customers)
**Hours:** 16:00 – 04:00 daily. Change them in `STACKD_HOURS` *and* a migration
**Portals:** my.stackd.com.sa (customers) · admin.stackd.com.sa (staff, EN/AR) · Oracle Riyadh
**Staff logins:** info@stackd.com.sa (Super Admin) · saddah.muawia@stackd.com.sa (Admin)
**POS:** Kashier Pro by DKEYS — integration waiting on their support team

---

## 13 August 2026 — the website publishes itself when the menu changes

**✅ LIVE.** Edit a price in the admin portal and `stackd.com.sa` updates itself
within about two and a half minutes. No commands, no laptop.

**Proved end to end on production:** Classic-Stackd changed 27.00 → 28.00 in the
database, the site showed 28.00 unaided at t+2m30s, then the price was put back
and 28.00 was gone by t+2m00s.

### ⚠ Why it has to run on the VM

Three constraints, each of which alone rules out the obvious alternatives:

- **The Pages project is DIRECT UPLOAD only** — no Git connection, no build
  command. There is nothing on Cloudflare's side that *could* rebuild, so a
  deploy hook would do nothing at all.
- **The database is not publicly reachable.** Compose publishes 80 and 443 and
  nothing else, so a remote builder could not read the menu even if one existed.
- **The VM host has no Node**, only Docker — hence a container.

The VM is the only place that holds the repo, the database and the uploaded
photographs together. The photos matter: `apps/web/public/menu` is bind-mounted
into the admin container, so a photo uploaded through the portal lands in the
repo checkout and is picked up by the next build.

### ⚠ The cheap check is the whole design

The timer fires every two minutes and almost always does nothing but **one SQL
query and a file comparison**. The heavy container — Next build, upload — starts
only when the fingerprint has actually moved.

The fingerprint covers every field `sync-menu.mjs` reads, plus the rewards
catalogue and the earn rate (the site states both in its own copy), plus the
photo directory, because a replaced photograph changes the site without touching
a row.

**The state file is written only on success.** A failed build is retried on the
next tick rather than being marked done — one broken publish must not leave the
site permanently stale and silent about it.

### The pieces

| | |
|---|---|
| `deploy/auto-publish.sh` | the fingerprint check and the trigger |
| `deploy/publish.Dockerfile` | image with dependencies baked in — `npm ci` on two cores is minutes on its own |
| `deploy/publish.sh` | sync:menu → build → wrangler, inside the container |
| `deploy/stackd-publish.{service,timer}` | every two minutes, `Type=oneshot` |

`publish` sits behind a **compose profile**, so `up -d` never starts it. It is a
task, not a service, and a task in the default profile runs at the worst
possible moment.

### ⚠ Two traps this hit

**`STACKD_DB`, not `PGDATABASE`.** The first run failed with *database
"stackd_dev" does not exist*: `scripts/db-reset.mjs` derives the name from
`STACKD_DB` and defaults it to the dev database, and the service passed only the
standard PG\* vars, which pg honours for the connection but that helper never
reads.

**The VM has no cron.** The image ships without it. A systemd timer is better
anyway — journald captures the output, there are no PATH surprises, and
`Type=oneshot` stops a second publish starting on top of a running build.

### ⚠ A price edit is now live in minutes with nobody reviewing it

That is the owner's explicit decision — the admin edit *is* the decision. It
also means a typo in a price reaches customers before anyone notices. The
15-minute hold and the manual publish button were both offered and declined.

---

## 13 August 2026 — the customer portal is bilingual, and Arabic is the default

**✅ LIVE.** 122 keys across every customer screen, with a language switch on
each one — including the screens reachable before sign-in.

### ⚠ The shop had been collecting this preference all along and never using it

`customers.locale` has defaulted to `'ar'` since the schema was written, the
registration form asks for it, and the counter signup sets it — **while the
portal served every customer English.**

So Arabic is the default, and the language cookie is **seeded from the
customer's own record at sign-in**. A member enrolled at the counter as an
Arabic speaker now opens the portal in Arabic without touching anything. Seeded
in `startSession()` rather than read in the layout, so the common request path
carries no extra query, and only when the cookie is absent, so a customer who
switches keeps their choice.

⚠ **The switch has to be on the pre-auth screens too.** It first shipped only in
the signed-in chrome, which meant a new customer landing on the Arabic sign-in
page had no route to English. That matters more here than in the staff portal
*because* Arabic is the default.

### ⚠ A space between two JSX expressions is not rendered

`{label}<span className="hint">` produced `كلمة المرورat least 8 characters` —
the two runs jammed together, and then bidi reordered the halves, which made a
missing space look like broken Arabic.

The gap is a `margin-inline-start` on `.hint` now, so it cannot be lost by an
edit to the markup, and the hint is its own bidi isolate so a Latin hint beside
an Arabic label cannot be reordered into it.

### ⚠ There was a SECOND English reason map, named differently

`REASON` in the portal, `REASON_LABEL` in two admin files. Removing the ones a
regex could find left this one, which is why every line of a customer's history
stayed English under an Arabic heading. All three are gone; reasons come from
the dictionary keyed by the database enum.

### ⚠ The audit note is no longer shown to customers

It is written by and for staff, in English, and carried strings like
`Refund: reward claim gave no code (fix 0008) #19` — an internal reference that
means nothing to a customer and cannot be translated. The reason and the reward
name already say what happened.

### What carried over, and what it cost to learn twice

Everything the staff portal learned the hard way applies here and is written
into `apps/portal/app/globals.css`: never letter-space or uppercase Arabic;
Western numerals so a code read aloud and a total checked against a receipt
match; and **`unicode-bidi: isolate` WITHOUT `direction` on block elements** —
direction on a block also flips how `text-align: start` resolves, which is what
threw the staff portal's figures to the wrong side of every column.

⚠ **A sweep over JSX text nodes cannot find a translated UI.** Strings assembled
inside expressions — ternaries, template literals, chip labels, select options,
server-action error messages — are invisible to it. That blind spot hid about
170 strings in the staff portal and another handful here. Sweep for quoted
string literals as well as text nodes.

`scripts/fetch-fonts.mjs` now mirrors the woff2 into **every** app that renders
Arabic rather than just `web` and `admin`. Hand-copying is how they drift on the
next run, and the failure surfaces as a heading set in the wrong typeface.

---

## 13 August 2026 — a reward claim took the points and gave back nothing

**✅ FIXED AND LIVE.** Migration `0008_reward_redemption_tokens.sql`, applied to
production. **The 300 points taken by the broken path have been refunded.**

Reported from the live portal: claiming Free Sauce deducted 300 points and showed
no code. Nothing to present at the counter, and no way to get the points back.

### ⚠ The two redemption paths were asymmetric in the worst direction

| | Points, or a ledger row? | A code to show? |
|---|---|---|
| `issue_redemption()` — points off a bill | **reserves**; ledger written on scan | yes |
| `redeem_reward()` — catalogue claim | **spent immediately** | **none** |

The schema comment on the first says outright that an abandoned code costs the
customer nothing, *because most codes are abandoned*. The second did the
opposite: an abandoned claim cost everything, and a completed one still gave
nothing to show. **The portal's own banner read "Claimed. Show your code at the
counter" while no code existed** — the clearest possible statement of the bug.

A claim now issues a token and deducts **when the cashier scans**, exactly like
spending points. `redemption_tokens` carries a nullable `reward_id`;
`redeem_points_token()` handles both kinds and returns the reward name, so the
cashier is told **what to hand over** instead of being told to knock riyals off a
bill. Getting that wrong is the mistake that branch exists to prevent.

⚠ **The min-redeem floor still does not reach the catalogue, and
`issue_reward_redemption()` is where that is enforced by being absent.** There is
now a test that fails if it ever does — Free Sauce is 300 against a 500 floor,
and applying it would leave rewards listed and unclaimable.

**The migration refunds every claim made through the broken path**, as
`manual_adjust` against the owner so the correction is visible in the ledger and
in the customer's own history rather than being a silent rewrite. Idempotent: it
matches on the note before inserting. Verified by rebuilding the pre-0008 world
on dev — no `reward_id`, the old four-column function, a claim that spent points
and left no token — then applying: 700 → 1000, one refund row, second run
refunds none.

### The live code now sits at the top, and names the reward

Claiming used to return the customer to the top of the page with the code they
had just been told to show sitting below the balance and a full-height member QR.

⚠ **The fix is not a better anchor.** The redirect carried `#redeem`, and hash
scrolling after a server-action redirect is unreliable in the App Router — and
even when it worked the page jumped past a whole card to get there. A live code
has a three-minute countdown, so it is the most urgent thing on screen. It
renders **first** while it lasts and drops back afterwards.

The panel also names the reward. "3.00 SAR comes off your bill" is wrong and
alarming when what was claimed is a free sauce.

### The member QR collapses during the exchange

Owner's idea. ⚠ **Two scannable codes on one screen meaning opposite things** —
one identifies the customer so a bill *adds* points, the other *spends* them. A
cashier with a queue reads a phone, not a label.

It **collapses rather than disappearing**, which is the one change to the
original proposal: `creditBill` looks a customer up **by member code**, so a
customer redeeming and earning on the same purchase would otherwise have to
cancel the code, get scanned, and claim again. `<details>` — native, accessible,
and works with no JavaScript, which is the right dependency for a phone on shop
wifi.

### ⚠ EVERY REBUILD INVALIDATES OPEN PAGES' SERVER ACTIONS

Seen in the portal log straight after this deploy:

```
Failed to find Server Action "4073d977…". This request might be from an
older or newer deployment.
```

Next embeds a build-specific id in every server action. **A browser tab left open
across a rebuild fails its next form submit** — a scan, a claim, a sign-in — with
that error, until the page is reloaded. It does not recur on fresh loads and
nothing is corrupted.

It matters at a counter: rebuilding while a cashier has the Scan page open makes
their next scan fail once, and the message explains nothing to them. **Deploy
between shifts where possible, and tell staff to reload the page after any
deploy.**

---

## 12 August 2026 — the second screenshot round: expressions, dates, cell gaps

**✅ LIVE.** The portal is fully Arabic: **479 dictionary keys, Arabic covers
479**, guarded by a test that fails when an English key has no translation.

### ⚠ A regex over text nodes cannot see a translated UI

The first pass matched `>Text<`. It was blind to every string inside a JSX
**expression** — `{r.is_active ? 'Available' : 'Retired'}`, select options, chip
labels, button text, and all 47 server-action error messages. About 170 strings,
invisible to the tool and obvious in a screenshot.

If this ever needs doing again: sweep for quoted string literals in `.tsx`, not
just text nodes.

### ⚠ The reason map existed TWICE

An English `Record<string, string>` of ledger reasons lived in **both** the
overview and the member-detail page. The first pass replaced one and left the
other, which is exactly why "Sign-up bonus" kept appearing on an Arabic screen
after everything around it was translated. Both are gone; reasons come from the
dictionary keyed by the database enum.

### ⚠ The table fix was half a fix

Making the cell padding logical kept it on **one edge**. A cell whose content
sits on its start edge still touched a neighbour whose content sits on its end
edge — a member name printed hard against a timestamp,
`FUSAUJY9 Mohamed Kanzi12 Aug, 18:00`.

**One-sided padding cannot be correct in a table whose columns mix start and end
alignment.** It is symmetric now, with only the outer edges trimmed.

### ⚠ `ar-SA` DEFAULTS TO THE ISLAMIC CALENDAR

Formatting a date in Arabic without forcing `ca-gregory` prints a **Hijri date
against a Gregorian receipt and a Gregorian POS**. Arabic locales also default to
Arabic-Indic digits, which this portal forbids so figures can be read aloud
against a printed receipt.

`fmtDate()` in `lib/i18n.ts` forces `ca-gregory` and `nu-latn`: an Arabic month
name with Western numerals, which is what a Saudi till actually uses. Use it for
every date; do not call `toLocaleString` directly.

### Deliberately left in English

`Redeemed % points at the counter` in `reports/page.tsx` is a SQL `LIKE` pattern
matching a stored note, not UI text. Translating it breaks the pre-migration
classification fallback.

---

## 12 August 2026 — the Arabic portal, reviewed against real screenshots

**✅ LIVE.** The owner sent screenshots of the running portal, which is the check
this environment cannot perform. They found four classes of problem that source
review had missed entirely.

### ⚠ Translation was about a third done, not done

The earlier pass covered headings, table headers and form labels — and left
**every paragraph, hint, small button and ledger reason in English**, roughly 158
strings. On an Arabic screen that reads as a broken page, not a partial one.

All translated now. **350 keys, Arabic covers 350.** A sweep for capitalised JSX
text finds nothing left outside brand names and the dev-only fixtures note.

⚠ **Ledger reasons were a module-level English map duplicated in two files**,
which is why "Sign-up bonus" survived on an Arabic screen after everything
around it was translated. They are dictionary keys now, keyed by the database's
own enum values.

⚠ **Sentences that wrap numbers were assembled in JSX from fragments** joined by
`{' '}`. That cannot be translated — Arabic orders the parts differently and a
fragment list has no order to change. They are single strings with named holes
now, filled by `tf()`.

### ⚠ THE COLUMN COLLISION WAS PHYSICAL SHORTHAND HIDING FROM THE GREP

A points balance printed hard against a phone number, `100+966530245187`.

`table.data td` was `padding: 8px 10px 8px 0` — 10px right, **0 left**. In RTL
that puts the gap on the leading edge and nothing on the trailing one, so
adjacent cells touch.

**This file's own warning comment tells the next person to grep for
`padding-left`. Shorthand does not match that grep.** Both `td` and `th` are
logical now, and `padding-inline-end: 0` is scoped to the last column instead of
every right-aligned one.

### The two-line labels

The hint sat **inline** after the label text, so in a 130px field the pair
wrapped and every form row grew a ragged second line — "Redeem QR lasts" over
"seconds". The hint is its own block now, so a label occupies the same two lines
in both languages, and `.field-sm` can grow instead of being pinned to 130px,
which no Arabic label fits.

### Direction on the inputs

Codes, phones, emails and money carry `dir="ltr"`. Without it the caret starts
mid-string on an Arabic page and a member code renders in an order that does not
match the card being scanned. The per-item award input went 96px → 118px; the
Arabic placeholder was being clipped mid-word.

### ⚠ The collision predicted in the previous commit happened during this one

A bulk replacement grabbed `lang` in `signup-qr`, where that variable is the
language of the **poster being printed**, not the interface. Typecheck caught it;
corrected to `uiLang` at all 8 sites. The warning was right and was still not
enough to prevent it — which is the argument for the two never sharing a name.

### Also

The reports page still told managers **trading days run to 03:00**, the same
stale copy found on the orders page. Wrong since the hours moved on 8 August;
the boundary is 05:00.

### ⚠ What this session proves about verification here

Every one of these shipped through a clean typecheck, a clean build, a clean
detector run and 122 passing tests. **None of that can see a layout.** Rendered
screenshots found in one minute what four rounds of source review did not.
Anything visual in this project needs eyes on a real screen before it is called
done.

---

## 12 August 2026 — what Arabic exposed, and a spacing scale

**✅ LIVE.** A design pass over the admin portal. Four defects, two visible only
in Arabic and one that had never worked in either language.

### ⚠ The current-page indicator had NEVER worked

`globals.css` has styled `nav.main a[aria-current='page']` since the portal was
built, and nothing ever set the attribute — so the rule could not match. On a
tool used mid-shift with a queue waiting, which page you are on is the one piece
of state the chrome exists to carry.

It is set now, from a small client component (`usePathname` needs one; the links
are still plain `<Link>`, so with JavaScript broken the nav navigates and only
the highlight is lost). And it is styled **distinctly from `:hover`** — the two
were previously the identical declaration, so even had it matched, hovering any
link would have looked the same as standing on the current page.

Refactoring it also surfaced that the two role-gated links lived as separate JSX
branches; the whole nav is one list with a `roles` field now, which is what
stops a gated link arriving with a label and no glyph.

### ⚠ Two things that broke only in Arabic

1. **The wordmark.** `STACKD<span>.</span>` inherits RTL, and bidi resolves that
   trailing full stop to the paragraph direction — rendering **`.STACKD`** on
   every Arabic screen. It is a Latin lockup and the period is part of the mark,
   so it now carries `dir="ltr"`.
2. **The sign-out arrow pointed the wrong way.** It is the only directional
   glyph in the set, so it is the only one that mirrors. Symbols must *not*:
   flipping a QR square or a receipt makes it wrong, not localised. Opt-in per
   icon via `.rtl-mirror`, matched with `[dir='rtl']` rather than `:dir(rtl)` —
   the pseudo-class needs Chrome 120, and this is the same reasoning that turned
   down `light-dark()` in that file.

Two labels were also never translated: the scan page's bill total, and the
reward discount.

### Spacing is a scale now

**Nineteen distinct hand-picked pixel values**, six of them odd numbers — 5, 7,
9, 11, 22, 26 — that no scale explains. Odd values are how a layout stops being
alignable: two elements set to 5 and 6 look identical alone and never line up
beside each other.

Replaced with a named scale on a **2px base**. 2 rather than 4 because this is a
dense Operate surface and a 4-only scale has no step between 8 and 12, which is
exactly where a table cell and a chip live. Steps are named by role (`--s-cosy`,
`--s-sect`) so a value can be corrected once without renaming it everywhere.

### ⚠ The Arabic small labels had nothing left holding them up

`.eyebrow`, `.stat .k` and `th` are 11–12px and were carrying their entire
meaning in **uppercase plus 0.08–0.14em tracking**. Arabic gets neither — it is
cursive, so tracking pulls the joins open, and there is no case to transform.
Strip both and what remains is small dim text with nothing marking it as a
label. The distinction is rebuilt from weight and colour.

Cairo's counters also close up below about 13px where Latin's do not, so small
type has a higher floor in Arabic; and fixed-height rows get more vertical
padding, because Arabic has descenders that Latin at this size does not.

### Touch targets were built for a mouse

The primary input here is **a finger on a counter tablet**. The preference
buttons measured about **25px** and nav links about **34px**, against the 44px a
fingertip needs. Corrected only under `pointer: coarse`, so a mouse keeps the
compact chrome that lets ten nav items fit one row — the visible mark is
unchanged, the box around it is not. `prefers-reduced-motion` is honoured too.

### The recommendation NOT taken

**Every page opens with an eyebrow above its heading** — 15 of them across 10
files. The craft floor bans the pattern outright. Here it is carrying a real
category (`Loyalty` above "How points are earned", `People` above "Staff and
permissions"), it is the incumbent world across the whole portal, and stripping
it from ten pages hours after staff were trained on those screens is a redesign
wearing a polish label. Flagged, not done. Worth revisiting after a week of
trading.

---

## 12 August 2026 — GO-LIVE PREP: wiped to a clean slate, admin goes bilingual

**✅ ALL LIVE.** The shop opens tomorrow with staff already trained.

### ⚠ PRODUCTION HAS BEEN EMPTIED. THIS IS NOT A BUG.

`supabase/go-live-reset.sql`, run against production after a verified backup
(`backups/stackd_pre_golive_wipe_2026-08-12_1436.sql.gz`). Everything that had
been rung up was demonstration data and must not be mistaken for real trade on
day one.

**Deleted:** all customers and their `auth.users`, credentials, the entire
loyalty ledger and balances, redemption tokens, device tokens, all orders and
their items, payments, tax invoices, bill claims, and **both counters**.

**Kept:** menu (17 items, 5 categories), rewards (5), loyalty settings
(10% / 500 floor / 100 bonus), branch, hours, and the two staff logins.

**The counters are the point, not an afterthought.** ZATCA wants invoice numbers
sequential per branch with no gaps. Opening on invoice 8 because seven demo
tickets existed would leave a permanent unexplained hole at the start of the
books. The first real sale is invoice 1, pickup code 1.

⚠ **Order of deletion is load-bearing and is written out explicitly** rather than
left to cascade. `orders.customer_id`, `loyalty_transactions.order_id` and
`tax_invoices.order_id` are all `ON DELETE NO ACTION`, so customers-first fails
and orders-before-ledger fails. Being explicit also means a table added later
surfaces as an error instead of quietly surviving the next reset.

The script **refuses to run without `-v confirm=WIPE`**, because the obvious way
to run a file is without reading it first.

### The owner is now "Stackd Owner"

`info@stackd.com.sa` is unchanged — it is the login and the published contact.
Only the display name moved, from Mohamed Kanzi.

### The admin portal is bilingual, and has a theme switch

**Arabic.** Language is a cookie the server reads, so `lang` and `dir` are
already correct in the HTML that leaves the server. ⚠ That is not a
micro-optimisation: `dir="rtl"` applied by JavaScript after paint mirrors the
entire page in front of whoever is reading it. The website cannot work this way
— static export, no request at render time — and this app can.

The stylesheet already used logical properties throughout (`margin-inline-end`,
`text-align: start`), so the layout mirrors on its own. ⚠ **Never introduce
`margin-left`, `padding-right`, `left:` or `text-align: right` into
`apps/admin/app/globals.css`.** Each one is a place the Arabic layout silently
breaks while the English one looks perfect.

⚠ **Numbers stay Western throughout the portal**, unlike the print studio. Staff
read codes, prices and invoice numbers aloud and compare them against a printed
receipt and the POS; two numeral systems for one figure across those surfaces is
a counter mistake waiting to happen. Codes and money also carry `dir=ltr` so
bidi cannot reorder a code that mixes letters and digits.

**Theme: three states, not two** — light, dark, and follow the device. A
two-state toggle cannot express "I have not chosen", so adding one would silently
override the counter tablet's own dusk switching forever.

⚠ **Every colour is defined exactly once** as `--l-*` / `--d-*` and then mapped
onto the live token names. The mapping is written twice because one copy has to
sit inside a media query, so the two blocks are kept adjacent and identical line
for line. A previous revision carried two full copies of the *palettes*, and its
own comment recorded that they drift. `light-dark()` would collapse this to one
declaration per token and is deliberately not used: Chrome 123 / Safari 17.5,
and this ships to whatever hardware is on the counter.

Both switches are **plain forms posting server actions**, so they work with no
client JavaScript. The scanner is a client component for the opposite reason —
touched hundreds of times a shift rather than twice a day.

The language switch is also on the sign-in page, which is the one screen
reachable before the portal chrome exists. Without it, a cashier handed an
English login has no route to Arabic.

Verified live by cookie, which is the whole mechanism:

```
(none)                      <html lang="en" dir="ltr">
lang=ar                     <html lang="ar" dir="rtl">
theme=dark                  <html lang="en" dir="ltr" data-theme="dark">
lang=ar; theme=light        <html lang="ar" dir="rtl" data-theme="light">
```

No `data-theme` when unset, so `prefers-color-scheme` stays in charge. The CSS
ships as two files — 10 `@font-face` blocks in one, 3 `data-theme` rules in the
other — and `cairo-arabic-400-900.woff2` serves 200.

### The scanner submits itself now

A hardware scanner types a code and **may or may not** send Enter; the component
assumed it always did, so the cashier reached for Go on every scan. It now
recognises a scan by **speed** — six or more characters under 40 ms apart, then
120 ms of quiet — and submits.

⚠ **Speed, not length, and that is the whole design.** A member code is 8
characters and a redemption or claim token is 10, so the first 8 characters of a
token typed by hand *are* a valid member code. Length-based auto-submit fires
mid-word and reports "not one of ours".

### ⚠ Still to check on the counter, tomorrow

1. **One real scan.** There is no browser here and no component-test harness, so
   "verified" for the scanner means it compiles, builds and ships. If it does not
   fire, the scanner is slower than 40 ms per character — `BURST_GAP_MS` at the
   top of `Scanner.tsx` is the dial, and the failure is safe: Go still works.
2. **Arabic on a real screen.** Every string was verified in the served HTML,
   not in a rendered page. Line breaks, wrapping and the nav at RTL are unseen.
3. **Translation is now complete across every screen** — 410 keys, and the
   coverage test fails if an English key has no Arabic. `t()` still falls back to
   English so a future key shows a readable word rather than `mem.title`, which
   is precisely why that test is the only thing holding the line: a missing
   string is invisible to whoever added it.

### ⚠ Two things the translation pass turned up

**The orders page told staff trading days run to 03:00.** Wrong since the hours
moved to 16:00-04:00 on 8 Aug — `riyadh_service_date` offsets by the closing hour
plus one, so the boundary is 05:00. Fixed.

**`signup-qr` already owned a `lang` variable meaning something else entirely:**
the language of the POSTER being printed, not of the interface. A cashier working
in Arabic still prints English-led sheets when that is what the wall needs, so
the interface language is `uiLang` there. Never collapse the two.

---

## 12 August 2026 — a welcome bonus was reading as points somebody earned

**✅ FIXED AND LIVE.** Migration `0007_lifetime_earned_purchases_only.sql`,
applied to production. Database only — no rebuild, no downtime, and **no
customer's spendable balance changed**.

Reported from production: a member who had just joined and bought nothing showed
100 lifetime points. That 100 is the welcome bonus.

`apply_loyalty_transaction()` added `greatest(new.delta, 0)` to `lifetime_earned`
for **every** positive ledger row, so the welcome bonus, a birthday bonus and a
manager's goodwill credit all counted. The portal renders that figure as "earned
since you joined" and the admin as "earned all time", and neither sentence was
true for anyone who had ever been given anything.

### The rule now: buying only

`lifetime_earned` is the net of `earn_purchase` **and `order_refund`**, nothing
else. Those two are one idea rather than two — `order_refund` exists to claw back
what an order earned, so leaving it out would let somebody refund every purchase
they ever made and keep a lifetime figure saying they had earned it.

Excluded on purpose: `signup_bonus`, `birthday_bonus`, `manual_adjust`. All three
are gifts, and a gift is not something you earned. `redeem_reward`,
`redeem_counter` and `expiry` were never counted and still are not — spending
points does not un-earn them.

⚠ **`balance` is untouched.** The bonus is still money in the customer's pocket.
Only the description of it changed.

### The rebuild is exact, not an estimate

The ledger is the source of truth and can always reconstruct this column, so the
migration recomputes every row from it rather than adjusting what is there.
That also makes it **idempotent by construction** — it writes an absolute value,
so running it ten times gives the same answer as running it once.

It leaves `updated_at` alone deliberately: that column records when a customer's
points last moved, nothing is moving, and bumping it would make every member look
active to the expiry sweep.

**Production: `UPDATE 3`** — the three members who had welcome bonuses — and the
closing check reported **0 rows still disagreeing with the ledger**. Ledger and
balances both 9,150 and reconciling afterwards.

Verified before shipping by reproducing the bug on dev: a member on 700 with a
100 bonus and a 600 purchase, corrected to lifetime 600 with the balance left at
700. Three new tests cover a welcome bonus, a refund clawback and a manager
credit. **118 pass.**

### ⚠ The other three reports were already fixed — by the deploy hours earlier

Reported alongside it, all confirmed working in the running containers:

| Reported | Reality |
|---|---|
| Redeem box appears below the 500 floor | Fixed by that day's deploy. `min_redeem_points` did not exist until `0005`, so this was genuinely broken until hours before it was reported |
| Admin should configure the minimum | Live. Admin → Points → "Minimum redeem points" |
| Admin should set the joining bonus | Live. Same page. Currently 100 |
| Cannot change reward point costs | Live. Admin → Rewards → edit → "Points cost" |

**The lesson is about who can see them.** The Points page is `SUPER_ADMIN` —
`owner` only. Rewards is `ADMIN` — `manager` or `owner`. A manager looking for
the signup bonus does not find a disabled field, they find no field, which reads
exactly like a missing feature rather than a permission.

### ⚠ `mohamed.kanzi@stackd.com.sa` IS NOT A STAFF ACCOUNT ON PRODUCTION

Production has exactly two: `info@stackd.com.sa` (**owner** / Super Admin,
Mohamed Kanzi) and `saddah.muawia@stackd.com.sa` (**manager**, Saddah Muawia).

So the owner signs in as `info@` today. `mohamed.kanzi@` exists in
`dev-data.sql` as a fixture and has never been created on the live box — which
also means a sign-in attempt with it simply fails. Create it through Staff → Add
and set the password with `npm run admin:passwd`, or keep using `info@`. It is
one or the other, and right now it is `info@`.

---

## 12 August 2026 — deployed: everything

**✅ ALL LIVE.** The VM went `47c651c` → `f8bd7b5`, migrations `0004`, `0005` and
`0006` are applied to production, both portals are rebuilt and serving, and the
website shipped to Cloudflare Pages as deployment `ac5a8cca`.

Everything from 12 August is out. The one thing still outstanding is not a
deploy step: **nobody has looked at the new photography in a browser**, and it is
now live and indexable. See the Cloudflare section below.

### ⚠ Migrations went FIRST here, which is the opposite of the 0002 rule

The 0002 entry says deploy the app first, because a database ahead of the app
showed customers a raw enum label. **That reasoning inverts for these three.**
All three are purely additive, so the old running app neither knows nor cares
about the new columns — but the new app cannot start without them:
`apps/portal/lib/session.ts` selects `must_change_password` on every page load,
so an app deployed ahead of `0006` 500s the entire portal.

The rule that actually generalises: **additive schema goes first, changes to what
existing data *means* go after the app.** Ask which one you have before choosing.

⚠ One consequence worth knowing: `0005` makes the 500-point floor live inside
`issue_redemption()` the moment it applies, so for the few minutes between the
migration and the rebuild the *old* portal was refusing small redemptions
without being able to explain why. Harmless at this size, and it would not be on
a busy night.

### The order that was actually run

1. Verified backup — `backups/stackd_pre_0004-0006_2026-08-12_1252.sql.gz`.
   Checked, not assumed: gzip integrity, 3,123 lines, 28 tables, 21 functions,
   and it ends with pg_dump's `\unrestrict` terminator, so it is not truncated.
2. `SMTP_URL` and `MAIL_FROM` appended to `/opt/stackd/deploy/.env`, verified by
   comparing a SHA-256 of the value against the local one rather than printing it.
3. `git pull --ff-only`.
4. `0004` → `0005` → `0006`, each with `ON_ERROR_STOP=1`.
5. `build admin`, then `build portal`, then `up -d`. One at a time; the box has
   two cores.

`0006` printed `UPDATE 0` twice, which is the proof that the normalisation step
had nothing to do and the clash check could not fire. Production carries **3
customers, 5 orders, 10 ledger rows**, all three addresses already lowercase and
trimmed, no duplicates raw or normalised.

### Verified after

- Portal: `/login`, `/forgot`, `/registration` all **200**; `/password`,
  `/points`, `/` all **307**; a route that does not exist **404**. That last one
  is the point — it is what makes the 307s a working gate rather than missing
  pages.
- Admin: `/login` **200**, `/reports`, `/orders`, `/staff`, `/points` all **307**,
  nonsense **404**.
- `/forgot` renders and **contains no `SMTP_URL` banner**, which is the proof
  production picked up real mail config and `NODE_ENV=production` — that banner
  only appears when mail would go to the log.
- Ledger and cached balances both **2,460 and reconciling**, unchanged from 8 Aug.
- `min_redeem_points` 500, `earn_percent` 10.00, 0 voided orders of 5.

### ⚠ The container-grep check from the 8 Aug entry silently reports nothing

That entry recommends verifying a deploy by grepping the running containers for
new label strings. It is still the right idea, but **the form written there
returns zero hits for strings that are definitely present** — `--include=*.js`
gets expanded by an intermediate shell somewhere in `ssh` → `docker exec` and
never reaches the container's grep. It reads exactly like a failed deploy.

Wrap the whole thing in `sh -c` and drop `--include`:

```bash
docker exec stackd-portal-1 sh -c "grep -rl 'Forgotten your password' /app"
```

Done that way: `Super Admin` in 3 admin files, `void_reason` 1, `min_redeem_points`
1, `Forgotten your password` 2 portal files, `must_change_password` 4,
`customer_password_resets` 3.

### The website — Cloudflare Pages, deployment `ac5a8cca`

`stackd.com.sa` is a static export and ships separately from the portals, with
`npm run deploy`. It went out the same day, after the portals.

**Credentials are now on this machine.** `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` are in `/home/kanzi/stackd/.env` (gitignored), so
deploying no longer needs an interactive `wrangler login`. Account
`1b9b2a5cef6a1caa07d0476ee2ade4b3`, project `stackd`, subdomain
`stackd-7bc.pages.dev`, with `stackd.com.sa` and `www` attached.

⚠ **An account-scoped token fails `/user/tokens/verify` with "Invalid API Token"
and still works perfectly.** That endpoint only verifies *user*-scoped tokens. It
looks exactly like a bad credential and it is not — this cost a wrong diagnosis
here. Test a token against the thing you actually want it to do
(`/accounts/<id>/pages/projects`), never against `verify`.

⚠ **The token was created through a flow that also issued R2 S3 credentials**, so
it arrived looking like an R2-only token. It is not; it carries Pages access.

### ⚠ Verify a Pages deploy by BYTE LENGTH, not by status code

The 3 Aug entry records `wrangler pages deploy` reporting success for deploys
that went nowhere, so "it said success" proves nothing. A 200 on every asset
proves little more — the old build had the same paths and would also answer 200.

What actually proves it: **compare the served `content-length` against the file
in `apps/web/out`.** Identical bytes means the edge is serving *this* build.
Done for six photographs, all matching.

The rest, sampled five times each with cache-busting and `cf-cache-status:
DYNAMIC` throughout: `"few riyals"` **0 hits** on `/en/rewards/` where it was 1
before the deploy, `"500 points"` present, the Arabic page carrying the figure,
and `/menu/README.md` now **404** — the file that was being served out of
`public/` is gone from the edge.

Confirmed against the API too: `ac5a8cca` is the newest **production**
deployment, `deploy/success`, ahead of `af090076` (8 Aug) and `7073a57d` (6 Aug).

### ⚠ Still not done: somebody has to LOOK at the photographs

Every "verified" in this entry is status codes, byte lengths and SQL. None of it
is whether a picture of a burger looks like one, and there is no browser here.
The photography is now live and indexable without ever having been seen.

If anything is wrong, the two judgement calls flagged in the photography entry —
Scoopy-Doo as the kraft bowl, and the home-page trio — are one line each in
`seed.sql`, then `sync:menu` → `deploy`. Cheaper to fix now than after Google
has the images.

### ⚠ Roll the Cloudflare token

It was shown to the agent in a screenshot, so it exists in that conversation and
in `~/.claude/image-cache/`. It can write to the Pages project.
`dash.cloudflare.com/profile/api-tokens`. The R2 access key and secret displayed
beside it were exposed the same way — nothing in this project uses R2, but they
are live credentials and worth rolling together.

---

## 12 August 2026 — a customer who forgets their password can get back in

**✅ Deployed 12 Aug**, migration `0006_password_reset.sql` applied to production.
See the deploy entry above.

Until now a forgotten password was the end of the account. There was no reset of
any kind, and the only recovery was a member walking to the counter and asking
staff to do something the admin portal cannot actually do. The portal now emails
a six-digit code, good for **15 minutes and 5 wrong guesses**, and forces a new
password before it shows anything else.

### ⚠ `SMTP_URL` MUST BE SET BEFORE THIS DEPLOYS

With no `SMTP_URL`, mail is written to the server log instead of being sent. That
is what makes the flow testable on a laptop before a mailbox exists, and it is
exactly the failure that must never reach production: a reset that silently goes
nowhere looks identical to a working one from the outside, and the customer is
simply locked out of their points.

So `assertMailConfigured()` **throws in production**, and it is called *before*
the code is created rather than after it is sent — a misconfigured deployment
fails while the customer is still looking at the form and can be told something
true. `deploy/env.example` has the block.

**✅ The mail is proven, 12 Aug.** `rewards@stackd.com.sa` on MXroute
(`smtps://…@sunfire.mxrouting.net:465`), credentials in `/home/kanzi/stackd/.env`
locally. `node scripts/mail-test.mjs <address>` authenticated, sent the real
template and the server returned `250 OK`. That script sends the mail customers
actually get — imported from `lib/reset.ts` rather than copied, because a
deliverability test against a lookalike proves nothing. It touches no database
and its code is a fixed dummy, so it is safe to run against production.

The domain is aligned for that sender: SPF `v=spf1 include:mxroute.com -all`,
MXroute's DKIM on selector `x`, DMARC at `p=none`.

⚠ **A `250` is the server accepting the message, not the inbox accepting it.**
Spam placement is the failure mode SPF and DKIM exist to prevent and it does not
show up here — check the folder it actually landed in before customers do.

⚠ **The same credentials still have to be put in `deploy/.env` on the VM.** The
local `.env` is not deployed and nothing reads it there. `deploy/env.example`
carries the real host now; only the password is missing from it.

### The form must not say whether an address is registered

`issueResetCode` returns the same way for an address that exists and one that
does not, and the page prints the same sentence either way. Anything else turns
this form into a tool for testing whether a given person is a STACKD member,
which is not something a stranger should be able to find out. `verifyResetCode`
answers `invalid` for "wrong code" and "no such customer" alike.

The cost is that a typo looks like success. The mail that never arrives is the
feedback, and the form says so before you submit.

### ⚠ The code is stored as a scrypt hash, never in plain text

A six-digit code is a credential — it signs somebody in. In plain text, anyone
reading a database dump takes every account with a reset in flight. Under a fast
hash, all one million codes fall to an offline sweep in about a second. scrypt at
64 MB a guess makes that sweep meaningless. It uses `hashPassword` /
`verifyPassword` from `packages/server`, the same pair that hash the passwords.

Guesses are counted **in the database, not in memory**: the portal runs more than
one process, and a counter held in one of them is not a limit.

### The old password keeps working until a new one is chosen

Verifying a code sets `must_change_password` and does **not** touch the existing
hash. Somebody who starts a reset, then remembers their password, is not locked
out by having abandoned it halfway. A customer who never had a password — signed
up at the counter, phone only — gets a row with an unguessable random hash, so
the code stays the only way in.

`requireMember()` redirects to `/password` while the flag is set, so the block is
in one place rather than on each page.

⚠ **`/password` is reachable voluntarily too, and there it demands the current
password.** A forced reset cannot ask for it — not knowing it is why they are
there — and the one-time code was the proof, already spent. But without that
check on the voluntary path, a thirty-day session on an unlocked phone is enough
for whoever picks it up to take the account permanently.

### The unique email index is the part that touches existing data

There was none. Only `phone` was unique, so registration's duplicate check was a
plain SELECT before an INSERT and two racing submissions could both pass it.
Survivable while email was a contact detail; not survivable once a password can
be reset by one, because two rows sharing an address make "which account?"
unanswerable.

The migration lowercases and trims stored addresses, turns empty strings into
NULL — that is what an untouched optional field posts, and they would all collide
with each other — and then **stops with an exception naming the addresses** if
two customers still share one. Deliberately: merging two loyalty accounts means
deciding which member code survives and what happens to both balances, which is a
judgement about somebody's money and not a migration's to make.

**Check production for clashes before applying**, or the migration will tell you
about them at an inconvenient moment.

### Also

- One live code per customer — `customer_password_resets` is keyed by customer
  id, so issuing supersedes rather than accumulating. A 60-second cooldown stops
  the form being a way to have STACKD send somebody a hundred emails on our
  sender reputation, and stops an impatient double-tap invalidating the code the
  customer is halfway through typing.
- RLS on with **no policy**, exactly as `customer_credentials` is. `schema.test.mjs`
  fails the build if that is ever dropped.
- `packages/server/src/mail.ts` is one function over SMTP rather than a provider
  SDK. Every host speaks SMTP, so changing provider is one env var and no code.
- Expired and spent codes are deleted on the next request for that customer, so
  reading never writes and there is no sweep to schedule.

10 tests in `supabase/password-reset.test.mjs` cover it: the duplicate address is
refused whatever the case, an unknown address writes nothing, only a hash is
stored, the cooldown holds, a wrong code counts an attempt without signing anyone
in, five kill the code, an expired one is refused, the right one works exactly
once, and an existing password keeps working until a new one is saved.

**115 tests pass and typecheck is clean across all five workspaces.**

---

## 12 August 2026 — permissions, voiding, and a redemption floor

**✅ Deployed 12 Aug.** `0004_void_orders.sql` and `0005_min_redeem_points.sql`
are both applied to production. See the deploy entry above.

### The two addresses, and which is which

**⚠ An earlier version of this entry said the published contact address had
changed to `mohamed.kanzi@stackd.com.sa` and called that a deploy blocker. It is
not, and it was never true for longer than part of one day.** The change was made
and reverted on 12 Aug; `BRANCH.email` in `packages/shared/src/menu.ts` has said
`info@` throughout, with a comment recording the reversal. The warning outlived
the thing it warned about, which is the failure mode this file has to avoid.

| Address | What it is for | Where it appears |
|---|---|---|
| `info@stackd.com.sa` | **The public address.** The restaurant's, the owner's. | Home page, visit page, footer, the schema.org block Google reads — all from `BRANCH.email`, one constant |
| `mohamed.kanzi@stackd.com.sa` | **Intended as an admin-portal login.** Never shown to a customer. ⚠ **Not created on production** — the owner signs in as `info@` there. | A `staff` row in `dev-data.sql` only |

Both mailboxes exist on MXroute. Nothing about the website deploy depends on the
second one — staff sign in with email and password and the admin portal sends no
mail at all, so it is an identifier rather than a mailbox as far as the app is
concerned.

**`info@` must stay alive whatever else changes.** It has been live and indexed
for months, and it is the address on every printed and cached copy of the site.

### Admin and Super Admin

The database enum is untouched: still `cashier | kitchen | manager | owner`.
Renaming a Postgres enum means a migration against production and touching every
policy that names a role, for no behavioural gain, so the rename is in the
labels. **`manager` IS Admin. `owner` IS Super Admin.** One place to look:
`ADMIN` and `SUPER_ADMIN` in `apps/admin/lib/auth.ts`.

| | Admin | Super Admin |
|---|---|---|
| Menu, photos, rewards | ✅ | ✅ |
| Delete a member | ✅ | ✅ |
| Deactivate staff | | ✅ |
| Void an order | | ✅ |
| Adjust points, earn rate, awards | | ✅ |

Points **moved up** a tier — Admin could adjust balances before and now cannot.
Cashiers still enrol members at the counter, which you confirmed: that is where
signups actually happen.

Staff are still deactivated rather than deleted, and that stays. `actor_id` on
every ledger row points at them, so deleting one strips the name off every
adjustment they ever made. Deactivating locks them out and keeps the history.

### Voiding an order — it does not delete, and it must not

`invoice_counters` issues tax invoice numbers that ZATCA requires to be
sequential per branch **with no gaps**. Deleting an invoiced order punches a hole
nothing can legitimately fill. So a void marks the row: `voided_at`, `voided_by`,
`void_reason`, all three or none, enforced by a check constraint. The ticket
keeps its number and stays in the books.

Three columns rather than an `order_status` value, on purpose: status tracks
*fulfilment*, voiding is *accounting*, and a ticket can be `completed` (they ate
it) and voided (it was rung up twice) at once.

**⚠ Every query that sums money now excludes voided rows.** There is one
definition — `IS_TRADE()` in `reports/page.tsx` — so a void cannot be dropped
from revenue but counted in the daily chart. Grep `grand_total` before adding
another.

Points already credited are **not** clawed back by a void. Taking back balance a
customer banked is worse than a wrong takings figure; the page says so, and the
ledger is where that decision belongs.

### 500-point floor on counter redemptions

`loyalty_settings.min_redeem_points`, default 500 (= 5.00 SAR). Enforced inside
`issue_redemption()`, not in the portal that draws the slider — that function is
reachable from the portal and the till, and a floor enforced in one caller is not
a floor. 0 switches it off.

**It does not apply to the rewards catalogue, deliberately.** Free Sauce is 300
points and Free Coleslaw is 400; applying the floor there would leave both listed
and unclaimable, which reads as a broken app rather than a rule. Raise those two
to 500 first if you want the floor to cover rewards.

**The website's own copy said points come off a bill "or a few riyals".** That
stopped being true, so it now reads "Once you reach 500 points…" in English and
Arabic. The site is a static export with no database, so the number is written
out in `rewards.ts` — change it there and here together.

Verified against the real database: 499 refused, 500 accepted, a 300-point reward
still claimable, and a void rejected with no reason, with a blank reason, and
accepted with one. 105 tests pass, including two new ones for the floor.

---

## 12 August 2026 — new photography, every card now has a real photo

**✅ Deployed 12 Aug** as Cloudflare Pages `ac5a8cca` — see the deploy entry at
the top. ⚠ **It shipped without ever being looked at in a browser**, which is
the one thing about this work that is still open. The owner dropped a folder of
new shots and the printed menu PDF into `new_shots/`.

### Every menu item now has a photograph

Coleslaw and Cheesy-Cheese were the last two placeholder cards. They aren't
anymore, so the menu page has zero branded placeholders left on it.

| Item | Was | Now |
|---|---|---|
| Classic / Maple / Big-Stackd | upscaled crops from the July launch post | August shoot, native 4:3, matches the printed menu |
| Tortilla Strips | July export | full-res original `DSC07611.jpg` (1991×2877) |
| Scoopy-Doo | launch-post poster | the kraft bowl as served |
| Fire-Attack | Scoopy-Doo + **drawn-on jalapeños** | Scoopy-Doo, different crop, heat masked to the bowl |
| Fries | July camera shot, plain | branded scoop packshot |
| Coleslaw | placeholder | packshot |
| Cheesy-Cheese | placeholder | fries with a pot of cheese, composited |

### The fabricated jalapeños are gone

The Fire-Attack card carried jalapeño slices that were drawn in and are not in
the recipe. The owner confirmed on 12 Aug that Fire-Attack and Scoopy-Doo are
**one dish with a different sauce**, which means the honest way to separate the
two cards is crop and grade — so that is all that separates them now. Nothing is
added to the food in any image on the site.

**The heat is masked to the bowl, and the frame is Scoopy-Doo's exactly.** Two
attempts were rejected before this one: grading the whole photograph turned the
restaurant behind the bowl orange too and read as a filter over a mild dish, and
a tighter crop changed the framing when the owner wanted only the sauce to
change. Now the two Giants cards are the same photograph at the same size, and
the only difference between them is the colour of the sauce — which is the only
difference between the dishes.

The bowl, table, coleslaw and pickles are untouched. That last part matters: the
coleslaw pot has red cabbage in it and sits well outside the mask.

### Cheesy-Cheese is now fries with cheese

Owner's call on 12 Aug. It is **two photographs in one frame** — the STACKD
fries scoop, with the cheese pot keyed off its own white studio sweep and set
down beside it with a synthesised contact shadow. Both halves are real
photographs of real product at the size it is served.

A drizzle poured over the fries was built first and thrown away: with no way to
light or shade the sauce it read as flat plastic ribbons on top of the picture.

⚠ **The card now reads as a portion of fries WITH a cheese dip.** If
Cheesy-Cheese is sold as a 6 SAR pot of sauce on its own, that oversells it and
it should go back to the plain pot. Worth a look before this deploys.

### `scripts/shoot-to-web.mjs` — crops and grades are written down

The shots arrive from three lighting worlds: warm plated (burgers, Giants), the
steel tray on marble (camera shoot), and white-background packshots. Left raw
the packshots cut a glaring white rectangle into a near-black page. The script
grades each world onto the same footing — highlights rolled off, white balance
warmed, a soft vignette on the bright ones — and writes every file at exactly
1200×900, which is the size `CardMedia` declares.

It also carries the two composites — `heat` masks a grade to a region, `inset`
keys a subject off a white sweep and seats it in another frame — so both are
written down and re-runnable rather than living in an image editor's history.

Re-runnable and deterministic. New shots into `new_shots/`, an entry in `SHOTS`,
run it. Brief in `docs/menu-photography.md`.

⚠ **Do not `npm run build` while `npm run dev` is up.** Both write
`apps/web/.next` and the running server then 500s every route with
`Cannot find module './997.js'`. Kill it, `rm -rf apps/web/.next`, restart.

### ⚠ The rooster's feet are broken in the ARTWORK, not in our code

Reported from the live hero. The right foot is a handful of disconnected black
shards with a stray red diagonal through it; the left foot is fine.

**It is not the SVG conversion and it is not fixable here.** Checked properly:
all 450 paths in the PDF reach the SVG, all 450 fills are `f` (nonzero) and all
450 come out nonzero, the only clip in the file is the full-artboard rect the
converter documents, no path is displaced outside the artboard, all 9 filled
rectangles are 1–5px detail marks nowhere near the legs, and there are no
XObjects, images or soft masks. The converter is faithful.

**Page 2 of `/mnt/d/STACKD LOGO VECTOR.pdf` is an auto-traced bitmap** — 450
paths and a 32-colour palette carrying `#f7f7f7`, `#f8f8f8`, `#f9f9f9`,
`#c0c0c0`, `#c5c5c5`, `#c9c9c9`, which is what an image trace produces, not what
a person draws. The trace degraded below the shins. Deleting the broken
fragments does not help: it leaves a leg ending in nothing.

Pages 1 and 3 — the flat bust logos actually used for `logo.svg` — convert
perfectly, so whoever made those has clean source.

**Nothing changed on the site.** A CSS fade over the ankles was tried as a
stopgap and the owner reverted it — the hero art is exactly as it was, broken
feet and all, and `globals.css` is untouched.

**The fix is a clean full-body vector. Ask the designer for one.** It is the
brand mascot on the front page and it is the only thing that will actually solve
this. Until then the feet stay as they are, which at hero size most visitors
will never notice.

### Two judgement calls to overrule if you disagree

1. **Scoopy-Doo is now the kraft bowl.** On 3 Aug you preferred the poster
   because the poster plated it better than the bowl. That was against an older
   bowl photo; this one is the frame your printed menu uses. One line in
   `seed.sql` puts the poster back.
2. **The home page trio changed** from Scoopy-Doo / Big-Stackd / Fire-Attack to
   Classic / Big-Stackd / Scoopy-Doo. The old flanks are now the same photograph
   twice, side by side.

### Also

- `apps/web/public/menu/README.md` → `docs/menu-photography.md`. Anything in
  `public/` is copied into the export, so that file was being served at
  `stackd.com.sa/menu/README.md`.
- **The printed menu PDF agrees with the database** — every price and calorie
  matches what the site already serves. No data changes. It still prints water
  at 1 SAR in the English column and 2 in the Arabic; 2 is correct and settled
  (DISCREPANCIES §1), so that is a reprint fix, not a site one.
- ⚠ **9 `photo_*.jpg` files never copied out of Windows.** `new_shots/` has
  their `:Zone.Identifier` stubs and no image. Re-copy if they mattered.
- ⚠ `FIRE-ATTACK.jpg` in `new_shots/` is byte-identical to `SCOOPY-DOO.jpg`
  (same md5). There is still no photograph of Fire-Attack anywhere.
- Unused: `STACKD SAUCE.jpg`, `RANCH SAUCE.jpg`. Sauces are deliberately
  text-only cards, on the printed menu as well as the site.

---

## 8 August 2026 — trading hours move to 4 PM – 4 AM

**Live everywhere.** `47c651c`, migration `0003_hours_16_to_04.sql`. The website
is deployed and verified on the real domain; the migration is applied to
production after a backup.

### The hours were written in FIVE places

That is the actual story of this change. `branch_hours` in the database,
`STACKD_HOURS` for the website, the schema.org block Google reads, the home
page's big clock, and the visit page's big clock — **while the hours table
lower down that same visit page was already reading `STACKD_HOURS` correctly.**
So the page disagreed with itself.

Every display now derives from `STACKD_HOURS`. Changing the hours again is one
constant plus a migration, not a search.

### ⚠ `riyadh_service_date` moves with the close: 4 hours → 5

**The offset is the closing time plus an hour, and the spare hour is the point.**
A ticket finalised at 04:20, after the kitchen shuts, is the night's last sale.
Left at 4 against an 04:00 close it lands on the *next* trading day — restarting
pickup-code numbering mid-clean-down and splitting one night's takings across two
reports. Demonstrated against a database still on the old settings before the
migration was written: a 04:20 ticket really did jump a day.

`orders.service_date` is a **stored** column, so nothing already banked moved.
Only tickets rung up from now on use the new boundary, which is what you want —
history stays as it was reported at the time.

### Verified

Production before: open at 03:30 **false**, open at 15:30 true, a 04:20 ticket on
2026-08-10. After: 03:30 true, 15:30 false, 04:00 false (it shuts *at* four), and
that 04:20 ticket on 2026-08-09. Ledger and balances both 2,460 and reconciling.

The site was checked 12 samples across four pages with cache-busting, plus
schema.org three times — all `16:00`/`04:00`, no `3 PM` or `15:00` anywhere.

**⚠ An intermediate check caught `/en/visit/` still serving 3 PM after the deploy
reported success.** It was propagation, not a bad build — the same path was clean
on the next five samples and `cf-cache-status` was `DYNAMIC` throughout. Sample a
path several times before believing a stale reading; one fetch is not evidence.

---

## 8 August 2026 — the programme can finally say what it costs

**Shipped.** Four commits: `a130c94` (the 6 Aug allowlist work, verified and
committed at last), `bf5d883` (the reports dashboard), `0ff9f9a` (migration
0002), `d7acef9` (a correction to `schema.sql`'s own header).

### `admin.stackd.com.sa/reports` — what the loyalty programme costs

Points outstanding were on the overview and nothing about what had been *spent*,
so "what has this cost us" could only be answered by hand. That page answers it
in riyals.

**Every riyal figure is exact, not converted.** One point is one halala by the
programme's design, so a points total IS a halala total and the page only moves
the decimal point. There is no exchange rate here to get wrong.

Managers and the owner only. The nav hides the link and **the page enforces it** —
a cashier's HTML contains none of the figures, not a hidden div full of them.

Beyond the headline: points issued, outstanding liability in riyals, take-up
rate, breakage, a movement table covering every reason, trade and VAT for the
period, a day-by-day trend, best members, and what sells.

**⚠ Expired points are reported apart from spent ones, deliberately.** They are
a liability that lapsed, which is the opposite of a cost. Adding the two
together overstates what the programme costs, and it is an easy mistake to make
because both arrive as negative numbers in the same column.

**The movement table's net change equals the outstanding balance exactly.** That
is a live audit of the ledger against the cached balances, and it is why that
row sums the rows on screen rather than recomputing from the headline figures —
the two would disagree the day an unclassified reason appeared.

### Migration 0002 — counter redemptions get their own reason

Spending points off a bill wrote `manual_adjust`, which is also what a manager
writes when correcting a balance by hand. A customer spending what they saved
and an internal fix are different events, and the first cut of the dashboard had
to match on note text to tell them apart. `redeem_counter` now says it outright,
and carries a constraint requiring the cashier who scanned it.

**✅ Applied to production 8 Aug 2026**, after a verified backup
(`backups/stackd_2026-08-08_1640.sql.gz`). Two rows converted, `left_behind` 0,
ledger and balances both still 2000 and reconciling. The command, for the next
database:

```bash
docker compose -f deploy/docker-compose.yml exec -T db \
  psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0002_redeem_counter.sql
```

It prints `left_behind` at the end. **That number must be 0**; anything else is
a counter redemption the backfill could not identify, and the fallback in the
reports page has to stay until it is zero everywhere.

**⚠ Correction to what this entry first claimed: deploy order DOES matter, just
not for the figures.** The dashboard reports identically either side of the
migration, which is what was tested — but the *labels* are a different story.
Every surface that renders a reason does `LABEL[reason] ?? reason`, so a
database migrated ahead of the app shows customers the raw string
`redeem_counter` in their own points history. That happened here for about ten
minutes. **Deploy the app first, or both together.**

Three things it had to get right:

1. **⚠ `ALTER TYPE ... ADD VALUE` cannot be USED in the transaction that added
   it.** Postgres raises `unsafe use of new value`, verified on 18.4. So the
   enum step sits outside the transaction and the file **must not** be run with
   `psql -1` or `--single-transaction`. It is idempotent either way, and a
   failure after step 1 leaves only an unused label behind.
2. **The value is added `after 'redeem_reward'`,** so a migrated database and a
   fresh one from `schema.sql` sort the type identically rather than merely
   holding the same labels. `pg_enum.enumsortorder` reads 2.5 on the migrated
   one against 3 on the fresh one — that is internal, and `enum_range()` and the
   comparison operators agree. Compare those, never `enumsortorder`.
3. **⚠ Comparing an enum column to a label the type does not have RAISES
   (22P02). It does not evaluate to false.** `reason = 'redeem_counter'` turned
   the whole reports page into a 500 against an un-migrated database — precisely
   the case its fallback exists to survive. It reads `reason::text` there now.
   Every other reason is left as an enum comparison on purpose, so a typo in one
   of *those* still fails loudly. Found only by restoring a pre-migration
   snapshot and serving the page against it.

### ⚠ `caddy start` / `caddy stop` are useless with `admin off`

Worth knowing before anyone tests `deploy/Caddyfile` again. `caddy stop` talks to
the admin API, so with `admin off` in the config it fails silently and instances
pile up on the port. Every request then hits whichever process bound first, and
the results look like real findings: one run "proved" the shipped
`ADMIN_ALLOW_CIDR=0.0.0.0/0` default returns 403, which would have meant the
first deploy locks everyone out. It does not — the harness was lying. Test with
one process and one port per case, killed by PID.

The allowlist itself is now verified against real Caddy 2.11.4 and committed:
the default admits everyone, a narrow list blocks and renders the client's
address, and a space-separated value tokenizes into several ranges.

### `schema.sql`'s header was saying the opposite of the truth

It still read "Nothing has been applied to a production database yet" and told
you to freeze the file "the day it first runs against production". That day was
6 August, and 0001 and 0002 both exist — so the file was inviting anyone who
read only it to edit it freely, which is the exact divergence the note was
written to prevent. It now says what the rule actually is: **every schema change
needs both a numbered migration and the matching edit in `schema.sql`**, and
`npm run db:reset && npm test` is what proves they still agree.

### The dev database currently holds generated demo data

Roughly 90 days of trade covering all eight ledger reasons, so the dashboard is
worth looking at locally. **It will fail `npm test`,** which assumes a nearly
empty database. `npm run db:reset` restores it.

### Deployed

**The VM is at `5932912` and both portals were rebuilt** (admin, then portal —
one at a time, as the 2-core box requires). `/reports` is live behind the staff
login, and `my.stackd.com.sa` and `admin.stackd.com.sa` both serve.

**⚠ `docker compose exec -T` reads stdin, so it swallows the rest of a heredoc.**
A multi-command script piped over SSH — the obvious way to run a few checks
against the database — silently stops after the first `exec`, and the output
looks like a script that only ever had one command in it. Redirect every call:
`docker compose ... exec -T db psql ... < /dev/null`. `deploy/backup.sh` has an
`exec` inside it and does the same thing.

The VM pulls from `git@github.com:mohammedalkanzi8/stackd.git`, which is also
this checkout's `origin`. Deploying is: push → `git pull --ff-only` on the VM →
`docker compose build <app>` → `up -d`.

Verified by grepping the running containers for the new label strings rather
than by signing in, which would have meant reading production's session secret.
A route that does not exist returns 404, so `/reports` answering 307 is the
gate working rather than the page missing.

### ⚠ Still to do

**Nobody has looked at this page.** There is no browser here, so "verified" means
the figures match SQL run independently and the markup geometry is sound — not
that it reads well. It is live at `admin.stackd.com.sa/reports`, and locally on
`npm run admin` → localhost:3001/reports.

---

## 6 August 2026 — the admin allowlist is now safe to narrow (and still isn't)

**Decision: `ADMIN_ALLOW_CIDR` stays `0.0.0.0/0` for now, deliberately.** The
staff portal is reachable from any address on the internet, with `requireStaff()`
as the only control. That is a knowingly accepted risk, not an oversight.

What changed is that narrowing it is now a one-command job instead of a thing
nobody wants to touch:

```bash
deploy/admin-allow.sh add <the shop's IP>     # on the VM
```

`deploy/admin-allow.sh` **refuses to write a list that excludes the address you
are SSH'd in from**, and the 403 page now names the address it rejected — so
being locked out tells you exactly what to allow instead of nothing at all.
Full runbook in `docs/deploy/SERVER.md` § 8.

### Three things verified while building it

1. **The allowlist would actually work.** `admin.stackd.com.sa` and
   `my.stackd.com.sa` both resolve to `84.8.97.107` (Oracle, DNS-only). No
   Cloudflare edge in the path, so Caddy's `remote_ip` sees real clients.
   ⚠ **The grey cloud on the admin hostname is now load-bearing for a second
   reason**: orange would make every request arrive from a Cloudflare address
   and the list would match the proxy, not the visitor.
2. **Space-separated multi-CIDR in one env var works.** It relies on `{$VAR}`
   being substituted textually before Caddyfile tokenization. Tested against
   real Caddy 2.11.4: blocked → 403 with the client IP rendered, allowed → 200.
3. **⚠ `caddy reload` does NOT pick up a changed `ADMIN_ALLOW_CIDR`.** The
   placeholder resolves at parse time from the container's environment, fixed at
   container creation, so a reload re-reads the same old value and looks like it
   did nothing. The container must be recreated — the script does it.

### ⚠ When you do narrow it, the lease is the problem

The owner's observed address is STC (`178.86.224.126`, RDAP: Saudi Telecom, SA)
and is almost certainly dynamic. A `/32` works until the router reboots, then
the portal is gone mid-shift. Either keep the `/32` and re-run the script when it
moves, or widen to the ISP prefix (weak, but still turns away everything outside
the Kingdom). A static IP from STC removes the choice — worth asking.

It was also never confirmed whether that address is the *shop's* connection or
just where the owner was sitting. Check from the counter before pinning it.

---

## 6 August 2026 — STACKD Rewards gets an identity, and something to print

**Shipped and live.** Two commits: `64f6a20` (identity, website page, print
studio) and `7f9ed64` (both language versions, Arabic typography fixes).

The loyalty programme had a database, two portals and a wallet pass, but no name
anyone could say and nothing to put in front of a customer. It now has all three:
a mark, four printable pieces, and a page on the website.

### The programme is "STACKD Rewards / مكافآت ستاكد"

Not a rename. That is already what the portal, the wallet passes and the counter
QR called it, so nothing had to change to adopt it. The alternative names all
required renaming live surfaces to buy nothing.

### `packages/shared/src/rewards.ts` — one source of truth

The offer is a number customers will hold the restaurant to, so the poster, the
website page and the portal all read it from one file rather than each stating
it. It holds the mark (as an SVG string, so `shared` needs no React dependency),
the earn rate, and the full bilingual copy.

**⚠ `REWARDS.earnPercent` is the DEFAULT, not the truth.** The live figure is
`loyalty_settings.earn_percent`, editable on the admin Points page. Anything with
a database connection reads it from there and passes it in — the print studio
does. The constant exists for the static website, which has none.

### The mark

Three ascending chevrons in the brand's rounded badge, gold on red, brightening
upward. The badge shape is the one the rooster already sits in, so it reads as
family rather than as a second logo. No text and no photography in it, so one
file serves a favicon and an 850 mm banner.

### ⚠ The home page was advertising the old offer

`loyalty.lead` still said "Earn a point for every riyal" and the ring on the home
page read **"1 Point / Riyal"**. That stopped being true when earning moved to a
percentage of the bill, and it was live on stackd.com.sa saying so. Both now come
from `REWARDS`, so the ring cannot drift from the programme again.

### The print studio — `/signup-qr`, and `/print/[format]?lang=`

Four sizes × two languages = **eight sheets**, off one layout: A3 wall poster,
85 × 200 cm roll-up, A5 table tent, A6 counter card, each Arabic-led or
English-led. Everything inside the sheet is sized in `em` against a root of
`width / 30`, which is what lets one design serve a 105 mm card and a 2 m banner.

Both versions stay bilingual. A monolingual sign in Al Khobar excludes half the
people walking past it, so `lead` picks which language carries the headline, not
which language appears. Headline, scan line, steps, rate, bonus and fine print
all swap, and each language keeps its own numerals — `١٠٪` and `١ ٢ ٣` on the
Arabic sheet, `10%` and `1 2 3` on the English one.

**Do not put a fixed px or mm value inside the sheet.** It breaks three of the
four sizes, and only on paper, where finding out is expensive.

Three things there are load-bearing and look like clutter:

- `print-color-adjust: exact`. Browsers strip background colours when printing.
  Without it the poster prints as black type on white paper.
- `@page { margin: 0 }` and a sheet at exact trim, or the printer's default
  margin shrinks a full-bleed design and leaves a white frame.
- The Print button waits on `document.fonts.load()` before enabling. The
  `@font-face` rules use `font-display: swap`, so a print fired in the first few
  hundred ms silently sets the whole sheet in the fallback system font. On screen
  that self-corrects and nobody notices; on a banner it is a wasted print run.

`/print/[format]` is deliberately **outside** the `(portal)` route group, so it
inherits only the bare root layout and there is no chrome to hide. It is still
behind `requireStaff()`. A print stylesheet hiding the portal chrome was the
alternative, and it fails the day someone adds to the layout without knowing.

### The fonts are now generated for both apps

`scripts/fetch-fonts.mjs` writes `fonts.generated.css` and mirrors the woff2 files
into **both** `apps/web` and `apps/admin`. The admin is otherwise happy on system
fonts; the print studio is the exception. Hand-copied font files would have
drifted on the next run of that script, and the failure surfaces as a banner in
the wrong typeface.

### Type and brand only, no photography

By decision. The only food images available are Instagram crops upscaled roughly
3x (see §4 below). At A3 they would be visibly soft and on an 850 mm banner they
would be a mess. Type, the marks and flat colour print perfectly at any size.

### Bidi: every run in the other language carries `lang` + `dir`

Without `dir` on each run, the bidi algorithm resolves trailing full stops to the
paragraph direction, so an English line inside an RTL sheet prints with its
period stranded on the left.

### ⚠ Two Arabic typography rules, learned the hard way here

1. **Never `letter-spacing` Arabic.** It is cursive; tracking pulls the joins
   open into gaps mid-word. The programme name had it, and "مكافآت ستاكد" was
   coming apart. The name is now two spans and only the Latin half is tracked.
   The same rule already exists on the website for `.rw-rate-lbl`.
2. **`text-transform: uppercase` is meaningless in Arabic** and travels with
   letter-spacing in the same copy-pasted label style. Both are undone under
   `:lang(ar)`.

### ⚠ No backticks in `sheet-css.ts` comments

The whole stylesheet is a template literal. A backtick in a comment terminates
it, and the error surfaces four lines later as `Property 'ph' does not exist on
type 'string'`. This broke the admin build once already.

### Deployed

- **stackd.com.sa** — `npm run deploy` (Cloudflare Pages). `/ar/rewards/` and
  `/en/rewards/` are live, and the home page ring now reads 10%. Give it a minute
  after deploying: the first check of a brand-new path can 404 on propagation.
- **admin + my.stackd.com.sa** — rebuilt on the VM at `7f9ed64`.

### ⚠ Still to do

**The owner has still not seen any of this rendered.** There is no browser in the
agent environment, so "verified" here means the markup and the geometry were
checked, not that it looks right. The eight sheets are at
`admin.stackd.com.sa/signup-qr`.

Print one A6 on an ordinary printer and scan it with a phone that has never seen
the portal, before committing to a print run.

---

## 6 August 2026 — the POS decision, and the region finally verified

### ✅ Hosting is verified, not assumed

```
region: me-riyadh-1   AD: DsxQ:ME-RIYADH-1-AD-1   shape: VM.Standard.A1.Flex
```

Read from the instance metadata service on the box itself. Customer data is
physically in Riyadh, so the PDPL argument the whole architecture rests on is
now a checked fact rather than a plan. This had been open since hosting was
chosen and is the single most load-bearing thing in the project.

Note for anyone who looks at the public IP and worries: it resolves to an Oracle
range registered through RIPE in Europe. That is Oracle's EMEA administrative
registration and says nothing about the datacentre. The metadata above is what
counts.

### The POS is Kashier Pro, and it stays

**Kashier Pro by DKEYS** — a Saudi vendor in Dammam, Alrajaa Tower, CR
2053113231, +966 57 885 8297, dkeys@digital-keys.com.sa. Roughly twenty minutes
from the branch. The tenant is `rosepier.tenants.dkeys.net` (the app is at
`/login`; the root serves a default Passenger page).

**Foodics was evaluated and rejected.** The licence was already paid and idle,
which made it tempting, but:

- Foodics is the default choice at **three or more branches**. STACKD has one,
  so centralised inventory, unified reporting and branch-level P&L are value
  that cannot be collected yet.
- It is **iPad-only**, from SAR 1,499 per till before software. Kashier Pro runs
  on Web, Windows, Android and iOS.
- **ZATCA Phase 2 was the strongest argument for moving, and it evaporated** —
  Kashier Pro claims Phase 1 and Phase 2. ⚠ That came off a marketing page and
  is still worth confirming in writing with DKEYS, because it is the one item
  here with a fine attached.

The idle Foodics licence is being cancelled.

**Never migrate a working till to make an integration easier.** The loyalty
system is not blocked by any of this: points earn and redeem today through the
Scan page, and will keep working whatever POS runs.

### What would change the decision later

Two questions, worth asking DKEYS and worth revisiting at a second branch:

1. **Does Kashier Pro do recipe-level inventory depletion?** Food cost is the
   margin in a chicken restaurant, and knowing it per dish beats any other
   feature either system has.
2. **Does it integrate HungerStation and Jahez?** Those two are 60–70% of
   platform delivery in Saudi. Kashier's site lists Talabat, Zomato and Noon;
   Talabat and Careem together are only 10–15%. Without the big two, Phase 4
   means staff re-keying delivery orders by hand.

Failing **both** together would justify the migration. Either one alone probably
does not. A second branch is the natural moment to change systems anyway: new
site, new hardware, no disruption to a trading kitchen.

### Integration: waiting on DKEYS

Their site advertises integration capability but publishes no API documentation.
For a large vendor that is a dead end; for a small local one it is the opposite,
so they have been asked directly for:

1. **Webhooks** — can Kashier Pro call our URL when an order is paid? That is the
   whole integration; everything else is a workaround.
2. **A REST API** to read orders, as the polling fallback.
3. **A custom QR in the receipt footer**, usually a printer-template setting
   rather than a development request.

**The receipt-claim design does not need a per-order code.** A *static* QR in the
footer plus the receipt number is enough: the customer scans, types the receipt
number, and we verify it against the POS before crediting. Nothing dynamic has to
be printed, it cannot be forged, and it reuses the `order_claims` machinery that
already exists and is tested.

⚠ **Kashier Pro has its own loyalty module.** Make sure it is switched off, or
two systems will issue points and nobody will know which is right.

---

## 5 August 2026 — deployment, and the hosting decision closed

**Hosting is settled: an in-Kingdom VM, and Cloudflare stays a proxy for the
static site only.** The full guide is `docs/deploy/SERVER.md`.

**Hostinger cannot host this**, which is worth recording because `PLAN.md` still
assumed it. Two independent reasons: shared hosting cannot run Node at all, and
Hostinger has data centres in eight places — USA, UK, France, Netherlands,
Lithuania, India, Singapore, Brazil — **none in the Middle East**. Either one
disqualifies it for anything holding customer data.

**Recommended: Oracle Cloud Riyadh (`me-riyadh-1`) or Jeddah.** In-Kingdom and
the cheapest option. Google Cloud Dammam is the alternative and is ~20 minutes
from the shop. AWS's Saudi region was announced for 2026 and is still not GA;
Azure's is targeted Q4 2026. Bahrain and UAE are **not** Saudi.

⚠ **Correction to what was written earlier in this session: Oracle's Always Free
tier is 2 ARM cores and 12 GB, not 4 and 24.** Oracle halved the Ampere A1
allowance on **15 June 2026** with no announcement — the docs just changed, and
free accounts over the new limit had instances shut down until resized. A
terminated instance above the limit may not be recreatable.

2 cores and 12 GB still runs the whole stack comfortably for one branch; it only
makes building the images on the box slow, so build one app at a time.

Two things remain **unverified and only a signup attempt settles them**: whether
a Saudi region is offered as a home region for a free account, and whether A1
capacity is obtainable there at all ("out of host capacity" is a long-standing
complaint in busy regions). The home region is permanent, so it is chosen once.
If free capacity is unavailable, a paid A1 pair is roughly $15/month — take it
rather than bending the architecture.

**The customer portal hostname must stay DNS-only (grey cloud).** Proxying
`my.stackd.com.sa` would terminate TLS at Cloudflare's edge, putting customer
names, phones and order history through a US company's network — the exact
cross-border transfer PDPL governs. Enforcement began September 2024 and SDAIA
still publishes no adequacy list, so any such transfer needs SDAIA-approved SCCs.
The apex and `www` stay proxied; they serve a menu and no personal data. Grey
cloud is also mechanically required, because Caddy's HTTP-01 challenge fails if
Cloudflare answers it — which presents as a certificate bug and is a DNS one.

### What is in the repo now

`deploy/` — one Dockerfile parameterised by app, Compose with Postgres and Caddy,
`Caddyfile`, `env.example`, `backup.sh`. Both Next apps now build
`output: 'standalone'` with `outputFileTracingRoot` at the repo root; without that
root the traced bundle silently misses `@stackd/server` and fails with
MODULE_NOT_FOUND on the first request, not at build time.

**Only the customer portal is published.** Admin is reachable only through Caddy
on its own hostname, gated by `ADMIN_ALLOW_CIDR`, which defaults to open so a
first deploy is not a lockout — **narrowing it is a real step, not an optional
one.**

### ⚠ What is NOT verified

**Docker is not installed on this machine, so the container build has never
run.** Expect to fix something on the first `docker compose up`.

What was actually proven: the standalone production server starts, serves pages,
talks to Postgres and serves its static chunks (assembled by hand exactly as the
Dockerfile does it, then run with `node server.js`); the Compose file is valid
YAML with only 80/443 published; `backup.sh` parses; and a real `pg_dump` of
`stackd_dev` restored into a fresh database with 17 items, 26 RLS-enabled tables
and all 18 functions intact.

### The platform shim moved, and it is not a dev file

`supabase/local/00_shim.sql` → **`supabase/01_platform_shim.sql`**. It supplies
the `auth` schema and PostgREST roles that `schema.sql` references, so it is
**required on every plain-Postgres deployment**, which is now all of them. Living
in a folder called `local/` actively misled. Only `supabase/local/dev-data.sql`
never ships.

### ⚠ The day this first runs in production, freeze schema.sql

The init scripts apply the schema **once**, against an empty volume. After that,
editing `schema.sql` changes what a fresh database would get and does nothing to
the running one — they diverge silently, and the first person to find out is
whoever restores a backup onto a schema that no longer matches.

Freeze it, start `supabase/migrations/0001_*.sql`, apply them explicitly. There
is a note at the top of the file saying so. Do it on the day.

---

## 4 August 2026 — the customer portal, and a session bug worth remembering

### ⚠ The bug: navigating the admin nav signed you out

**Cause: a module-scoped fallback secret.** `next dev` compiles each route
separately and hands the new bundle its own module registry, so the per-boot
random signing key was **different per route**. Sign in, two or three pages work,
then the nav logs you out — because that page was compiled later, against another
key.

Setting `STACKD_ADMIN_SECRET` hides it completely, which is exactly why every
test I ran missed it: they all pinned the env var. Reproduced only by running
`npm run admin` the way a person actually does.

**Fix: the dev fallback lives on `globalThis`**, like the pg pool already did.
The rule generalises — anything in a Next app that must survive dev module
reloading goes on `globalThis`, not in a module variable.

### apps/portal — the customer loyalty portal

`npm run portal` → **http://localhost:3002**. Register, sign in, see points, show
the member QR, claim rewards, read the history. Fixture login `0555000001` /
`stackd-dev`.

**A third app, deliberately, not a route group inside admin.** One misconfigured
route in a shared app puts customers on the staff pages. It also carries its own
cookie name: a shared one would mean signing into one portal silently signed you
into the other.

The claim page **moved here from admin**, which is where it always belonged —
the person scanning a receipt is a customer, not staff. Signed in, claiming is
one tap; signed out, they enter their member code or follow a link to join.

`customer_credentials` mirrors `staff_credentials`, for the same reasons, and
drops just as cleanly the day customers move to phone OTP as PLAN.md specifies.

**`packages/server` now holds what both portals share** — db, password hashing,
money parsing, QR, and the session factory. It is separate from
`packages/shared` because everything in it touches Node, and `packages/shared` is
bundled into the browser for the website. Importing it from a client component is
a build error, which is the point.

### Website header

Home and **My points** icons, both locales. My points is an ordinary outbound
link, not a route: the site is a static export and cannot hold an account. On a
phone the labels are visually hidden and only the glyphs remain, but
`aria-label` keeps them announced.

`NEXT_PUBLIC_PORTAL_URL` must be set before a production build or that link
points at localhost on the live site.

### Getting it onto stackd.com.sa

The site is static on Cloudflare Pages and **cannot serve `/registration` or
`/login` itself.** Reaching those exact paths needs either a Pages Function
proxying them to the portal, or a subdomain like `my.stackd.com.sa`. Both need
the portal hosted somewhere first — the same PDPL decision still open below.

### Environment that must be set before anything is printed or deployed

| Variable | Consequence of leaving it |
|---|---|
| `STACKD_PORTAL_SECRET` / `STACKD_ADMIN_SECRET` | Restart signs everyone out; production refuses to sign at all |
| `STACKD_PORTAL_URL` | Every printed QR encodes `localhost` and does nothing on a phone |
| `NEXT_PUBLIC_PORTAL_URL` | The website's My points link points at localhost |

The Signup QR page shows a warning banner while the URL still says localhost, so
this is hard to print by accident.

### Submit buttons show they are working

Server actions navigate on completion, so between the click and the new page
there was no feedback at all — long enough on shop wifi for someone to press
again and submit twice. `SubmitButton` disables while pending, spins, and sets a
`progress` cursor. `useFormStatus` only reports the form it is rendered *inside*,
which is why it is a component and not a hook call in the page.

---

## 4 August 2026 — points per dish, and the bill QR

**The loyalty model changed shape.** Points were computed from the order total.
They are now computed **line by line**: each line earns either its item's fixed
`points_award` (times quantity) or the per-riyal rate on that line. Mixing the
two is the point — most of the menu earns by value, while a dish being pushed can
be worth a flat number regardless of price. A Scoopy-Doo set to 200 earns 200,
not the 21 its 25 SAR would otherwise give.

Blank means earn by value. **`0` means earns nothing**, which is a different
thing and is what you want on a bottle of water.

An order with **no line items falls back to its ticket total.** Every POS
integration until someone writes one sends a total and nothing else, and that
must not silently earn zero.

The earn rate, expiry window, sign-up bonus and claim window are now rows in
`loyalty_settings`, editable on the portal's **Points** page, not constants.

**Reward discounts are deliberately not deducted before earning.** The customer
already paid for that discount in points; shrinking what the visit earns would
take the same points twice.

### The bill QR

The counterpart to a cashier scanning a member's code. Most walk-ins are
anonymous at the till, so the receipt carries a QR instead: the customer scans it
later, the points land, and the sale is linked to them retroactively — which is
the only moment that link can ever be made for a cash purchase.

`order_claims` holds the token. It is a **bearer token**: whoever holds the
receipt can claim it, like a paper voucher, exactly once. The alternative is
asking someone to prove they made a cash purchase, which nobody can do.

Two things the database enforces rather than trusting the app with:

- **Reprinting reissues the same code.** `issue_order_claim()` is idempotent on
  `order_id`, so a reprint cannot mint a second claim on one sale.
- **An order that already credited a member cannot also issue a QR.** Otherwise
  one sale pays out twice — once at the till, and again to whoever picks the
  receipt up off the table.

⚠ **`STACKD_CLAIM_BASE_URL` must be set before a single receipt is printed.** It
is the address the QR encodes, it defaults to `http://localhost:3001`, and paper
cannot be corrected afterwards.

### Also new in the portal

- **Orders** — the day's trade by trading day and source, per-order detail with
  line items, VAT breakdown, points, and the QR to print.
- **Staff** — add people, change roles, reset passwords, deactivate. Owner only:
  a manager who could promote themselves to owner is not a manager. Staff are
  **deactivated, never deleted**, because `loyalty_transactions.actor_id` points
  at them and those names are the whole reason the column exists.
- **Sign someone up** — any staff member can enrol a customer at the counter,
  which is the moment it matters. Phones normalise to E.164 from `054 755 7666`,
  `0512345678` or `+9665…`.
- **Item photos** — upload and replace from the portal. They write into
  `apps/web/public/menu/` named by slug, because the site is a static export and
  images must be real files at build time; a new photo needs `npm run build`
  before anyone sees it. The filename never contains request input — it comes
  from the item's slug, which is `[a-z0-9-]` — and the photo route reads only what
  the database says the file is.

A test-harness lesson worth keeping: `rejects()` in the schema tests now runs
inside its own savepoint. A failed statement aborts the whole transaction, so a
second expectation in one test was reporting "current transaction is aborted"
instead of whatever it was actually checking.

---

## 4 August 2026 — the data model is real

**Postgres 18 installed locally; the schema applies clean and 79 tests pass**
(40 shared + 19 functions + 20 schema). `npm run sync:menu` regenerates the
website menu from the database and reports no semantic change, which is the proof
that the model covers everything the site renders.

Setup is a one-time three lines, and needs a real terminal — `sudo` cannot prompt
for a password through the agent's shell:

```bash
sudo apt install -y postgresql
sudo service postgresql start
sudo -u postgres createuser --superuser "$USER"   # role for peer auth on the socket
```

`sudo service postgresql start` again after each WSL restart; there is no systemd
here to do it. Then `npm run db:reset && npm test`.

**The model changed shape in four ways.** Full reasoning is in the file comments.

1. **RLS on every table, no exceptions.** The previous revision enabled it on
   nine tables and missed seven — `branch_hours`, `branch_menu_availability`,
   `modifier_groups`, `modifiers`, `menu_item_modifier_groups`,
   `order_item_modifiers` and `tax_invoices`, the last of which holds the ZATCA
   hash chain. Behind PostgREST a table with RLS off is not merely readable, it
   is **world-writable with the anon key**, which ships inside the app bundle.
   `supabase/schema.test.mjs` now asserts `relrowsecurity` across the whole
   schema, so the eighth one someone adds cannot quietly miss it.
2. **Staff exist.** There was no way to tell a cashier from a customer, so the
   kitchen display could not read the orders it exists to display. New `staff`
   table plus an `is_staff_at()` helper, which **must** stay `security definer` —
   a policy on `orders` that reads `staff` directly needs `staff` readable, and
   the policy permitting that reads `staff` again. That recursion is a runtime
   error, so it surfaces as a broken kitchen display, not a failed migration.
3. **Walk-in tickets are modelled.** `orders.customer_id` is now nullable and
   `source` is `app` or `pos`. The Phase 2 cashier-scan flow ships *before* app
   ordering, and it could not be represented at all. Customers carry a
   `member_code` for the QR — deliberately not the `auth.users` UUID, which
   authenticates elsewhere and should not be printed on a receipt.
4. **Points are minted by a function, not by a comment.** `mint_loyalty_points()`
   is security definer and revoked from `anon`/`authenticated`; the grant is the
   control. Partial unique indexes make a double-mint a constraint violation
   rather than free money.

**Four bugs found, and only executing the SQL could have found any of them.**
This is the whole argument for doing this before the app exists.

*Redemption could never have worked.* The loyalty balance trigger — unchanged
from the first revision — was one `insert ... on conflict (customer_id) do
update`. Postgres evaluates CHECK constraints on the **proposed** row before it
detects the conflict, and the proposed row carries the raw delta. So redeeming 50
points builds a speculative row with `balance = -50`, trips `check (balance >=
0)`, and raises before the DO UPDATE branch is ever considered — *even when the
balance row plainly exists with enough points in it*. Reproduced at top level,
outside any function. It is now split: an `insert ... on conflict do nothing` to
ensure the row, then an UPDATE that does the arithmetic, whose check runs against
the final row. **Do not fold it back into an upsert**; there is a comment on it
saying so.

*The schema could never have been created.* `create unique index ... on orders
(branch_id, pickup_code, (created_at::date))` is rejected outright by Postgres:
casting a timestamptz to date reads the session TimeZone, making it `STABLE`, and
index expressions must be `IMMUTABLE`. Replaced with a stored `service_date`,
which also fixes the semantics — the trading day runs to 03:00, so a 01:30 order
belongs to the previous evening's ticket numbering, not to the calendar date.

*`seed.sql` had already drifted from `menu.ts`.* The two Arabic names resolved
from STACKD's own launch posters on 3 Aug (`تورتيلا الدجاج`, `ستربس الدجاج`)
landed in the TypeScript and never went back into the SQL. That is the drift
`npm run sync:menu` now exists to stop.

*Anonymous access broke after any earlier impersonation.* `current_setting(...,
true)` reverts a custom GUC to the **empty string**, not to unset, once it has
been `SET LOCAL` and the transaction has ended — so `auth.uid()` hit `''::json`
and raised "invalid input syntax for type json". It works in a fresh session and
fails the moment a previous transaction set a JWT claim, which is a horrible
thing to debug. Fixed in the local shim, which now guards the empty string before
the cast.

**Two lessons about the tests themselves, both the same shape as the
`node --test functions/` trap below.** A `reset role` in a `finally` masked every
real assertion error behind "current transaction is aborted", because the tests
that expect a query to raise leave the transaction aborted. And `asRole()`
originally opened a bare `begin` inside an already-open transaction — Postgres
treats that as a warning-only no-op, so the inner `rollback` silently discarded
the outer test's setup and looked exactly like a policy bug. It nests via
savepoints now.

The schema tests were verified by breaking an assertion on purpose and confirming
red (1 fail, exit 1), then restoring. Do that for any new test entry point.
They also **fail loudly rather than skip** when the database is unreachable;
`STACKD_SKIP_DB_TESTS=1` is the only, explicit, opt-out.

**The menu is generated from the database from here on.**
`packages/shared/src/menu.ts` is rewritten between its `<generated:menu>` markers
by `npm run sync:menu`. Hand edits inside that region are overwritten. Everything
outside it — the types, `BRANCH`, `BRAND`, the helpers — is hand-written and
stays. Photo provenance notes live in `menu_items.photo_note` and are re-emitted
as comments each run, so the § 4 caveats below survive regeneration.

To change the menu: edit `supabase/seed.sql` → `db:reset` → `sync:menu` → `test`.

**What is not in this pass:** the Moyasar integration itself (the `payments`
table is there, the edge function is Phase 3), ZATCA XML and hash chaining (table
and gapless counter are there, UBL 2.1 is Phase 3 and still gated on the missing
CR and VAT numbers), and the in-Kingdom hosting decision, which stays open — see
"The app backend needs rethinking" below. The schema is plain Postgres and does
not change with that decision; only where it runs does.

---

## 4 August 2026 — the admin portal

`npm run admin` → **http://localhost:3001**. Sign in `owner@stackd.local` /
`stackd-dev`. Four pages: overview, members, rewards, menu.

**Deliberately local-only for now, and that is the whole design.** A hosted
portal means answering the question deferred twice below — where the database
lives, given Supabase has no Middle East region and PDPL expects Saudi personal
data to stay in the Kingdom. A loyalty portal is names, phones and order history,
so it is exactly what that decision gates. Running it against `stackd_dev` gets a
real working tool with zero exposure; deploying it later changes a connection
string, not the app.

**It is the first thing here that runs a server.** `apps/web` is
`output: 'export'` — no runtime, no secrets, no database, correct for a menu and
useless for a portal. `apps/admin` is the opposite. It listens on **3001** so it
never shares `.next` with `npm run dev`; see the warning below about what that
corruption looks like.

**The portal bypasses RLS.** It connects as the database owner, the same posture
`service_role` has, which is right for an admin tool and means **RLS is not a
safety net in this app**. `requireStaff()` / `requireRole()` at the top of every
page and every server action is the only check there is. Adding a page without
one adds a hole.

Roles: everyone signed in can look members up; only `manager` and `owner` can
change points, rewards or prices. A cashier sees no Edit buttons and the action
throws if called anyway — verified by posting to it as a cashier.

**Point adjustments write to the ledger, never to the balance.** The balance is a
cached projection and would be overwritten by the next transaction, leaving no
record of who did what. `manual_adjust` rows carry the actor, which the database
insists on. Over-drawing is refused with "That would take the balance below
zero", not a raw constraint name.

**Staff passwords are scrypt in `staff_credentials`,** kept out of `staff` so a
row saying who someone is can be selected without a hash riding along, and so the
whole table drops cleanly if staff ever move to GoTrue like customers. The login
verifies a dummy hash when the account does not exist, so timing and wording do
not reveal which emails are real.

⚠ **Set `STACKD_ADMIN_SECRET` before this is ever deployed.** Without it, session
cookies are signed with a per-boot random key. Locally that just means a restart
signs you out; in production the app refuses to sign a session at all rather than
fall back to a shared default that would make every cookie forgeable.

**Menu edits do not reach the live site on their own** — `npm run sync:menu`, then
`npm run deploy`. The page says so in a banner. Item names and descriptions are
deliberately not editable there: they are bilingual and the Arabic came off
STACKD's own board and posters, so `seed.sql` is the place to change them.

Two things found while testing it, both worth remembering. `next build` imports
every module to collect page data, so a secret checked at module scope fails the
BUILD on a machine with no runtime secret — resolve lazily. And the first
`$ACTION_ID_` in a page's HTML belongs to the layout's **sign out** form, not to
the form you meant; posting to it silently logs you out and looks exactly like a
broken session.

---

## Shipped 3 August 2026

Live and verified on the real domain. Four commits: `c009538`, `c29a32b`,
`bf49d39`, plus `a06ac88` / `4b54a5f` / `638fc5e` for the domain and DNS work.

- Domain live: apex serves, `www` 301s to it, certificates active
- All 8 dish photos wired up (see § 4 for the caveats — two are real problems)
- Dark default + header theme toggle, and four WCAG failures fixed in light mode
- Favicons — there were none, and `/favicon.ico` was throwing on every page load
- `metadataBase` set so shared links render a preview
- Vertical rhythm rebuilt on a named scale; section gaps roughly a third tighter
- Phone → 054 755 7666; email card publishes `info@stackd.com.sa`
- Em dashes gone from all visible copy, including the browser tab title

**Three bugs found this session all failed silently while reporting success.**
Worth remembering as a pattern: `node --test functions/` passed with a
deliberately failing assertion, `wrangler pages deploy` reported success for
deploys that went nowhere, and a Pages custom domain sat `pending` with a blank
error message. Verification commands for each are in the sections below and in
`docs/deploy/README.md`.

**⚠ `info@stackd.com.sa` is published on the live site and in Google's
structured data.** It must exist as a real mailbox or alias on MXroute or mail to
it bounces. Send a test message.

**Nothing has ever been reviewed visually by me** — this environment has no
browser. Every visual judgement so far is the owner's. Run `npm run dev` and look
before shipping design changes.

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

### 3. Menu conflicts — four left of six

See `docs/DISCREPANCIES.md`. Two were closed on 3 Aug 2026 by STACKD's own
launch posters, which gave the official Arabic names and confirmed both items are
new rather than discontinued: `تورتيلا الدجاج` and `ستربس الدجاج`.

**The blocking one: real calorie figures for Soft Drink and Kenza.** Both printed
menus copied the sauces column (67 / 62 / 75), which is why water was listed at
75 kcal. Those two are `null` — the site omits them rather than publishing
numbers known to be wrong. Saudi menu-labelling rules require accuracy.

Also unresolved: Giants calorie counts (1100/1200 digital vs 1500/1600 in-store)
and Classic-Stackd calories (the in-store board disagrees with itself).

### 4. Photography — eight of twelve dishes covered

Every dish now has an image. Sources differ and it matters:

| Item | Source | Quality |
|---|---|---|
| Tortilla Strips, Chicken Strips | July camera shoot | Good |
| Fries | July camera shoot, plain not seasoned | Good |
| Classic / Maple / Big-Stackd, Scoopy-Doo | Instagram post crops | **~3x upscaled, soft** |
| Fire-Attack | **Composite, not a photograph** | See below |

**Two things to fix when you can.**

*Fire-Attack is not a photo of Fire-Attack.* It is the Scoopy-Doo plate,
warm-graded to read spicier, with jalapeno slices drawn in — done at the owner's
explicit instruction, asked for twice. The grade is defensible since the dish
really is Nashville-seasoned. The jalapenos are not in the recipe. The full
caveat sits above the `image:` field in `menu.ts`. One real photo of the dish
removes the whole issue.

*The five poster crops are soft.* Each source was a phone screenshot of an
Instagram post; the food occupies only 333–480px, so it is upscaled with a light
sharpen. Fine at card size, visibly soft on a large screen. **Getting the
original files from whoever designed those posts is the single biggest remaining
visual upgrade.** Still missing entirely: Coleslaw and Cheesy-Cheese.

Adding one: drop a 4:3 file in `apps/web/public/menu/` named by slug, set
`image:` on the item. Brief in `apps/web/public/menu/README.md`.

Instagram cannot be scraped for these — the profile returns a JS shell with no
image URLs and the API 401s without a login. Two posts in the folder the owner
supplied carry Instagram's own `AI info` label; neither was used.

### 5. Light mode was never designed — check it as you go

It shipped hidden behind `prefers-color-scheme` for months, so nobody had looked
at it. Measuring it on 3 Aug found four WCAG AA failures, all fixed:

- brand gold as text was **1.96:1** on cream (9.24:1 on the dark ground) and was
  carrying every eyebrow, the hero slogan, category counts and info-card titles
- the 10.5px tag chips sat at 3.90:1, the spicy variant at 3.51:1
- `--text-faint` at 3.90:1 was used for the footer copyright, ring label, chip keys
- `.card-feature` paints a dark gradient in BOTH themes but only overrode
  `.card-desc`, so the featured card's title and calorie tag vanished

**Rule that came out of it: never set gold type with `var(--gold)`.** Use
`var(--label)`, which darkens to `#7a5200` in light. `--gold` is for decoration
on fixed backgrounds only. The same trap exists for any element with a fixed
dark background — its text must be set explicitly, not left to inherit `--text`.

Contrast is worth measuring rather than eyeballing:

```python
def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[(v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4) for v in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
cr=lambda a,b:(max(lum(a),lum(b))+0.05)/(min(lum(a),lum(b))+0.05)
```

Light ground is `#fbf8f2` (page) and `#fefefe` (cards). AA needs 4.5:1 for normal
text, 3:1 for large. Nothing on the site is "large" except headings.

---

## Commands

```bash
npm run dev       # http://localhost:3000/ar/
npm test          # 103 tests (41 shared + 6 server + 19 functions + 37 schema)
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
| **Dark is the default for every visitor** | `prefers-color-scheme: light` was removed 3 Aug 2026. Light exists only behind the header toggle. The media override meant months of review happened in a cream theme nobody designed |
| Gold type uses `--label`, never `--gold` | `--gold` is 1.96:1 on cream. `--label` darkens to `#7a5200` in light. `--gold` is for decoration on fixed backgrounds only |
| Vertical rhythm is three named steps | `--sp-section` / `--sp-block` / `--sp-group`. Section padding was `clamp(64px, 10vw, 132px)` on both edges — 240px between sections — patched with hand-written inline `paddingBlockStart: 0`. Use `.section + .section` instead |
| The theme toggle picks its icon in CSS | A static export renders at build time and cannot know the visitor's theme. Choosing in JS mismatches on hydration or leaves the button blank until mount |
| Poster-crop photos are accepted, softness and all | Owner's call. Five of eight images are ~3x upscaled Instagram crops. Replace with originals when available; do not re-crop from the screenshots |
| Photos on dishes only | Sauces and drinks stay text cards; 17 placeholder tiles looked unfinished |
| Money as integer halalas | `2700` = 27.00 SAR. Never floats |
| **Prices are VAT-inclusive** | KSA requires it. 27 SAR *contains* its VAT. Never add 15% on top — see `splitVatInclusive` |
| Loyalty as append-only ledger | Points are money; disputes need an audit trail |
| Points earned on the pre-VAT net | A 60 SAR ticket earns 52, not 60 |
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

- **Narrow `ADMIN_ALLOW_CIDR`** — still `0.0.0.0/0` by decision, so the staff
  portal is open to the internet. The tooling and runbook are in place; it needs
  the shop's public IP and one command. See the 6 Aug entry above.
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
