/**
 * Turns raw photography into the web-ready menu images.
 *
 *   node scripts/shoot-to-web.mjs [--src new_shots] [--out apps/web/public/menu]
 *
 * Run it again whenever new shots arrive. It is deterministic: same sources in,
 * same files out, so re-running never drifts.
 *
 * ---------------------------------------------------------------------------
 * Why this exists rather than hand-cropping in an editor
 * ---------------------------------------------------------------------------
 * The shots arrive from three different worlds and the site has one ground:
 *
 *   plated  — burgers and the Giants bowls, shot on wood against a warm dark
 *             restaurant bokeh. These already sit on the site's near-black.
 *   tray    — the camera shoot: steel tray on pale marble. Neutral and cool.
 *   studio  — packshots on white or pale blue. Left alone these cut a glaring
 *             bright rectangle into a near-black page, and the Sides row ends
 *             up looking like three stickers on a dark wall.
 *
 * So `studio` shots get seated rather than pasted: highlights rolled off a pure
 * 255 white to a warm paper tone, white balance nudged toward the brand's amber,
 * and a soft vignette so the tile's edges fall into the card instead of ending
 * at a hard bright border. The grade is subtle on purpose — it is lighting, not
 * a filter. Nothing is added to or removed from any dish.
 *
 * Every image lands at exactly 1200x900. That is the 4:3 the cards are built
 * for, and it matches the intrinsic width/height CardMedia declares, so the
 * browser reserves the right box before the photo loads and the grid never
 * shifts.
 */

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
// resolve, not join: a relative path is read against the repo root, but an
// absolute one has to be left alone — join would bolt it onto ROOT and quietly
// write into the repo.
const SRC = resolve(ROOT, flag('src', 'new_shots'));
const OUT = resolve(ROOT, flag('out', 'apps/web/public/menu'));

/** The card aspect. Changing this means changing `.card-media` too. */
const W = 1200;
const H = 900;

// --- Grades ----------------------------------------------------------------
//
// `recomb` is a 3x3 channel mix — the diagonal scales R, G and B, so a warm
// balance is R slightly up and B slightly down. It moves neutrals, which is the
// point: it is the whites we are trying to shift, not the food.
//
// `linear(a, b)` is out = a*in + b across the range. a < 1 with a positive b
// pulls 255 down and lifts 0, which is exactly the highlight rolloff a bright
// packshot needs to stop glaring.

const GRADES = {
  /** Wood, bokeh, warm shadows. Already at home on the site — barely touched. */
  plated: (img) => img.modulate({ saturation: 1.04 }).linear(1.02, -2),

  /** Steel tray on pale marble. Neutral; warmed a little toward the others. */
  tray: (img) =>
    img.modulate({ saturation: 1.05 }).recomb([
      [1.03, 0, 0],
      [0, 1.0, 0],
      [0, 0, 0.97],
    ]),

  /**
   * White or pale-blue packshot. The heaviest hand here, and still light:
   * highlights to ~#F2ECE4 rather than paper white, balance warmed, and the
   * vignette added afterwards by `seat()`.
   */
  studio: (img) =>
    img
      .modulate({ saturation: 1.06 })
      .linear(0.88, 8)
      .recomb([
        [1.06, 0, 0],
        [0, 1.0, 0],
        [0, 0, 0.92],
      ]),

  /**
   * Fire-Attack, and only ever through the `heat` mask below — never as a whole
   * frame's grade.
   *
   * Same bowl as Scoopy-Doo because it IS the same bowl: the owner confirmed the
   * two Giants are one dish with a different sauce. So the difference has to
   * come out of the food itself. Graded across the whole photograph it turned
   * the restaurant behind the bowl orange too, which read as a filter over a
   * mild dish rather than a hot one; masked to the bowl, the sauce and chicken
   * go red and the room stays exactly as shot.
   *
   * Nothing is added to the food. This is the sauce this dish is actually made
   * with, lit to show it.
   */
  hot: (img) =>
    img
      .modulate({ saturation: 1.38 })
      .linear(1.09, -10)
      .recomb([
        [1.2, 0.04, 0],
        [0, 0.8, 0],
        [0, 0, 0.66],
      ]),
};

/**
 * Applies `hot` to an elliptical region and leaves the rest of the frame alone.
 * The ellipse is soft-edged from `core` outwards, so the heat falls off into the
 * bowl's rim instead of stopping at a traceable line.
 */
