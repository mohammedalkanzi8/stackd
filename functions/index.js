/**
 * Cloudflare Pages Function for the bare `/` route.
 *
 * Every page lives under a locale segment (`/ar/…`, `/en/…`) and a static export
 * has no middleware, so the domain root has nothing to serve. This picks a
 * locale from the visitor's Accept-Language header and redirects.
 *
 * `public/_redirects` carries a plain `/ -> /ar/` rule as a fallback. Functions
 * run before _redirects, so this wins when deployed and the static rule catches
 * the root if Functions are ever misconfigured. The root is never broken.
 *
 * Arabic is the default: the restaurant is in Khobar and Arabic is the primary
 * language of its customers. English is served only when the browser actually
 * asks for it ahead of Arabic.
 */

const SUPPORTED = ['ar', 'en'];
const FALLBACK = 'ar';

/**
 * Picks the best supported locale from an Accept-Language header.
 *
 * Handles quality values ("ar;q=0.9"), region subtags ("en-GB" -> "en"), the
 * wildcard "*", and malformed input. Exported separately so it can be tested
 * without a Workers runtime.
 *
 * @param {string | null} header
 * @returns {'ar' | 'en'}
 */
export function pickLocale(header) {
  if (!header || typeof header !== 'string') return FALLBACK;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const parsed = qParam ? Number.parseFloat(qParam.split('=')[1]) : 1;
      return {
        tag: (tag || '').trim().toLowerCase(),
        q: Number.isFinite(parsed) ? parsed : 0,
      };
    })
    // q=0 means "explicitly not acceptable".
    .filter((entry) => entry.tag !== '' && entry.q > 0)
    // Array#sort is stable, so equal-q entries keep header order.
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag === '*') return FALLBACK;
    const base = tag.split('-')[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return FALLBACK;
}

export function onRequest(context) {
  const locale = pickLocale(context.request.headers.get('Accept-Language'));
  const target = new URL(`/${locale}/`, context.request.url);

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      // Without Vary, a cache could serve an Arabic visitor the redirect it
      // stored for an English one.
      Vary: 'Accept-Language',
      'Cache-Control': 'no-store',
    },
  });
}
