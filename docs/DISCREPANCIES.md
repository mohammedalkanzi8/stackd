# Menu data conflicts — need an owner decision

**Status: 1 of 7 resolved.** §1 (water price) is settled. §2–§7 still open.

Two menus were supplied and they disagree. Both are in circulation, so customers
are seeing different numbers depending on where they look. Resolve before launch,
because the app becomes a third version of the truth otherwise.

**Source A** — digital menu on Google Maps (photos, newer layout, 2 extra items)
**Source B** — in-store menu board (bilingual, authoritative for Arabic names)

---

## 1. Water price

| | Source A | Source B |
|---|---|---|
| Water | **2 SAR** | 1 SAR |

**✅ RESOLVED — owner confirmed 2 SAR.** Seeded accordingly. The in-store board's
1 SAR is stale and should be corrected at the next reprint.

## 2. Calorie counts on the Giants

| | Source A | Source B |
|---|---|---|
| Scoopy-Doo | 1100 | **1500** |
| Fire-Attack | 1200 | **1600** |

A 400 kcal gap. Saudi menu-labelling rules require accurate calorie display, so
this is a compliance exposure, not just a typo. Seeded with Source A pending
confirmation.

## 3. Classic-Stackd calories

Source A says **550**. Source B's English column appears to read **850**, while
Source B's Arabic column reads **550**. The in-store board disagrees with itself.

## 4. Drinks calories are wrong on BOTH menus

| Item | Printed | Reality |
|---|---|---|
| Soft Drink | 67 | plausible only for a small diet drink |
| Kenza | 62 | ? |
| **Water** | **75** | **0 — water has no calories** |

The sauces column immediately above reads **67 / 62 / 75** — the exact same three
numbers in the same order. The calorie values were duplicated from the sauces
block when the artwork was made, on both the digital menu and the in-store board.

**Water at 75 kcal is the tell.** Seeded water at 0 and left soft drink / Kenza
as NULL rather than publish known-bad figures. Needs real values.

## 5. ~~Two items missing from the in-store board~~ — RESOLVED 3 Aug 2026

`Tortilla Strips` (19 SAR) and `Chicken Strips` (23 SAR) appeared on the digital
menu only, with Arabic names that were my translations rather than yours.

STACKD's own launch posters (July 2026) settle both questions. They are **new
additions**, not discontinued — the posters read `طبق جديد` and `جديد ولذيذ`
("new dish" / "new and delicious"). And they carry the official Arabic names,
which differ from what I had guessed:

| Item | My translation | Official (poster) |
|---|---|---|
| Tortilla Strips | `تورتيلا ستربس` | `تورتيلا الدجاج` |
| Chicken Strips | `ستربس دجاج` | `ستربس الدجاج` |

Note the Arabic names are *Chicken Tortilla* and *Chicken Strips* — the poster
does not translate "Tortilla Strips" literally. `menu.ts` now uses the poster
wording and the `arabicNeedsReview` flags are gone.

Still worth confirming the in-store board gets updated to match.

## 6. Wordmark inconsistency

The in-store board reads `CLASSIC - STACK`, `MAPLE - STACK`, `BIG - STACK`
(no **D**). The digital menu reads `CLASSIC-STACKD`, `MAPLE-STACKD`, `BIG-STACKD`.
Going with **STACKD** everywhere since that's the brand name. Worth correcting on
the board at the next reprint.

## 7. Tagline — which is canonical?

- Menu artwork: **"STREET FOOD. REAL FLAVOR. STACKED RIGHT."**
- National Day creative: **"FRESH CHICKEN. REAL TASTE."**
- Both menus: **"Don't Eat. Get STACKD"**

Treating *"Street food. Real flavor. Stacked right."* as the positioning line and
*"Don't Eat. Get STACKD"* as the campaign slogan. Confirm.

---

## Confirmed brand facts (no conflict)

- **Palette:** red `#D8231A`, near-black, white, red/white checkerboard border.
  The green + gold seen elsewhere is National Day 94 seasonal only.
- **Mascot:** white rooster, red comb, arms crossed, in a red rounded badge.
- **Instagram:** `@stackdchicken`
- **TikTok:** `@Stackd`
- **Location:** الخبر الشمالية — North Khobar
- **Positioning:** American street food, chicken-led
