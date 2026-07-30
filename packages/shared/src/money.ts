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

/** Loyalty points for an order. Earned on the pre-VAT net, floor-rounded. */
export function pointsForOrder(grossHalalas: number, pointsPerRiyal = 1): number {
  const { net } = splitVatInclusive(grossHalalas);
  return Math.floor((net / 100) * pointsPerRiyal);
}
