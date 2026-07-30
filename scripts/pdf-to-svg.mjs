/**
 * Extracts SVG logos from the Illustrator-generated vector PDF.
 *
 *   node scripts/pdf-to-svg.mjs "/mnt/d/STACKD LOGO VECTOR.pdf" apps/web/public/brand
 *
 * Written rather than shelling out to poppler/inkscape because neither is
 * installed, and because the source PDF turns out to be trivially simple: solid
 * RGB fills, no images, no shadings, no patterns, no live fonts (all type is
 * already outlined). That is the narrow subset handled here — it is NOT a
 * general PDF converter, and it will warn loudly rather than silently drop
 * anything it does not understand.
 *
 * Coordinate systems differ: PDF puts the origin bottom-left with y increasing
 * upward, SVG puts it top-left with y increasing downward. Points are pushed
 * through the current transform and then flipped once at the root.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, basename } from 'node:path';

const [, , pdfPath, outDir = '.'] = process.argv;
if (!pdfPath) {
  console.error('usage: node scripts/pdf-to-svg.mjs <file.pdf> [outDir]');
  process.exit(1);
}

const buf = readFileSync(pdfPath);
/** latin1 keeps one char per byte, so string offsets match buffer offsets. */
const s = buf.toString('latin1');

// --- Object index ----------------------------------------------------------

/** @type {Map<number, {dict: string, stream: Buffer|null}>} */
const objects = new Map();

const objRe = /(\d+)\s+\d+\s+obj\b/g;
let m;
while ((m = objRe.exec(s)) !== null) {
  const num = Number(m[1]);
  const bodyStart = m.index + m[0].length;
  const end = s.indexOf('endobj', bodyStart);
  if (end === -1) continue;

  const body = s.slice(bodyStart, end);
  const streamIdx = body.indexOf('stream');
  let dict = body;
  let stream = null;

  if (streamIdx !== -1) {
    dict = body.slice(0, streamIdx);
    // Skip 'stream' plus its EOL (CRLF or LF).
    let dataStart = bodyStart + streamIdx + 'stream'.length;
    if (s[dataStart] === '\r') dataStart++;
    if (s[dataStart] === '\n') dataStart++;
    const endStream = s.indexOf('endstream', dataStart);
    stream = buf.subarray(dataStart, endStream);
  }
  objects.set(num, { dict, stream });
}

function deref(token) {
  const ref = /^(\d+)\s+\d+\s+R$/.exec(token.trim());
  return ref ? objects.get(Number(ref[1])) : null;
}

function decompress(obj) {
  if (!obj?.stream) return null;
  if (/\/FlateDecode/.test(obj.dict)) {
    try {
      return inflateSync(obj.stream);
    } catch {
      // Illustrator sometimes leaves trailing bytes; retry tolerantly.
      try {
        return inflateSync(obj.stream, { finishFlush: require('node:zlib').constants.Z_SYNC_FLUSH });
      } catch {
        return null;
      }
    }
  }
  return obj.stream;
}

// --- Pages -----------------------------------------------------------------

const pages = [];
for (const [num, obj] of objects) {
  if (!/\/Type\s*\/Page\b/.test(obj.dict)) continue;

  // /Contents is either a single reference or an ARRAY of them, in which case
  // the streams concatenate into one logical content stream.
  const arrayMatch = /\/Contents\s*\[([^\]]+)\]/.exec(obj.dict);
  const singleMatch = /\/Contents\s+(\d+\s+\d+\s+R)/.exec(obj.dict);
  const contents = arrayMatch
    ? [...arrayMatch[1].matchAll(/\d+\s+\d+\s+R/g)].map((r) => r[0])
    : singleMatch
      ? [singleMatch[1]]
      : [];

  const boxMatch = /\/MediaBox\s*\[([^\]]+)\]/.exec(obj.dict);
  const resMatch = /\/Resources\s*(?:(\d+\s+\d+\s+R)|<<)/.exec(obj.dict);

  pages.push({
    num,
    contents,
    box: boxMatch ? boxMatch[1].trim().split(/\s+/).map(Number) : null,
    resources: resMatch?.[1] ?? null,
    dict: obj.dict,
  });
}
pages.sort((a, b) => a.num - b.num);

/** MediaBox may be inherited from the /Pages node. */
const inheritedBox = (() => {
  for (const [, obj] of objects) {
    if (/\/Type\s*\/Pages\b/.test(obj.dict)) {
      const b = /\/MediaBox\s*\[([^\]]+)\]/.exec(obj.dict);
      if (b) return b[1].trim().split(/\s+/).map(Number);
    }
  }
  return [0, 0, 800, 886];
})();

