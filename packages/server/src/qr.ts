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
 * The customer-facing portal's public address.
 *
 * Every customer-facing URL is built from this: the bill QR, the counter signup
 * QR, and the Login link on the website. It is printed on paper and on posters,
 * so it must be the FINAL public address before anything goes to a printer —
 * `http://localhost:3002` is only right while everything is local.
 */
export function portalBase(): string {
  return (process.env.STACKD_PORTAL_URL ?? 'http://localhost:3002').replace(/\/$/, '');
}

/** Where a scanned bill QR sends the customer. */
export function claimUrl(token: string): string {
  return `${portalBase()}/claim/${token}`;
}

/** Where the printed counter QR sends someone who wants to join. */
export function registrationUrl(): string {
  return `${portalBase()}/registration`;
}

export async function qrSvg(target: string): Promise<string> {
  return QRCode.toString(target, {
    type: 'svg',
    margin: 1,
    // High correction: a receipt gets folded, smudged and left in a pocket.
    errorCorrectionLevel: 'H',
    color: { dark: '#1b1c19', light: '#ffffff' },
  });
}