async function heatMask(buf, { cx, cy, rx, ry, core = '35%' }) {
  const mask = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="m">
          <stop offset="${core}" stop-color="#fff" stop-opacity="1"/>
          <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#m)"/>
    </svg>`,
  );
  const hot = await GRADES.hot(sharp(buf))
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(buf).composite([{ input: hot, blend: 'over' }]).toBuffer();
}

/**
 * Lifts a subject off a near-white studio background and drops it into another
 * frame, with a synthesised contact shadow so it sits on the surface rather than
 * hovering over it.
 *
 * Only safe against a blown-white studio sweep: the key is "every channel is
 * bright AND the pixel is near-neutral", which a white backdrop satisfies and
 * food essentially never does. The subject's own shadow is keyed away with the
 * background and replaced, because the original shadow points the wrong way for
 * the frame it is landing in.
 */
async function keyOffWhite(file, crop) {
  const src = sharp(join(SRC, file)).extract(crop);
  const { data, info } = await src.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;

  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    const spread = Math.max(r, g, b) - min;
    alpha[p] = min > 222 && spread < 20 ? 0 : 255;
  }

  // A hard key leaves a stair-stepped edge. One pixel of blur on the alpha is
  // the difference between "cut out" and "photographed".
  // `toColourspace('b-w')` matters: without it sharp hands back three channels
  // and joinChannel silently misaligns into diagonal stripes.
  const feathered = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(1.6)
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  return sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .joinChannel(feathered, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
}

/** Places a keyed subject into a 1200x900 frame. Returns the new frame. */
async function inset(buf, spec) {
  const cut = await keyOffWhite(spec.from, spec.crop);
  const { width: cw, height: ch } = await sharp(cut).trim({ threshold: 1 }).metadata();
  const pw = spec.width;
  const ph = Math.round((pw * ch) / cw);
  const px = spec.x;
  const py = H - ph - spec.bottom;

  const shadow = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="s">
          <stop offset="22%" stop-color="#565b62" stop-opacity="${spec.shadow}"/>
          <stop offset="100%" stop-color="#565b62" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${px + pw / 2}" cy="${py + ph - 16}"
               rx="${pw * 0.6}" ry="${ph * 0.16}" fill="url(#s)"/>
    </svg>`,
  );

  return sharp(buf)
    .composite([
      { input: shadow },
      { input: await sharp(cut).trim({ threshold: 1 }).resize(pw, ph).png().toBuffer(), left: px, top: py },
    ])
    .toBuffer();
}

/**
 * Soft corner falloff, composited after the resize so its geometry is always
 * 1200x900 regardless of what the source was. Only used on `studio` shots —
 * on a dark plated photo it would be invisible at best and muddy at worst.
 */