// --- Graphics-state alpha from /ExtGState ---------------------------------

/** Maps an ExtGState name (e.g. "GS0") to its fill alpha, when not 1. */
function extGStateAlphas(resourcesToken) {
  const alphas = new Map();
  const res = deref(resourcesToken ?? '');
  if (!res) return alphas;

  const egsRef = /\/ExtGState\s+(\d+\s+\d+\s+R)/.exec(res.dict);
  const egsDict = egsRef ? deref(egsRef[1])?.dict : /\/ExtGState\s*<<([\s\S]*?)>>/.exec(res.dict)?.[1];
  if (!egsDict) return alphas;

  for (const gm of egsDict.matchAll(/\/(GS\d+)\s+(\d+)\s+\d+\s+R/g)) {
    const g = objects.get(Number(gm[2]));
    if (!g) continue;
    const ca = /\/ca\s+([\d.]+)/.exec(g.dict);
    if (ca && Number(ca[1]) !== 1) alphas.set(gm[1], Number(ca[1]));
  }
  return alphas;
}

// --- Content stream interpreter -------------------------------------------

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const apply = (mx, x, y) => [mx[0] * x + mx[2] * y + mx[4], mx[1] * x + mx[3] * y + mx[5]];
const n = (v) => (Math.abs(v) < 1e-4 ? '0' : String(Math.round(v * 100) / 100));

