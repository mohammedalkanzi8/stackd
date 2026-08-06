# At the counter

How points are given and taken. Two flows, both through **Scan** in the admin
portal.

**One point is one halala.** 100 points is 1.00 SAR. A reward's cost in points
is just its price in halalas, and a customer can check any figure against their
own receipt without being told an exchange rate.

**Earning is 10% of the bill**, VAT included, on the total actually paid. A
115.00 SAR bill earns 1150 points, worth 11.50 SAR off a later visit.

---

## Giving points

1. Customer shows their member QR, or reads out their 8-character code.
2. Cashier opens **Scan** and scans it. The field is already focused, so a
   hardware scanner needs no tapping at all.
3. The page shows who they are and their balance.
4. Cashier types the **bill total** and presses Add points.

Behind that, a POS ticket is written and points minted against it. Every point
is therefore traceable to a real bill, and the same double-mint guard that
protects app orders applies here.

**If they are not a member yet**, sign them up on the Members page first, or
point them at the signup QR by the till. It takes under a minute.

**If they forgot to scan**, the receipt QR still works: `Scan` accepts it, then
asks for their member code.

---

## Taking points off a bill

1. Customer opens **Spend points off your bill** in their portal. It defaults to
   their whole balance; they can type any amount.
2. They press **Redeem**. A QR appears with a **three-minute countdown**.
3. Cashier scans it. The page shows the amount in riyals.
4. Cashier presses **Confirm**, then takes that much off the bill in the till.

⚠ **The points come off when you scan, not when they press Redeem.** An
abandoned code costs the customer nothing. If the till transaction is then
cancelled, correct it from the member's page with a manual adjustment, which is
recorded against your name.

### Why three minutes

The code is a bearer token for real money on a screen in a public place. Three
minutes is long enough to reach the front of a queue and short enough that a
photograph of somebody's screen is worthless by the time it is used.

**Expired?** The customer presses Redeem again. Generating a new code cancels the
old one, so only one is ever live — otherwise a customer could keep several
screenshots and spend the same points repeatedly.

**Each code works once.** A second scan says so plainly.

---

## Scanning

Two ways, both on the same page:

**A hardware barcode scanner** — USB or Bluetooth. It behaves as a keyboard: it
types the code and presses Enter. Faster and far more reliable than a camera in a
busy restaurant, and cheap. This is what a real till should end up with.

**The device camera** — the *Use camera* button, for a phone or tablet with
nothing plugged in. Chrome on Android reads QR codes natively; Safari on iOS does
not, so on an iPad the button is hidden and the field remains.

**Typing works always.** The code alphabet deliberately omits `0`, `O`, `1`, `I`
and `L`, so a code can be read aloud when a scanner refuses or a screen is too
cracked to scan.

The scan field is a plain form. If JavaScript fails to load, typing a code and
pressing Enter still works, because a till is the last place that should depend
on it.

---

## Changing the numbers

**Points → Programme** in the admin portal:

| Setting | What it does |
|---|---|
| Earn rate | Percent of the bill returned as points. 10 by default. |
| Sign-up bonus | Points given on registration |
| Expiry | Months of inactivity before a balance lapses |
| Bill QR lasts | Days a receipt code stays claimable |
| Redeem QR lasts | Seconds a redemption code stays valid |

Changes apply to the next order. **Points already earned are never
recalculated** — the ledger is a record of what happened, not a formula.

A single dish can also be worth a fixed number of points regardless of price, on
the same page. That is the lever for pushing one item without discounting it.
