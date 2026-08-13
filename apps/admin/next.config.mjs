/**
 * The admin portal, unlike the website, RUNS A SERVER.
 *
 * apps/web is `output: 'export'` — a folder of static files with no runtime, no
 * secrets, and no database. That is right for a menu and wrong for a portal, so
 * this app is deliberately the opposite: server components talk to Postgres
 * directly, and nothing about the connection reaches the browser.
 *
 * It listens on 3001 so it can run alongside `npm run dev` (3000) without the
 * two fighting over .next — see STATUS.md on what that corruption looks like.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ships a self-contained server with only the files actually reached, instead
  // of the whole workspace's node_modules. Without it a container image for this
  // monorepo carries three apps' dependencies to run one.
  output: 'standalone',
  // ⚠ CLOSES /_next/image, WHICH NOTHING HERE USES. A standalone server exposes
  // that endpoint unauthenticated whether or not next/image is imported, and it
  // decodes images through sharp — which shipped at 0.34.5 with four high-severity
  // libvips CVEs. No feature depends on it, so it is pure attack surface: an
  // unauthenticated decoder on a two-core box that also runs the till.
  images: { unoptimized: true },
  // File tracing has to start at the REPO root, or the traced bundle misses
  // @stackd/server and @stackd/shared, which live outside this app's folder.
  // The failure is at runtime, not build time: MODULE_NOT_FOUND on first request.
  outputFileTracingRoot: path.join(here, '../..'),
  transpilePackages: ['@stackd/shared', '@stackd/server'],
  typescript: { ignoreBuildErrors: false },
  // `pg` is a native-ish Node module; keep it out of the bundler's hands.
  serverExternalPackages: ['pg'],
};

export default nextConfig;
