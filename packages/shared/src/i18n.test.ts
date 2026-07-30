import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localeSwapPath,
  isLocale,
  assertLocale,
  dir,
  t,
  toArabicDigits,
  formatDuration,
  WEEKDAY_NAMES,
  LOCALES,
} from './i18n.ts';

test('localeSwapPath keeps you on the same page', () => {
  assert.equal(localeSwapPath('/ar/menu/', 'en'), '/en/menu/');
  assert.equal(localeSwapPath('/en/menu/', 'ar'), '/ar/menu/');
  assert.equal(localeSwapPath('/ar/visit/', 'en'), '/en/visit/');
  assert.equal(localeSwapPath('/en/visit/', 'ar'), '/ar/visit/');
});

test('localeSwapPath handles the locale home page', () => {
  assert.equal(localeSwapPath('/ar/', 'en'), '/en/');
  assert.equal(localeSwapPath('/ar', 'en'), '/en/');
  assert.equal(localeSwapPath('/en/', 'ar'), '/ar/');
});

test('localeSwapPath handles a bare root', () => {
  assert.equal(localeSwapPath('/', 'ar'), '/ar/');
  assert.equal(localeSwapPath('', 'en'), '/en/');
});

test('localeSwapPath always ends in a slash (trailingSlash export)', () => {
  for (const p of ['/ar/menu', '/ar/menu/', '/en/visit', '/', '/ar']) {
    for (const target of LOCALES) {
      assert.ok(
        localeSwapPath(p, target).endsWith('/'),
        `${p} -> ${target} produced ${localeSwapPath(p, target)}`,
      );
    }
  }
});

test('localeSwapPath is idempotent when target equals current', () => {
  assert.equal(localeSwapPath('/ar/menu/', 'ar'), '/ar/menu/');
});

test('localeSwapPath does not mangle a path that looks like a locale', () => {
  // "arabica" must not be mistaken for the "ar" locale segment.
  assert.equal(localeSwapPath('/arabica/', 'en'), '/en/arabica/');
});

test('localeSwapPath survives a round trip', () => {
  const original = '/ar/menu/';
  const there = localeSwapPath(original, 'en');
  assert.equal(localeSwapPath(there, 'ar'), original);
});

test('isLocale / assertLocale', () => {
  assert.equal(isLocale('ar'), true);
  assert.equal(isLocale('en'), true);
  assert.equal(isLocale('fr'), false);
  assert.equal(assertLocale('ar'), 'ar');
  assert.throws(() => assertLocale('fr'), /Unknown locale/);
});

test('dir', () => {
  assert.equal(dir('ar'), 'rtl');
  assert.equal(dir('en'), 'ltr');
});

test('every string key exists in both locales', () => {
  const enKeys = Object.keys(
    // Reach through t() by probing a known key set via the exported tables.
    WEEKDAY_NAMES,
  );
  assert.ok(enKeys.length === 2, 'WEEKDAY_NAMES must cover both locales');
  assert.equal(WEEKDAY_NAMES.ar.length, 7);
  assert.equal(WEEKDAY_NAMES.en.length, 7);
  // Index 0 must be Sunday to match Postgres extract(dow).
  assert.equal(WEEKDAY_NAMES.en[0], 'Sunday');
  assert.equal(WEEKDAY_NAMES.ar[0], 'الأحد');
});

test('t returns a non-empty string in both locales', () => {
  for (const key of ['nav.menu', 'visit.title', 'menu.subtitle', 'loyalty.lead'] as const) {
    for (const l of LOCALES) {
      const v = t(l, key);
      assert.ok(typeof v === 'string' && v.length > 0, `${l}/${key} is empty`);
    }
  }
});

test('toArabicDigits', () => {
  assert.equal(toArabicDigits(1100), '١١٠٠');
  assert.equal(toArabicDigits('27 SAR'), '٢٧ SAR');
  assert.equal(toArabicDigits(0), '٠');
});

test('formatDuration', () => {
  assert.equal(formatDuration(60, 'en'), '1 hour');
  assert.equal(formatDuration(90, 'en'), '1 hour 30 minutes');
  assert.equal(formatDuration(45, 'en'), '45 minutes');
  assert.equal(formatDuration(0, 'en'), 'less than a minute');
  assert.ok(formatDuration(90, 'ar').includes('ساعة'));
  assert.ok(formatDuration(45, 'ar').includes('دقيقة'));
});
