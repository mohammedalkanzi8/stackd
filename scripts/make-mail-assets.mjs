#!/usr/bin/env node
/**
 * Rasterises the STACKD Rewards mark into the PNG that outbound email carries.
 *
 * Run with:  npm run sync:mail-assets
 *
 * ⚠ WHY A PNG WHEN THE MARK IS ALREADY A PERFECTLY GOOD SVG. Email is not the
 * web. Gmail strips <svg> outright, Outlook's Word renderer has never supported
 * it, and neither shows a fallback — the customer just gets a gap where the
 * brand should be. PNG is the only raster format every client of the last
 * fifteen years agrees on.
 *
 * ⚠ AND WHY IT IS EMBEDDED AS BASE64 IN A .ts FILE RATHER THAN READ FROM DISK.
 * The portals are built as Next standalone bundles, which copy only the files
 * the tracer can see. A `readFile` on a path assembled at runtime is invisible
 * to it, so the image would exist in the repo, pass every local test, and then
 * be missing inside the container — the one place it is actually needed. A
 * string constant cannot be left behind by a bundler.
 *
 * The output is committed. This script exists so the next person can change the
 * mark and regenerate rather than hand-editing 4KB of base64.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { REWARDS_MARK_SVG } from '../packages/shared/src/rewards.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'packages/server/src/mail-assets.ts');

// Displayed at 120 CSS pixels, rendered at 240 so it stays crisp on a phone.
const SIZE = 240;

const png = await sharp(Buffer.from(REWARDS_MARK_SVG))
  .resize(SIZE, SIZE)
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();

// Wrapped so the generated file does not contain one 4,700-character line that
// no diff, editor or review can display.
const b64 = png.toString('base64');
const wrapped = (b64.match(/.{1,96}/g) ?? []).map((l) => `  '${l}' +`).join('\n');

const source = `/**
 * Images carried by outbound email. GENERATED — do not edit by hand.
 *
 * Regenerate with:  npm run sync:mail-assets
 * Source of truth:  REWARDS_MARK_SVG in packages/shared/src/rewards.ts
 *
 * ⚠ Base64 in a string constant rather than a file on disk, because the portals
 * ship as Next standalone bundles and the tracer only copies files it can see
 * referenced. A runtime readFile would pass every test locally and then be
 * missing inside the container. See scripts/make-mail-assets.mjs.
 */

/** The rewards mark: ${SIZE}x${SIZE} PNG, ${png.length} bytes, shown at 120px. */
export const REWARDS_MARK_PNG_BASE64 =
${wrapped.replace(/ \+$/, ';')}

/** Content-ID the HTML part references as \`cid:\`. Must match the attachment. */
export const REWARDS_MARK_CID = 'stackd-rewards-mark';
`;

await writeFile(TARGET, source);
console.log(
  `mail-assets.ts regenerated — ${SIZE}x${SIZE} PNG, ${png.length} bytes ` +
    `(${b64.length} base64 chars)`,
);
