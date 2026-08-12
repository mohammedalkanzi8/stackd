/**
 * Guards the Arabic dictionary.
 *
 * These are cheap structural checks, not a translation review. They exist
 * because the failure mode of a bilingual UI is silent: a key added in English
 * and forgotten in Arabic looks completely fine to whoever added it, and is only
 * noticed by the person who cannot read the screen.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('./i18n.ts', import.meta.url)), 'utf8');

/** Pull the keys out of one `const NAME: Dict = { ... }` block. */
function keysOf(name) {
  const start = SRC.indexOf(`const ${name}: Dict = {`);
  assert.notEqual(start, -1, `${name} block not found — did the file get restructured?`);
  const end = SRC.indexOf('\n};', start);
  const body = SRC.slice(start, end);
  return new Set([...body.matchAll(/^\s{2}'([^']+)':/gm)].map((m) => m[1]));
}

const ar = keysOf('AR');
const en = keysOf('EN');

test('every Arabic key exists in English', () => {
  // The other direction is allowed — English is the fallback, so a missing
  // Arabic string degrades readably. An Arabic key with no English counterpart
  // is a typo that can never be reached.
  const orphans = [...ar].filter((k) => !en.has(k));
  assert.deepEqual(orphans, [], `Arabic keys with no English original: ${orphans.join(', ')}`);
});

test('every screen is fully translated', () => {
  // Started life scoped to the shift screens while the rest lagged. It covers
  // the whole portal now, which is the point: the English fallback means a
  // missing string is invisible to whoever added it, so the only thing that
  // keeps Arabic complete is this failing.
  const missing = [...en].filter((k) => !ar.has(k));
  assert.deepEqual(missing, [], `untranslated: ${missing.join(', ')}`);
});

test('no Arabic string is left as English', () => {
  // A copy-paste that never got translated reads as done. Latin letters in an
  // Arabic value are the signal — except where the value IS meant to be Latin,
  // which is only the language switch naming the other language.
  const allowed = new Set(['nav.languageSwitch', 'nav.language']);
  const start = SRC.indexOf('const AR: Dict = {');
  const body = SRC.slice(start, SRC.indexOf('\n};', start));
  const bad = [];
  for (const m of body.matchAll(/^\s{2}'([^']+)':\s*\n?\s*'([^']*)'/gm)) {
    const [, key, value] = m;
    if (allowed.has(key)) continue;
    // Latin letters are fine inside an Arabic sentence (USB, QR); a value that
    // is ONLY Latin is the untranslated one.
    if (value && !/[؀-ۿ]/.test(value)) bad.push(key);
  }
  assert.deepEqual(bad, [], `Arabic values with no Arabic characters: ${bad.join(', ')}`);
});

test('Arabic carries no Western-to-Arabic numeral drift', () => {
  // ⚠ This portal shows codes, prices and invoice numbers that staff read aloud
  // and compare against a printed receipt and the POS. Arabic-Indic digits in a
  // label here would put two numeral systems on the same figure across those
  // surfaces. The print studio is the deliberate exception and is not this file.
  const start = SRC.indexOf('const AR: Dict = {');
  const body = SRC.slice(start, SRC.indexOf('\n};', start));
  const withIndic = [...body.matchAll(/^\s{2}'([^']+)':\s*\n?\s*'([^']*[٠-٩][^']*)'/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(withIndic, [], `Arabic-Indic numerals in: ${withIndic.join(', ')}`);
});

test('Arabic noun phrases stay bound with non-breaking spaces', () => {
  // ⚠ These broke across lines on the live scan page and made the paragraph
  // read as damaged rather than merely wrapped. Widening the measure only moves
  // a break; a non-breaking space is the only thing that pins it.
  //
  // A plain space between any of these pairs means somebody retyped the string
  // and lost the binding, which is invisible until an Arabic screen is narrow
  // enough to wrap there.
  const BOUND = [
    ['قارئ', 'الباركود'],
    ['لوحة', 'المفاتيح'],
    ['بطاقة', 'العضو'],
    ['رمز', 'الاستبدال'],
    ['صفحة', 'النقاط'],
  ];
  const start = SRC.indexOf('const AR: Dict = {');
  const body = SRC.slice(start, SRC.indexOf('\n};', start));
  const broken = BOUND.filter(([a, b]) => body.includes(`${a} ${b}`)).map((p) => p.join(' '));
  assert.deepEqual(broken, [], `these lost their non-breaking space: ${broken.join(', ')}`);
});
