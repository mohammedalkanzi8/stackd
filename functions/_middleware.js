/**
 * Canonical-host middleware.
 *
 * Both `stackd.com.sa` and `www.stackd.com.sa` are attached to the Pages
 * project, so without this the same pages answer on two hostnames — split
 * search ranking and two sets of cache entries for one site. The apex wins
 * because that is what the printed menu and the Instagram bio point at.
 *
 * This lives in the repo rather than as a Cloudflare Redirect Rule so it is
 * versioned and testable alongside the locale redirect. Root middleware runs
 * ahead of static assets, so it catches every path, not just `/`.
 */

/**
 * Returns the URL a request should be redirected to, or null to serve it as-is.
 *
 * Splitting this out from the handler keeps it testable without a Workers
 * runtime. Only a leading `www.` is rewritten: `pages.dev` preview URLs and the
 * apex itself pass straight through.
 *
 * @param {string} requestUrl
 * @returns {string | null}
 */
export function canonicalUrl(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (!url.hostname.toLowerCase().startsWith('www.')) return null;

  url.hostname = url.hostname.slice(4);
  return url.toString();
}

export function onRequest(context) {
  const target = canonicalUrl(context.request.url);
  if (target === null) return context.next();

  // 301: the apex is permanent, and search engines should collapse the two
  // hostnames into one rather than re-checking on every crawl.
  return new Response(null, {
    status: 301,
    headers: {
      Location: target,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
