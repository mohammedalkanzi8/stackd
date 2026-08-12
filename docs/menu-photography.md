# Menu photography

Covers `apps/web/public/menu/`. This lives in `docs/` rather than beside the
images because `public/` is copied verbatim into the static export — a README in
there is served to the world at `stackd.com.sa/menu/README.md`, notes and all.

**Do not drop files into `public/menu/` by hand.** Everything in that folder is
generated from raw shots by:

```
node scripts/shoot-to-web.mjs
```

Put the originals in `new_shots/` (or pass `--src`), add an entry to the `SHOTS`
list in that script naming the source file, the item slug, a crop and a grade,
then run it. It writes `<slug>.webp` at 1200x900 for every entry.

Doing it through the script rather than an image editor is what keeps the set
looking like one shoot: the crops are written down and reviewable, and the three
different lighting worlds the photos arrive in — warm plated shots, the steel
tray on marble, and white-background packshots — get graded onto the same footing
instead of one of them glaring against the site's near-black ground.

Then point the item at it. **The database is the source of truth**, not
`menu.ts`:

```sql
-- supabase/seed.sql
'/menu/big-stackd.webp',
'One line on where this photo came from and anything odd about it.',
```

followed by `npm run db:reset` and `npm run sync:menu`.

An item with no `image_url` renders a branded placeholder, so the site never
shows a broken or empty box. Add photos one at a time as you get them.

## What to shoot

- **4:3 landscape.** Other ratios get cropped to fit and you lose control of
  what is cut off. A portrait frame loses about half of itself.
- **1200px wide minimum.** Cards render up to ~600px on large screens and
  double that on retina displays.
- **JPG straight off the camera is fine** — the script handles resizing,
  grading and WebP. Send the biggest file you have, not a resized one.
- Shoot against the dark counter or a plain surface. The site's ground is
  near-black, so a white studio background needs the `studio` grade to sit on it
  and still never looks quite as at home as a dark one.

## Filenames

The source filename does not matter — the script maps it to a slug. What matters
is that the slug in `SHOTS` matches the item: `classic-stackd`, `maple-stackd`,
`big-stackd`, `tortilla-strips`, `chicken-strips`, `scoopy-doo`, `fire-attack`,
`fries`, `coleslaw`, `cheesy-cheese`.

A phone camera in good light beats a bad studio shot. Natural light near a
window, food slightly off-centre, shot from about 30 degrees above.

## The two composites

Two cards are built rather than shot, and both are flagged in `seed.sql`:

- **Fire-Attack** is the Scoopy-Doo bowl with the `heat` grade masked to an
  ellipse over the food. The room behind it is untouched. Honest only because
  the owner confirmed the two Giants are one dish with a different sauce.
- **Cheesy-Cheese** is the fries scoop with the cheese pot keyed off its own
  white sweep and seated beside it. Both halves are real product at the size
  it is served.

Neither adds anything to the food. If you ever need to add something that is not
in the dish, don't — shoot it instead.

## Still outstanding

- **Fire-Attack has never been photographed.** A real frame would still be
  better than a masked grade of a different bowl.
- **Chicken Strips** is the last item from the July export rather than a
  full-resolution original.
- Sauces and drinks are deliberately text-only. `Stackd Sauce` and `Ranch`
  packshots exist in `new_shots/` and are unused.
