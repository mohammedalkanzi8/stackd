# Menu photography

Drop item photos here, then reference them from `packages/shared/src/menu.ts`:

```ts
{ slug: 'big-stackd', ..., image: '/menu/big-stackd.jpg' }
```

Any item without an `image` renders a branded placeholder, so the site never
shows a broken or empty box. Add photos one at a time as you get them.

## What to shoot

- **4:3 landscape.** Other ratios get cropped to fit and you lose control of
  what is cut off.
- **1200px wide minimum.** Cards render up to ~600px on large screens and
  double that on retina displays.
- **JPG or WebP**, under ~300 KB each. WebP is roughly 30% smaller at the same
  quality.
- Shoot against the dark counter or a plain surface — the site's ground is
  near-black, so busy pale backgrounds fight it.

## Filenames

Match the item slug exactly: `classic-stackd.jpg`, `scoopy-doo.jpg`,
`fire-attack.jpg`, `big-stackd.jpg`, `tortilla-strips.jpg`,
`chicken-strips.jpg`, `fries.jpg`, `coleslaw.jpg`, `cheesy-cheese.jpg`.

A phone camera in good light beats a bad studio shot. Natural light near a
window, food slightly off-centre, shot from about 30 degrees above.
