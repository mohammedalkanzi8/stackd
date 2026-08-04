#!/usr/bin/env node
/**
 * Regenerates the MENU constant in packages/shared/src/menu.ts from the database.
 *
 *   npm run sync:menu
 *
 * The database is the single source of truth for the menu. This closes the loop
 * menu.ts has been asking for since it was written ("should be GENERATED at
 * build time... hand-maintained only until then") — and the two had already
 * drifted: the Arabic names resolved from STACKD's launch posters on 3 Aug 2026
 * landed in menu.ts and never made it back into seed.sql.
 *
 * Only the region between the GENERATED markers is rewritten. Everything else in
 * that file — the MenuItem types, BRANCH, BRAND, priceRange(), allItems() — is
 * hand-written and stays untouched. Regenerating the whole file would mean
 * modelling a phone number and an Instagram handle in Postgres to get them back.
 *
 * Item photo caveats live in menu_items.photo_note and are re-emitted as
 * comments, so the provenance notes in STATUS.md § 4 survive each run rather
 * than being flattened away.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { connectionFor, DB_NAME } from './db-reset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'packages/shared/src/menu.ts');

const BEGIN = '// <generated:menu> — npm run sync:menu. Do not edit by hand.';
const END = '// </generated:menu>';

/** Single-quoted JS string literal. Arabic passes through as-is. */
function q(s) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** Wraps prose into `// ` comment lines at the given indent. */
function comment(text, indent) {
  const width = 78 - indent.length;
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => `${indent}// ${l}`).join('\n');
}

function renderItem(item) {
  const i = '      ';
  const fields = [
    `slug: ${q(item.slug)}`,
    `nameEn: ${q(item.name_en)}`,
    `nameAr: ${q(item.name_ar)}`,
  ];
  if (item.description_en) fields.push(`descEn: ${q(item.description_en)}`);
  if (item.description_ar) fields.push(`descAr: ${q(item.description_ar)}`);
  fields.push(`price: ${item.price}`);
  fields.push(`calories: ${item.calories === null ? 'null' : item.calories}`);
  if (item.spicy) fields.push('spicy: true');
  if (item.arabic_needs_review) fields.push('arabicNeedsReview: true');

  // Short entries stay on one line, the way the sauces and drinks always have.
  const oneLine = `${i}{ ${fields.join(', ')}${item.image_url ? `, image: ${q(item.image_url)}` : ''} },`;
  if (!item.photo_note && oneLine.length <= 110) return oneLine;

  const body = fields.map((f) => `${i}  ${f},`);
  if (item.image_url) {
    if (item.photo_note) body.push(comment(item.photo_note, `${i}  `));
    body.push(`${i}  image: ${q(item.image_url)},`);
  }
  return [`${i}{`, ...body, `${i}},`].join('\n');
}

function renderCategory(cat) {
  return [
    '  {',
    `    slug: ${q(cat.slug)},`,
    `    showPhotos: ${cat.show_photos},`,
    `    nameEn: ${q(cat.name_en)},`,
    `    nameAr: ${q(cat.name_ar)},`,
    '    items: [',
    ...cat.items.map(renderItem),
    '    ],',
    '  },',
  ].join('\n');
}

export function render(categories) {
  return [
    BEGIN,
    'export const MENU: MenuCategory[] = [',
    ...categories.map(renderCategory),
    '];',
    END,
  ].join('\n');
}

async function fetchMenu(db) {
  const { rows: categories } = await db.query(`
    select id, slug, name_en, name_ar, show_photos
    from categories where is_active order by sort_order, slug
  `);
  const { rows: items } = await db.query(`
    select category_id, slug, name_en, name_ar, description_en, description_ar,
           price, calories, spicy, arabic_needs_review, image_url, photo_note
    from menu_items where is_active order by sort_order, slug
  `);
  return categories.map((c) => ({
    ...c,
    items: items.filter((i) => i.category_id === c.id),
  }));
}

/** Strips positional noise so two MENU snapshots compare on content alone. */
function normalise(menu) {
  return JSON.stringify(
    menu.map((c) => ({
      slug: c.slug,
      showPhotos: c.showPhotos,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      items: c.items.map((i) => ({
        slug: i.slug,
        nameEn: i.nameEn,
        nameAr: i.nameAr,
        descEn: i.descEn ?? null,
        descAr: i.descAr ?? null,
        price: i.price,
        calories: i.calories ?? null,
        spicy: i.spicy ?? false,
        image: i.image ?? null,
      })),
    })),
  );
}

async function loadMenu() {
  // Cache-bust so the post-write import re-reads from disk.
  const mod = await import(`${TARGET}?t=${Date.now()}`);
  return mod.MENU;
}

async function run() {
  const db = new pg.Client(connectionFor(DB_NAME));
  await db.connect();

  let before;
  try {
    before = normalise(await loadMenu());
  } catch {
    before = null; // First run, or the file is mid-edit. Not fatal.
  }

  const categories = await fetchMenu(db);
  await db.end();

  const source = await readFile(TARGET, 'utf8');
  const start = source.indexOf(BEGIN);
  const stop = source.indexOf(END);
  if (start === -1 || stop === -1) {
    throw new Error(
      `${path.relative(ROOT, TARGET)} has no generated region.\n` +
        `  Expected a block delimited by:\n    ${BEGIN}\n    ${END}`,
    );
  }

  const next = source.slice(0, start) + render(categories) + source.slice(stop + END.length);
  await writeFile(TARGET, next);

  const items = categories.reduce((n, c) => n + c.items.length, 0);
  console.log(
    `menu.ts regenerated — ${categories.length} categories, ${items} items`,
  );

  if (before !== null) {
    const after = normalise(await loadMenu());
    if (before === after) {
      console.log('no semantic change: the database and the website agree');
    } else {
      // The point of the first run. A difference here means the schema was still
      // missing something the website renders, or that the two had drifted.
      console.log('⚠ menu content CHANGED. Review the diff before committing:');
      console.log('    git diff packages/shared/src/menu.ts');
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(`\nsync:menu failed\n  ${err.message}`);
    process.exit(1);
  });
}
