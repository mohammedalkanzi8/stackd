/**
 * Menu-finishing grade — tone and colour, on the pixels already in the frame.
 *
 *   node scripts/retouch.mjs                 # all recipes, to a scratch dir
 *   node scripts/retouch.mjs --only BIG-STACKD.jpg --out /tmp/x
 *
 * This is the editorial pass: a tone curve, hue-targeted saturation, vibrance,
 * local contrast and output sharpening. It is deliberately NOT part of
 * shoot-to-web.mjs — that script's job is to make every shot sit on the same
 * ground, and this one's is to make an individual frame look its best. Run this
 * first if a photo needs it, then let shoot-to-web do the crop and the WebP.
 *
 * Nothing here adds anything to the food. No garnish, no props, no invented
 * ingredients. If a dish needs something it does not have, shoot it again.
 *
 * ---------------------------------------------------------------------------
 * Why the recipes differ
 * ---------------------------------------------------------------------------
 * The same numbers on every frame is how retouching goes wrong. Two worlds:
 *
 *   camera  — DSC07611 off the A7S III. Flat, neutral, everything still in the
 *             file. It wants lifting: real shadow lift, a real S-curve, real
 *             vibrance.
 *   plated  — the supplied burger shots. Already retouched before they reached
 *             us: contrasty, saturated, sharp, on a warm dark bokeh. They want
 *             almost none of that. Lift these the same way and the bokeh goes
 *             milky, the sauce goes neon, and the crust picks up a halo.
 *
 * The one thing the plated shots genuinely need is the greens: lettuce and
 * coleslaw are the first thing to go dull in a warm-graded frame, and they are
 * the front of the sandwich.
 */

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const SRC = resolve(ROOT, flag('src', 'new_shots'));
const OUT = resolve(ROOT, flag('out', 'new_shots/graded'));
const ONLY = flag('only', null);

// --- Tone curve -------------------------------------------------------------
// A 256-entry lookup, built once per recipe: identical result to evaluating per
// pixel, minus a few million transcendental calls.
function toneCurve({ shadowLift, highlightRolloff, sCurve }) {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let x = i / 255;
    x += shadowLift * Math.pow(1 - x, 3.2);
    x -= highlightRolloff * Math.pow(x, 3.0);
    const s = x * x * (3 - 2 * x); // smoothstep is a full S; blend a little in
    x += sCurve * (s - x);
    lut[i] = Math.max(0, Math.min(255, Math.round(x * 255)));
  }
  return lut;
}

// --- HSL --------------------------------------------------------------------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/** Smooth 0..1 membership of a hue band, so no band edge shows as a seam. */
function band(h, lo, hi, feather = 14) {
  const dist = (a, b) => { const x = Math.abs(a - b) % 360; return x > 180 ? 360 - x : x; };
  const inside = lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi; // wraps at 0
  if (inside) return 1;
  const edge = Math.min(dist(h, lo), dist(h, hi));
  return edge >= feather ? 0 : 1 - edge / feather;
}

// --- Recipes ----------------------------------------------------------------

const RECIPES = {
  /** Flat camera original. Everything is still in the file; lift it. */
  camera: {
    wb: [1.045, 1.0, 0.955],
    curve: { shadowLift: 0.14, highlightRolloff: 0.13, sCurve: 0.13 },
    hsl: {
      green:  { lo: 75, hi: 165, hue: -7, sat: 1.30, lum: 1.09 },
      orange: { lo: 18, hi: 52,  hue: +1, sat: 1.13, lum: 1.05 },
      red:    { lo: 352, hi: 15, hue: 0,  sat: 1.12, lum: 0.98 },
    },
    vibrance: 0.34,
    // m1 is the gain in FLAT areas and it stays at 0. Above zero, a wide
    // unsharp amplifies the 8x8 blocking a JPEG leaves in smooth out-of-focus
    // ground — the bokeh picks up a mottled, quilted texture that reads as a
    // bad upscale. m2 is the gain on real detail, which is all we want lifted.
    clarity: { sigma: 9, m1: 0, m2: 0.6 },
    texture: { sigma: 1.1, m1: 0, m2: 2.4 },
  },

  /**
   * Already-retouched studio plate. A quarter of the camera recipe, and the
   * shadow lift is nearly off: the dark bokeh behind these is what separates
   * the sandwich from the ground, and lifting it turns the separation to mush.
   *
   * The greens are the exception and get MORE than the camera recipe, because
   * warm-grading a plated shot is exactly what kills lettuce.
   */
  plated: {
    wb: [1.012, 1.0, 0.992],
    curve: { shadowLift: 0.02, highlightRolloff: 0.07, sCurve: 0.05 },
    hsl: {
      green:  { lo: 70, hi: 170, hue: -8, sat: 1.34, lum: 1.12 },
      orange: { lo: 18, hi: 52,  hue: 0,  sat: 1.04, lum: 1.02 },
      red:    { lo: 352, hi: 15, hue: 0,  sat: 1.05, lum: 0.99 },
    },
    vibrance: 0.10,
    // m1 at 0 — see the camera recipe. These frames are the worst case for it:
    // a large, smooth, already-compressed bokeh behind the plate.
    clarity: { sigma: 7, m1: 0, m2: 0.34 },
    texture: { sigma: 1.0, m1: 0, m2: 1.7 },
  },
};

