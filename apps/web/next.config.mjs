/**
 * Static export — the build produces a plain `out/` directory of HTML/CSS/JS
 * that gets uploaded to Hostinger's `public_html`. No Node runtime on the host.
 *
 * Consequences to remember:
 *  - No middleware, no API routes, no server components that read a request.
 *  - `next/image` optimisation is off (it needs a server), so images must be
 *    correctly sized before they ship.
 *  - Locale routing is done with a `[locale]` segment plus generateStaticParams,
 *    not Next's i18n config, which requires a server.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Hostinger serves directory indexes, so /ar/menu/ -> /ar/menu/index.html
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@stackd/shared'],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
