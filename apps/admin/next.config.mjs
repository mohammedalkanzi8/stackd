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

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@stackd/shared'],
  typescript: { ignoreBuildErrors: false },
  // `pg` is a native-ish Node module; keep it out of the bundler's hands.
  serverExternalPackages: ['pg'],
};

export default nextConfig;