function vignette(strength) {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="46%" r="78%">
        <stop offset="45%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#0b0b0d" stop-opacity="${strength}"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
  </svg>`;
  return Buffer.from(svg);
}

// --- Re-plating: putting a packshot on the menu's own table ------------------
//
// The fries and the coleslaw were shot on a pale blue sweep and on grey
// concrete. Every other card is a warm dark restaurant. Grading alone cannot
// close that gap — a bright studio ground stays a bright studio ground — so the
// subject is lifted off its backdrop and set down on a plate built from the
// menu's own photography.
//
// The plate is real: two full-width bands out of the Scoopy-Doo frame, from
// regions the bowl does not occupy. The bokeh band is stretched 1.4x vertically
// and the table band more, which survives because both are already far out of
// focus and the grain runs horizontally.

let PLATE = null;

async function plate() {
  if (PLATE) return PLATE;
  const from = join(SRC, 'SCOOPY-DOO.jpg');

  // Horizon at 660, not 480. The table band is only ~108px of real pixels, so
  // the higher the horizon the more it has to be stretched — at 4.7x the grain
  // stops reading as wood and starts reading as woven rope. 2.2x holds.
  const bokeh = await sharp(from)
    .extract({ left: 0, top: 0, width: 1280, height: 380 })
    .resize(W, 680, { fit: 'fill' })
    .toBuffer();

  // x stops at 800: past that the coleslaw and pickle pots come into frame.
  const table = await sharp(from)
    .extract({ left: 0, top: 1050, width: 800, height: 108 })
    .resize(W, 240, { fit: 'fill' })
    .toBuffer();

  // Feathered join, so the table edge is a soft focal transition rather than a
  // ruled line across the card.
  const fade = Buffer.from(
    `<svg width="${W}" height="240" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="22%" stop-color="#fff" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="${W}" height="240" fill="url(#f)"/>
    </svg>`,
  );
  const tableFaded = await sharp(table)
    .ensureAlpha()
    .composite([{ input: fade, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Onto a full 1200x900 canvas, not onto the bokeh band: the table lands at
  // y=480 and runs to 900, which is past the end of a 520-tall base, and sharp
  // refuses to composite anything larger than what it is compositing onto.
  PLATE = await sharp({
    create: { width: W, height: H, channels: 3, background: '#140d07' },
  })
    .composite([
      { input: bokeh, left: 0, top: 0 },
      { input: tableFaded, left: 0, top: 660 },
    ])
    // .png() is not optional. A `create` input has no format to infer, so a bare
    // toBuffer() hands back raw RGBA — which the next sharp() call cannot parse,
    // and reports as "unsupported image format" from somewhere else entirely.
    .png()
    .toBuffer();
  return PLATE;
}

/**
 * Alpha for a subject, by whichever rule its backdrop allows.
 *
 *   blue    — the fries sweep. Colour separates cleanly: the backdrop is
 *             blue-dominant and the counter is neutral-bright, while every part
 *             of the subject is warm.
 *   ellipse — the coleslaw. NOTHING separates it by colour: the concrete reads
 *             194,194,194 and the tub rim 206,203,198, the same neutral at the
 *             same brightness. But the tub is a circle, so its own shape is the
 *             mask. The contact shadow is lost with the backdrop and replaced.
 */
async function subjectAlpha(buf, w, h, key) {
  if (key.type === 'ellipse') {
    return sharp(
      Buffer.from(
        `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <defs><radialGradient id="m">
            <stop offset="94%" stop-color="#fff" stop-opacity="1"/>
            <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
          </radialGradient></defs>
          <ellipse cx="${key.cx}" cy="${key.cy}" rx="${key.rx}" ry="${key.ry}" fill="url(#m)"/>
        </svg>`,
      ),
    )
      .toColourspace('b-w')
      .raw()
      .toBuffer();
  }

  // `buf` is already raw RGB from the caller — handing it back to sharp as if it
  // were an encoded image is the "unsupported image format" error.
  //
  // FLOOD FILL FROM THE EDGES, not a global threshold. The backdrop is one
  // connected region touching the frame border; the white in the STACKD logo on
  // the scoop is not. A global "is this pale?" test cannot tell them apart and
  // punches holes straight through the wordmark. Reachability can.
  // "Not warm" is the whole test, and with a flood fill that is enough. The sweep
  // is blue, the counter is neutral, and the shadow the scoop casts on the
  // counter is a darker neutral — all cool or colourless. Every part of the
  // subject is warm: kraft board, fried potato, the rooster's red.
  //
  // A tighter test misclassified the shadowed counter beside the base as
  // subject, and since it touches the packaging the largest-component filter
  // then kept it — it shipped as a grey tab poking out of the scoop. Being
  // permissive is safe here precisely BECAUSE the fill only reaches what
  // connects to the frame border: the white inside the STACKD wordmark is
  // enclosed by dark outline and never gets visited.
  const bg = (i) => buf[i] <= buf[i + 2] + 14;

  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }

  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !bg(p * 3)) continue;
    seen[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  // KEEP ONLY THE LARGEST OPAQUE COMPONENT. A dark contact shadow at the base of
  // the scoop blocks the fill, marooning a slab of counter behind it that is
  // never reached from the border — it shipped as a grey tab poking out of the
  // packaging. The subject is one connected object, so anything not joined to
  // the biggest blob is backdrop the fill could not get to.
  const label = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || label[start] !== -1) continue;
    const id = start;
    let size = 0;
    const q = [start];
    label[start] = id;
    while (q.length) {
      const p = q.pop();
      size++;
      const x = p % w, y = (p / w) | 0;
      const push = (n) => { if (!seen[n] && label[n] === -1) { label[n] = id; q.push(n); } };
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }

  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = label[p] === best ? 255 : 0;

  return sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(1.4)
    .toColourspace('b-w')
    .raw()
    .toBuffer();
}

/** Lifts a subject off its own backdrop and stands it on the plate. */
async function replate(spec) {
  const src = sharp(join(SRC, spec.from)).extract(spec.crop);
  const { data, info } = await src.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  const alpha = await subjectAlpha(data, w, h, spec.key);
  const cut = await sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();

  const trimmed = await sharp(cut).trim({ threshold: 1 }).png().toBuffer();
  const tm = await sharp(trimmed).metadata();
  const sw = spec.width;
  const sh = Math.round((sw * tm.height) / tm.width);
  const sx = Math.round((W - sw) / 2);
  const sy = H - sh - spec.bottom;

  // Studio light is flat and cool; the plate is warm and dim. Without this the
  // subject reads as a sticker on a photograph.
  const matched = await sharp(trimmed)
    .resize(sw, sh)
    // Gentle. At [1.06, …, 0.9] the warm shift dragged the rooster's red toward
    // brown, and the logo is the one thing on the packaging that must not move.
    .modulate({ brightness: 0.95, saturation: 1.02 })
    .recomb([
      [1.025, 0, 0],
      [0, 1.0, 0],
      [0, 0, 0.965],
    ])
    .png()
    .toBuffer();

  const shadow = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="s">
        <stop offset="10%" stop-color="#0d0703" stop-opacity="${spec.shadow}"/>
        <stop offset="100%" stop-color="#120b06" stop-opacity="0"/>
      </radialGradient></defs>
      <ellipse cx="${sx + sw / 2}" cy="${sy + sh + 4}" rx="${sw * 0.62}" ry="${sh * 0.075}"
               fill="url(#s)"/>
    </svg>`,
  );

  return sharp(await plate())
    .composite([{ input: shadow }, { input: matched, left: sx, top: sy }])
    .toBuffer();
}

