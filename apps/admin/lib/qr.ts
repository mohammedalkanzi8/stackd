/**
 * QR codes for bill claims.
 *
 * Rendered to inline SVG on the server. A data-URI PNG would be simpler but
 * prints badly: the QR on a receipt is scanned off thermal paper at whatever
 * size the printer feels like, and a vector survives that where a 200px raster
 * does not.
 */

import QRCode from 'qrcode';

/**
 * Where a scanned bill QR sends the customer.
 *
 * Defaults to the portal itself, which is right while everything is local. Once
 * the claim page lives on the real site, set STACKD_CLAIM_BASE_URL — the QR is
 * printed on paper and cannot be corrected afterwards, so this must be the final
 * public address before a single receipt goes out.
 */
export function claimUrl(token: string): string {
  const base = process.env.STACKD_CLAIM_BASE_URL ?? 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}/claim/${token}`;
}

export async function claimQrSvg(token: string): Promise<string> {
  return QRCode.toString(claimUrl(token), {
    type: 'svg',
    margin: 1,
    // High correction: a receipt gets folded, smudged and left in a pocket.
    errorCorrectionLevel: 'H',
    color: { dark: '#1b1c19', light: '#ffffff' },
  });
}
