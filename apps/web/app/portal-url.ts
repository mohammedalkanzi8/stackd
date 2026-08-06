/**
 * Where the customer loyalty portal lives.
 *
 * It is a separate app on its own host, so every reference from this site is an
 * ordinary outbound link rather than a route. The site is a static export and
 * cannot hold an account.
 *
 * Compiled in at BUILD time, not read at runtime. A production build without
 * `NEXT_PUBLIC_PORTAL_URL` set ships a live site whose links point at localhost,
 * which is why the fallback is the real domain rather than a dev address: wrong
 * but plausible beats broken only on the developer's machine.
 */
export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://my.stackd.com.sa';