// --- What to build ---------------------------------------------------------
//
// `crop` is in SOURCE pixels and is applied before the resize. Where it is
// omitted the source is already 4:3 and the whole frame is used. These numbers
// were chosen by eye against each frame; they are not a formula, and if a
// source file is ever replaced its crop needs looking at again.

const SHOTS = [
  {
    src: 'CLASSIC-STACKD.jpg',
    slug: 'classic-stackd',
    grade: 'plated',
    note: 'Full frame — the source is already 4:3.',
  },
  { src: 'MAPLE-STACKD.jpg', slug: 'maple-stackd', grade: 'plated' },
  { src: 'BIG-STACKD.jpg', slug: 'big-stackd', grade: 'plated' },
  {
    src: 'DSC07611.jpg',
    slug: 'tortilla-strips',
    grade: 'tray',
    // Portrait 1991x2877 down to 4:3 throws away half the frame, so the window
    // is placed to hold both subjects on a diagonal: the cut face with its
    // chicken top-left, the fries bottom-right. Higher and the fries vanish;
    // lower and the cut face — the reason to photograph this dish at all —
    // goes with it.
    crop: { left: 0, top: 560, width: 1991, height: 1493 },
  },
  {
    src: 'SCOOPY-DOO.jpg',
    slug: 'scoopy-doo',
    grade: 'plated',
    // Wide: the bowl plus the coleslaw and pickle pots beside it, which is how
    // it is actually served.
    crop: { left: 0, top: 120, width: 1280, height: 960 },
  },
  {
    src: 'SCOOPY-DOO.jpg',
    slug: 'fire-attack',
    grade: 'plated',
    // The SAME frame as Scoopy-Doo above, uncropped, at the owner's request on
    // 12 Aug 2026. A tighter crop was tried first to keep the two Giants cards
    // from looking alike; the owner wants the difference carried entirely by
    // the sauce, which is exactly what separates the two dishes on the menu.
    crop: { left: 0, top: 120, width: 1280, height: 960 },
    // The bowl's contents in this wider frame: the food fills x 0.19–0.72 and
    // y 0.34–0.63. Well clear of the coleslaw pot at the right, which has red
    // cabbage in it and must not be reddened any further.
    heat: { cx: 548, cy: 440, rx: 340, ry: 160 },
  },
  {
    // Owner-supplied 12 Aug 2026, replacing the branded scoop that had been
    // lifted onto the menu's table. ⚠ 479x640 SOURCE — the smallest file on the
    // site by a distance, upscaled ~2.5x to reach the card. It will read softer
    // than every photo beside it. ⚠ Not STACKD packaging or plating either.
    src: 'FRIES-2.png',
    slug: 'fries',
    grade: 'studio',
    seat: 0.26,
    crop: { left: 0, top: 140, width: 479, height: 359 },
  },
  {
    // Owner-supplied 12 Aug 2026. Fills the frame with slaw, so unlike the tub
    // it replaces there is no background to key or re-plate — the dish IS the
    // frame, which is why it sits alongside the darker cards without fighting
    // them.
    src: 'COLESLAW-2.png',
    slug: 'coleslaw',
    grade: 'studio',
    seat: 0.22,
    crop: { left: 60, top: 0, width: 1067, height: 800 },
  },
  {
    // Cheese fries, supplied by the owner on 12 Aug 2026. Replaces the composite
    // that stood the cheese pot beside the fries scoop — this is one dish in one
    // frame, which the composite never was.
    //
    // ⚠ NOT STACKD'S OWN PHOTOGRAPHY. No branded packaging, a metal tray and a
    // marble surface, none of which match the rest of the shoot or the way the
    // side is actually served. If it came from a stock or recipe site its
    // licence needs checking before this goes live.
    //
    // It also keeps its own bright ground while Fries and Coleslaw have been
    // moved onto the dark table, so it is now the odd card in the Sides row.
    src: 'CHEESE-FRIES.png',
    slug: 'cheesy-cheese',
    grade: 'studio',
    seat: 0.26,
    // Portrait 1200x1804, cropped tight on the tray so the marble and the props
    // around it take up as little of the card as possible.
    crop: { left: 0, top: 250, width: 1200, height: 900 },
  },
];

