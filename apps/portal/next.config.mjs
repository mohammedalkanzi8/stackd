/**
 * The customer loyalty portal — the only app here that faces the public
 * internet AND runs a server.
 *
 * apps/web is the static site and cannot do this: registration, sign-in and a
 * points balance all need a database. apps/admin is staff-only and internal.
 * This is deliberately a third app rather than a route group inside admin,
 * because one misconfigured route in a shared app puts customers on the staff
 * pages — a boundary worth paying for.
 *
 * ⚠ It is also the app that holds customer personal data on the public
 * internet, which is precisely what the PDPL hosting question in STATUS.md
 * gates. Local only until that is answered.
 *
 * Port 3002: 3000 is the website, 3001 is admin.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@stackd/shared', '@stackd/server'],
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ['pg'],
};

export default nextConfig;