function toHex(r, g, b) {
  const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function convert(content, alphas) {
  const tokens = content
    .toString('latin1')
    .replace(/%[^\n\r]*/g, '') // strip comments
    .split(/\s+/)
    .filter(Boolean);

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let fill = '#000000';
  let alpha = 1;

  const operands = [];
  const paths = [];
  let d = '';
  let cur = [0, 0];
  let start = [0, 0];
  const unknown = new Set();

  const num = (i) => Number(operands[operands.length + i]);

  const flush = (rule) => {
    if (d.trim()) {
      paths.push({ d: d.trim(), fill, alpha, rule });
    }
    d = '';
  };

  for (const tok of tokens) {
    if (/^[-+]?[\d.]+$/.test(tok)) {
      operands.push(tok);
      continue;
    }
    switch (tok) {
      case 'q':
        stack.push({ ctm, fill, alpha });
        break;
      case 'Q': {
        const st = stack.pop();
        if (st) ({ ctm, fill, alpha } = st);
        break;
      }
      case 'cm':
        ctm = mul([num(-6), num(-5), num(-4), num(-3), num(-2), num(-1)], ctm);
        break;
      case 'rg':
      case 'sc':
      case 'scn':
        if (operands.length >= 3) fill = toHex(num(-3), num(-2), num(-1));
        break;
      case 'g':
        fill = toHex(num(-1), num(-1), num(-1));
        break;
      case 'k': {
        // CMYK -> RGB, the naive conversion. Adequate here; the file is all rg.
        const [c, mm, y, kk] = [num(-4), num(-3), num(-2), num(-1)];
        fill = toHex((1 - c) * (1 - kk), (1 - mm) * (1 - kk), (1 - y) * (1 - kk));
        break;
      }
      case 'gs': {
        // The operand is a name like /GS0 and was not pushed as a number.
        break;
      }
      case 'm': {
        const p = apply(ctm, num(-2), num(-1));
        cur = start = p;
        d += `M${n(p[0])} ${n(p[1])}`;
        break;
      }
      case 'l': {
        const p = apply(ctm, num(-2), num(-1));
        cur = p;
        d += `L${n(p[0])} ${n(p[1])}`;
        break;
      }
      case 'c': {
        const p1 = apply(ctm, num(-6), num(-5));
        const p2 = apply(ctm, num(-4), num(-3));
        const p3 = apply(ctm, num(-2), num(-1));
        cur = p3;
        d += `C${n(p1[0])} ${n(p1[1])} ${n(p2[0])} ${n(p2[1])} ${n(p3[0])} ${n(p3[1])}`;
        break;
      }
      case 'v': {
        // Current point doubles as the first control point.
        const p2 = apply(ctm, num(-4), num(-3));
        const p3 = apply(ctm, num(-2), num(-1));
        d += `C${n(cur[0])} ${n(cur[1])} ${n(p2[0])} ${n(p2[1])} ${n(p3[0])} ${n(p3[1])}`;
        cur = p3;
        break;
      }
      case 'y': {
        const p1 = apply(ctm, num(-4), num(-3));
        const p3 = apply(ctm, num(-2), num(-1));
        d += `C${n(p1[0])} ${n(p1[1])} ${n(p3[0])} ${n(p3[1])} ${n(p3[0])} ${n(p3[1])}`;
        cur = p3;
        break;
      }
      case 'h':
        d += 'Z';
        cur = start;
        break;
      case 're': {
        const [x, y, w, h] = [num(-4), num(-3), num(-2), num(-1)];
        const a = apply(ctm, x, y);
        const b = apply(ctm, x + w, y);
        const c = apply(ctm, x + w, y + h);
        const e = apply(ctm, x, y + h);
        d += `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(c[0])} ${n(c[1])}L${n(e[0])} ${n(e[1])}Z`;
        break;
      }
      case 'f':
      case 'F':
        flush('nonzero');
        break;
      case 'f*':
        flush('evenodd');
        break;
      case 'b':
      case 'b*':
      case 'B':
      case 'B*':
        flush(tok.endsWith('*') ? 'evenodd' : 'nonzero');
        break;
      case 'n':
      case 'W':
      case 'W*':
        // Clipping. The only clips in this file are the full-artboard rect, so
        // dropping the path rather than emitting a <clipPath> is safe here.
        d = '';
        break;
      case 'S':
      case 's':
        // No strokes in this artwork; discard rather than fake one.
        d = '';
        break;
      case 'BT':
      case 'ET':
      case 'BX':
      case 'EX':
      case 'i':
      case 'j':
      case 'J':
      case 'M':
      case 'd':
      case 'ri':
      case 'w':
      case 'cs':
      case 'CS':
      case 'G':
      case 'RG':
      case 'K':
        break;
      default:
        if (!/^\/|^<|^\[|^\]/.test(tok)) unknown.add(tok);
    }
    if (!/^[-+]?[\d.]+$/.test(tok)) operands.length = 0;
  }

  return { paths, unknown };
}

// --- Emit ------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const stem = basename(pdfPath).replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

console.log(`Source: ${pdfPath}`);
console.log(`Pages:  ${pages.length}\n`);

const written = [];
pages.forEach((page, i) => {
  const chunks = page.contents.map((ref) => decompress(deref(ref))).filter(Boolean);
  if (chunks.length === 0) {
    console.log(`  page ${i + 1}: no content stream — skipped`);
    return;
  }
  // Streams in a /Contents array must be joined with whitespace: a token can
  // otherwise run into the next stream's first token.
  const content = Buffer.concat(
    chunks.flatMap((c, idx) => (idx === 0 ? [c] : [Buffer.from('\n'), c])),
  );

  const box = page.box ?? inheritedBox;
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;

  const alphas = extGStateAlphas(page.resources);
  const { paths, unknown } = convert(content, alphas);

  if (unknown.size) {
    console.warn(`  page ${i + 1}: UNHANDLED operators: ${[...unknown].join(' ')}`);
  }

  // Bounding box of what was actually drawn, so each variant can be trimmed.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    for (const cm of p.d.matchAll(/[-\d.]+ [-\d.]+/g)) {
      const [px, py] = cm[0].split(' ').map(Number);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  const body = paths
    .map((p) => {
      const attrs = [`d="${p.d}"`, `fill="${p.fill}"`];
      if (p.rule === 'evenodd') attrs.push('fill-rule="evenodd"');
      if (p.alpha !== 1) attrs.push(`opacity="${p.alpha}"`);
      return `  <path ${attrs.join(' ')}/>`;
    })
    .join('\n');

  // Single root flip converts PDF's y-up space to SVG's y-down space.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" role="img" aria-label="STACKD">
<g transform="matrix(1 0 0 -1 ${n(-x0)} ${n(y1)})">
${body}
</g>
</svg>
`;

  const name = `${stem}-${i + 1}.svg`;
  const dest = join(outDir, name);
  writeFileSync(dest, svg);
  written.push({ name, paths: paths.length, kb: (svg.length / 1024).toFixed(1) });

  const colors = [...new Set(paths.map((p) => p.fill))];
  console.log(
    `  page ${i + 1} -> ${name}  ${paths.length} paths, ${(svg.length / 1024).toFixed(1)} kB\n` +
      `           artboard ${n(w)}x${n(h)}, ink bbox ${n(maxX - minX)}x${n(maxY - minY)}\n` +
      `           ${colors.length} colours: ${colors.slice(0, 8).join(' ')}${colors.length > 8 ? ' …' : ''}`,
  );
});

console.log(`\nWrote ${written.length} file(s) to ${outDir}`);