// --- Build -----------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

let failed = 0;

for (const shot of SHOTS) {
  // Prefer a retouched original when one exists.
  //
  // `node scripts/retouch.mjs` writes graded copies under `new_shots/graded/`
  // with the same filename. When one is there it supersedes the raw frame AND
  // this script's own grade — the retouch recipe already did the colour, and
  // running a second grade on top of it double-warms the frame. Delete the file
  // in `graded/` to go back to the original; nothing else needs changing.
  const gradedSrc = join(SRC, 'graded', shot.src.replace(/\.[^.]+$/, '.jpg'));
  const isGraded = existsSync(gradedSrc);
  const from = isGraded ? gradedSrc : join(SRC, shot.src);
  const to = join(OUT, `${shot.slug}.webp`);

  try {
    // Crop and resize first, so every step after this works in 1200x900 frame
    // coordinates rather than whatever the source happened to be.
    //
    // A re-plated shot skips all of that: replate() composes its own finished
    // 1200x900 frame out of the plate and the keyed subject.
    let buf;
    if (shot.replate) {
      buf = await replate(shot.replate);
    } else {
      let frame = sharp(from);
      if (shot.crop) frame = frame.extract(shot.crop);
      buf = await frame.resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();
    }

    // Before the grade, so the pasted-in subject and the frame it lands in are
    // graded together as one photograph.
    if (shot.inset) buf = await inset(buf, shot.inset);

    if (!isGraded) buf = await GRADES[shot.grade](sharp(buf)).toBuffer();

    if (shot.heat) buf = await heatMask(buf, shot.heat);

    let img = sharp(buf);
    if (shot.seat) {
      img = img.composite([{ input: vignette(shot.seat), blend: 'over' }]);
    }

    const info = await img.webp({ quality: 82, effort: 6 }).toFile(to);
    const kb = (info.size / 1024).toFixed(0);
    // Over ~300 KB and the card is slower than the page around it. Worth
    // knowing about rather than silently shipping.
    const heavy = info.size > 300 * 1024 ? '  ⚠ over 300 KB' : '';
    const extra = [shot.inset && 'inset', shot.heat && 'heat'].filter(Boolean).join('+');
    const how = shot.replate ? 'replated' : isGraded ? 'retouched' : shot.grade;
    console.log(
      `  ${shot.slug.padEnd(16)} ${(how + (extra ? `+${extra}` : '')).padEnd(13)} ${kb.padStart(4)} KB${heavy}`,
    );
  } catch (err) {
    failed++;
    console.error(`  ${shot.slug.padEnd(16)} FAILED  ${err.message}`);
  }
}

console.log(
  failed
    ? `\n${SHOTS.length - failed}/${SHOTS.length} written, ${failed} failed.`
    : `\n${SHOTS.length} images written to ${relative(ROOT, OUT) || OUT}`,
);
process.exit(failed ? 1 : 0);
