import type { Format } from './formats.ts';

/**
 * The printed sheet's stylesheet, generated per format.
 *
 * Scoped entirely to this route and injected inline rather than living in the
 * admin's globals.css: it sets `@page`, and `@page` is a document-level rule.
 * A global one would resize every other print in the portal.
 *
 * Three things here are load-bearing and easy to lose in a tidy-up:
 *
 *  1. `print-color-adjust: exact`. Browsers strip background colours when
 *     printing by default, as an ink-saving courtesy. Without this the poster
 *     prints as black type on white paper — technically legible, and nothing
 *     like the design that was approved.
 *  2. `@page { margin: 0 }` plus a sheet sized to the exact trim. The default
 *     printer margin would shrink the artwork and leave a white frame around a
 *     full-bleed design.
 *  3. Everything inside the sheet is sized in `em` against a root of
 *     `width / 30`. That is what lets one layout serve a 105 mm card and an
 *     850 mm banner. Introducing a fixed px or mm value inside the sheet breaks
 *     three of the four sizes, and only on paper, where it is expensive.
 */
export function sheetCss(f: Format, scale: number): string {
  return `
/* ---- Page ------------------------------------------------------------- */
@page {
  size: ${f.w}mm ${f.h}mm;
  margin: 0;
}

/* ---- Screen preview ----------------------------------------------------
   The sheet is built at its true physical size, then scaled down to fit the
   admin window. Scaling the real artwork rather than making a separate small
   mockup means what is on screen IS what prints: there is no second layout to
   keep in sync, and no way for the preview to flatter the print. */
.sheet-frame {
  width: ${(f.w * MM * scale).toFixed(1)}px;
  height: ${(f.h * MM * scale).toFixed(1)}px;
  overflow: hidden;
  border-radius: 6px;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.45);
}
.sheet {
  transform: scale(${scale.toFixed(4)});
  transform-origin: top left;
}

/* ---- The sheet --------------------------------------------------------- */
.sheet {
  box-sizing: border-box;
  width: ${f.w}mm;
  height: ${f.h}mm;
  /* The whole type scale hangs off this one number. */
  font-size: ${(f.w / 30).toFixed(4)}mm;
  font-family: 'Cairo', 'Tajawal', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2.4em 1.8em ${f.footRoom > 0 ? `${f.footRoom}mm` : '2.4em'};
  background: #0e0f0d;
  background-image:
    radial-gradient(ellipse 90% 55% at 50% 8%, rgba(232, 57, 28, 0.42), transparent 70%),
    radial-gradient(ellipse 70% 40% at 50% 100%, rgba(184, 39, 18, 0.3), transparent 70%);
  color: #fefefe;
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

/* ---- Masthead ---------------------------------------------------------- */
.ph-logo {
  width: 7em;
  height: auto;
  display: block;
}
.ph-mark {
  width: 4.4em;
  height: auto;
  display: block;
  margin-block: 1.1em 0.7em;
}
.ph-name {
  font-family: 'Tajawal', sans-serif;
  font-weight: 800;
  font-size: 1.05em;
  letter-spacing: 0.18em;
  color: #eca70f;
  margin: 0;
}

/* ---- Headline ----------------------------------------------------------
   Arabic first and largest: the restaurant is in Khobar and Arabic is the
   default locale everywhere else in this system. English sits under it as the
   second voice, not as an equal-weight translation. */
.ph-ar {
  font-family: 'Tajawal', sans-serif;
  font-weight: 900;
  font-size: 2.55em;
  line-height: 1.12;
  margin: 0.5em 0 0;
  /* Arabic ascenders and descenders are long; the default tight leading clips
     them at these sizes. */
  padding-block: 0.06em;
}
.ph-pct {
  color: #eca70f;
}
.ph-en {
  font-family: 'Tajawal', sans-serif;
  font-weight: 700;
  font-size: 1.28em;
  line-height: 1.2;
  margin: 0.55em 0 0;
  color: rgb(254 254 254 / 0.92);
}

/* ---- The code ----------------------------------------------------------
   Always dark-on-white inside a white panel. An inverted or tinted QR looks
   better and scans worse, and some older readers refuse it outright. The white
   quiet zone around the code is part of the spec, not padding for looks. */
.ph-qr {
  box-sizing: border-box;
  width: 11em;
  padding: 0.55em;
  margin-block-start: 1.15em;
  background: #fff;
  border-radius: 0.55em;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.ph-qr svg {
  display: block;
  width: 100%;
  height: auto;
}
.ph-scan {
  font-family: 'Tajawal', sans-serif;
  font-weight: 800;
  font-size: 1.15em;
  margin: 0.7em 0 0;
}
.ph-scan-en {
  font-size: 0.82em;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(254 254 254 / 0.7);
  margin: 0.35em 0 0;
}

/* ---- Steps -------------------------------------------------------------- */
.ph-steps {
  display: flex;
  gap: 1.5em;
  margin: 1.5em 0 0;
  padding: 0;
  list-style: none;
  justify-content: center;
}
.ph-step {
  flex: 1 1 0;
  max-width: 8.5em;
}
.ph-step-n {
  display: grid;
  place-items: center;
  width: 1.9em;
  height: 1.9em;
  margin: 0 auto 0.45em;
  border-radius: 50%;
  background: #b82712;
  color: #fefefe;
  font-family: 'Tajawal', sans-serif;
  font-weight: 800;
  font-size: 0.95em;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.ph-step-t {
  font-size: 0.8em;
  font-weight: 600;
  line-height: 1.4;
}
.ph-step-t small {
  display: block;
  font-size: 0.82em;
  font-weight: 400;
  color: rgb(254 254 254 / 0.62);
  margin-block-start: 0.25em;
}

/* ---- Foot --------------------------------------------------------------- */
.ph-foot {
  margin-block-start: auto;
  padding-block-start: 1.4em;
  width: 100%;
}
.ph-rate {
  font-family: 'Tajawal', sans-serif;
  font-weight: 800;
  font-size: 1em;
  color: #eca70f;
  margin: 0;
}
.ph-rate span {
  color: rgb(254 254 254 / 0.75);
  font-weight: 600;
}
/* The address in text as well as in the code. Someone whose camera will not
   focus, or who is reading this from across the room, still has a way in. */
.ph-url {
  font-size: 0.78em;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgb(254 254 254 / 0.85);
  margin: 0.5em 0 0;
  direction: ltr;
}
.ph-fine {
  font-size: 0.44em;
  line-height: 1.6;
  color: rgb(254 254 254 / 0.42);
  margin: 0.9em auto 0;
  max-width: 46em;
}

/* ---- Print --------------------------------------------------------------
   The print route renders the sheet and nothing else, so there is no portal
   chrome to hide here — that is exactly why it is a separate route rather than
   a print stylesheet layered over the studio page. All this has to do is undo
   the screen-only preview scaling. */
@media print {
  .sheet-frame {
    width: auto;
    height: auto;
    overflow: visible;
    border-radius: 0;
    box-shadow: none;
  }
  .sheet {
    transform: none;
  }
  .no-print {
    display: none !important;
  }
}
`.trim();
}

/** CSS reference pixels per millimetre, at the 96 dpi the CSS spec fixes. */
const MM = 96 / 25.4;

/**
 * How far the true-size sheet is shrunk to fit on screen.
 *
 * Capped at 1 so the A6 card is previewed at its real size rather than blown up
 * — an upscaled preview makes small type look far more comfortable than it will
 * be in the hand.
 */
export function previewScale(f: Format): number {
  return Math.min(1, 560 / (f.w * MM), 720 / (f.h * MM));
}
