import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAmount,
  formatPrice,
  splitVatInclusive,
  addVat,
  pointsForOrder,
  VAT_RATE,
} from './money.ts';
import { MENU, allItems } from './menu.ts';

test('formatAmount', () => {
  assert.equal(formatAmount(2700), '27');
  assert.equal(formatAmount(2750), '27.50');
  assert.equal(formatAmount(200), '2');
  assert.equal(formatAmount(0), '0');
  assert.equal(formatAmount(305), '3.05');
  assert.equal(formatAmount(2700, { alwaysDecimals: true }), '27.00');
});

test('formatPrice localises currency placement', () => {
  assert.equal(formatPrice(2700, 'en'), 'SAR 27');
  assert.equal(formatPrice(2700, 'ar'), '27 ر.س');
  assert.equal(formatPrice(4800, 'en'), 'SAR 48');
});

test('VAT-inclusive split reconciles exactly', () => {
  // A 27.00 SAR burger already contains its VAT.
  const r = splitVatInclusive(2700);
  assert.equal(r.gross, 2700);
  assert.equal(r.net + r.vat, 2700, 'net + vat must equal gross exactly');
  assert.equal(r.vat, 352); // 27.00 - 27.00/1.15 = 3.5217 -> 3.52
  assert.equal(r.net, 2348);
});

test('VAT split never drifts, for every price on the menu', () => {
  for (const item of allItems()) {
    const r = splitVatInclusive(item.price);
    assert.equal(r.net + r.vat, item.price, `drift on ${item.nameEn}`);
    assert.ok(r.vat >= 0 && r.net >= 0);
  }
});

test('VAT split reconciles across a whole basket', () => {
  // Big-Stackd + fries + soft drink = 48 + 9 + 8 = 65 SAR
  const gross = 4800 + 900 + 800;
  const r = splitVatInclusive(gross);
  assert.equal(r.gross, 6500);
  assert.equal(r.net + r.vat, 6500);
  assert.equal(r.vat, 848); // 65 - 65/1.15 = 8.478 -> 8.48
});

test('addVat is the inverse direction', () => {
  const r = addVat(1000);
  assert.equal(r.vat, 150);
  assert.equal(r.gross, 1150);
  assert.equal(VAT_RATE, 0.15);
});

test('points are earned on the net, not the VAT', () => {
  // 65 SAR gross -> 56.52 net -> 56 points, not 65.
  assert.equal(pointsForOrder(6500), 56);
  // A single classic burger: 27 gross -> 23.48 net -> 23 points
  assert.equal(pointsForOrder(2700), 23);
  // Double-point promo
  assert.equal(pointsForOrder(2700, 2), 46);
});

test('points never go negative or fractional', () => {
  for (const item of allItems()) {
    const p = pointsForOrder(item.price);
    assert.ok(Number.isInteger(p), `${item.nameEn} produced ${p}`);
    assert.ok(p >= 0);
  }
});

test('menu data integrity', () => {
  const slugs = allItems().map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'item slugs must be unique');

  for (const cat of MENU) {
    assert.ok(cat.items.length > 0, `${cat.slug} is empty`);
    for (const item of cat.items) {
      assert.ok(item.price > 0, `${item.slug} has no price`);
      assert.ok(Number.isInteger(item.price), `${item.slug} price is not integer halalas`);
      assert.ok(item.nameAr.length > 0, `${item.slug} missing Arabic name`);
      assert.ok(item.nameEn.length > 0, `${item.slug} missing English name`);
    }
  }
});

test('known-bad calorie data is null, not fabricated', () => {
  const drinks = MENU.find((c) => c.slug === 'drinks')!;
  const soft = drinks.items.find((i) => i.slug === 'soft-drink')!;
  const kenza = drinks.items.find((i) => i.slug === 'kenza')!;
  const water = drinks.items.find((i) => i.slug === 'water')!;

  assert.equal(soft.calories, null, 'printed value duplicates the sauces column');
  assert.equal(kenza.calories, null);
  assert.equal(water.calories, 0, 'water is 0 kcal, not the printed 75');
});