// Keyed by SOURCE filename, and deliberately uncropped.
//
// Grading is per-pixel, so it does not care about the frame. Cropping here would
// mean shoot-to-web.mjs cropping an already-cropped image and landing somewhere
// else entirely. Colour lives in this script; geometry lives in that one.
const SHOTS = [
  { src: 'CLASSIC-STACKD.jpg', recipe: 'plated' },
  { src: 'MAPLE-STACKD.jpg',   recipe: 'plated' },
  { src: 'BIG-STACKD.jpg',     recipe: 'plated' },
  { src: 'DSC07611.jpg',       recipe: 'camera' },
];

// --- Build ------------------------------------------------------------------

async function grade(shot) {
  const r = RECIPES[shot.recipe];
  const curve = toneCurve(r.curve);

  const { data, info } = await sharp(join(SRC, shot.src))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const px = info.width * info.height;
  const keys = Object.keys(r.hsl);

  for (let p = 0; p < px; p++) {
    const i = p * info.channels;

    let rr = Math.min(255, data[i] * r.wb[0]);
    let gg = Math.min(255, data[i + 1] * r.wb[1]);
    let bb = Math.min(255, data[i + 2] * r.wb[2]);

    rr = curve[Math.round(rr)];
    gg = curve[Math.round(gg)];
    bb = curve[Math.round(bb)];

    let [h, s, l] = rgbToHsl(rr, gg, bb);
    // Below this the pixel is effectively neutral, and nudging its hue only
    // tints the shadows.
    if (s > 0.045) {
      // ⚠ Highlight guard, and it is not optional.
      //
      // Multiplying lightness blows up near white: a pixel at l=0.92 lifted 12%
      // clamps to 1.0, and a smooth out-of-focus gradient turns into flat white
      // blobs with hard edges. It showed up in the burger shots as posterised
      // patches in the window bokeh behind the plate — the foliage is bright
      // green, which is exactly what the green band targets.
      //
      // So every adjustment fades out as the pixel approaches white. Lettuce and
      // coleslaw sit in the midtones and still get the full move; the blown
      // window keeps its gradient.
      const guard = 1 - Math.pow(l, 3);

      for (const k of keys) {
        const t = r.hsl[k];
        const w = band(h, t.lo, t.hi) * guard;
        if (w > 0) {
          h += t.hue * w;
          s *= 1 + (t.sat - 1) * w;
          // Additive against the remaining headroom rather than multiplicative,
          // so this can approach white but never slam into it.
          l += (t.lum - 1) * l * (1 - l) * 2 * w;
        }
      }
      s *= 1 + r.vibrance * (1 - s) * guard; // vibrance: most on the dullest pixels
    }

    [rr, gg, bb] = hslToRgb(h, Math.min(1, s), Math.min(1, l));
    out[i] = Math.max(0, Math.min(255, rr));
    out[i + 1] = Math.max(0, Math.min(255, gg));
    out[i + 2] = Math.max(0, Math.min(255, bb));
  }

  // Raw in, raw out at every hop — sharp cannot infer an output format for a
  // raw input, and letting it guess is the "unsupported image format" error.
  const meta = { width: info.width, height: info.height, channels: 3 };
  const wide = await sharp(out, { raw: meta }).sharpen(r.clarity).raw().toBuffer();
  const tight = await sharp(wide, { raw: meta }).sharpen(r.texture).raw().toBuffer();

  mkdirSync(OUT, { recursive: true });
  const to = join(OUT, shot.src.replace(/\.[^.]+$/, '.jpg'));
  const written = await sharp(tight, { raw: meta }).jpeg({ quality: 95 }).toFile(to);
  return { to, size: written.size, w: info.width, h: info.height };
}

for (const shot of SHOTS) {
  if (ONLY && shot.src !== ONLY) continue;
  const { size, w, h } = await grade(shot);
  console.log(
    `  ${shot.src.padEnd(22)} ${shot.recipe.padEnd(7)} ${w}x${h}  ${(size / 1024).toFixed(0)} KB`,
  );
}
console.log(`\nwritten to ${relative(ROOT, OUT) || OUT}`);
