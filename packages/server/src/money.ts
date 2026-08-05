/**
 * Money helpers for the portal.
 *
 * Formatting comes from @stackd/shared so the portal, the website and the app
 * all render a price the same way. Parsing is here because only the portal takes
 * money as INPUT — a text field where someone types "27.50" and the database
 * must receive 2750.
 */

import { formatAmount } from '@stackd/shared';

export { formatAmount };

/** "27.50" or "27" -> 2750. Rejects anything that is not plain riyals. */
export function parseRiyals(input: string): number {
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`"${input}" is not an amount — use digits like 27 or 27.50`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  // String maths, not Number(x) * 100: 27.55 * 100 is 2754.9999999999995 in a
  // double, and a price that rounds down by a halala is a price that is wrong.
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** For populating a form field from a stored integer. */
export function toRiyalInput(halalas: number): string {
  return formatAmount(halalas, { alwaysDecimals: true });
}

export function formatSar(halalas: number): string {
  return `SAR ${formatAmount(halalas)}`;
}
