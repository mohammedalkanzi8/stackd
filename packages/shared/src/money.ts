/**
 * Money and VAT. Everything internal is integer halalas — 100 halalas = 1 SAR.
 * Floats never touch a price.
 */

import type { Locale } from './menu.ts';

export const VAT_RATE = 0.15;

/** 2700 -> "27.00" (or "27" when whole, which every current menu price is). */
export function formatAmount(halalas: number, opts: { alwaysDecimals?: boolean } = {}): string {
  const whole = Math.trunc(halalas / 100);
  const frac = Math.abs(halalas % 100);
  if (frac === 0 && !opts.alwaysDecimals) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

/**
 * Price with currency, localised. Arabic uses ر.س after the number; English
 * uses SAR before it.
 *
 * Note: Saudi introduced a new riyal glyph in 2025. It is not yet reliably
 * present in system font stacks, so text is used until the brand font ships
 * with the glyph.
 */
export function formatPrice(halalas: number, locale: Locale): string {
  const n = formatAmount(halalas);
  return locale === 'ar' ? `${n} ر.س` : `SAR ${n}`;
}

/**
 * VAT split for a VAT-INCLUSIVE total, which is how KSA menu prices are quoted.
 * A 27.00 SAR burger already contains its VAT; it is not 27.00 + 15%.
 *
 * Rounds the VAT component and derives net from it, so net + vat always equals
 * gross exactly and receipts never show a one-halala discrepancy.
 */
export function splitVatInclusive(gross: number): { net: number; vat: number; gross: number } {
  const vat = Math.round(gross - gross / (1 + VAT_RATE));
  return { net: gross - vat, vat, gross };
}

/** VAT added on top of a net figure. For reference; menu prices are inclusive. */
export function addVat(net: number): { net: number; vat: number; gross: number } {
  const vat = Math.round(net * VAT_RATE);
  return { net, vat, gross: net + vat };
}

/**
 * The part of a bill that points are earned on.
 *
 * Menu prices are VAT-inclusive, so the gross IS the receipt total. Which of
 * the two figures the programme pays on is a setting —
 * `loyalty_settings.earn_excludes_vat` — not a constant, because the two are
 * defensible for different reasons:
 *
 *   including VAT (default)  the basis is the number printed on the receipt, so
 *                            a customer can reproduce the points themselves
 *   excluding VAT            the basis is the shop's own revenue, ~13% cheaper
 *                            to run, but not checkable at the counter
 *
 * ⚠ Uses splitVatInclusive rather than dividing inline, so the net a customer
 * earns on is the same net printed on their receipt, to the halala.
 */
export function earnBasis(
  grossHalalas: number,
  opts: { excludeVat?: boolean } = {},
): number {
  return opts.excludeVat ? splitVatInclusive(grossHalalas).net : grossHalalas;
}

/**
 * Loyalty points for an amount paid.
 *
 * ONE POINT IS ONE HALALA, so this is simply a percentage of the earn basis. At
 * 10% on the VAT-inclusive default, a 115.00 SAR bill earns 1150 points, worth
 * 11.50 SAR back; excluding VAT the same bill earns 1000.
 *
 * Mirrored by points_for_amount() in supabase/schema.sql. The two are asserted
 * equal for every menu price, on both bases, in supabase/schema.test.mjs —
 * change one and that test tells you about the other.
 *
 * ⚠ THE BASIS IS A THIRD ARGUMENT, NOT A SECOND. `pointsForAmount(x, true)`
 * type-errors rather than quietly reading `true` as a 1% earn rate.
 */
export function pointsForAmount(
  grossHalalas: number,
  earnPercent = 10,
  opts: { excludeVat?: boolean } = {},
): number {
  return Math.floor((earnBasis(grossHalalas, opts) * earnPercent) / 100);
}

/** What a points balance is worth off a bill. One point, one halala. */
export function pointsToHalalas(points: number): number {
  return points;
}
