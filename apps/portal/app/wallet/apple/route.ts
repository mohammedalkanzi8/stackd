/**
 * Serves the signed .pkpass for the signed-in member.
 *
 * A route rather than a static file because the pass is per-member and signed on
 * demand. It is behind the session deliberately: the pass carries a member code,
 * and anyone holding one can earn points against that account at the till.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { appleWalletConfig, buildPkpass } from '@stackd/server';

import { currentMember } from '@/lib/session.ts';

/**
 * Apple requires icon.png at minimum; icon@2x and logo make it look right on a
 * modern screen. These come from the website's public folder, which the
 * container already mounts for the admin portal's menu photos.
 */
const IMAGE_DIR = path.resolve(process.cwd(), '../web/public');

const IMAGES: Record<string, string> = {
  'icon.png': 'favicon-32.png',
  'icon@2x.png': 'icon-192.png',
  'logo.png': 'icon-192.png',
  'logo@2x.png': 'icon-192.png',
};

export async function GET() {
  const member = await currentMember();
  if (!member) {
    return new Response('Sign in first.', { status: 401 });
  }

  // Cheapest check first. Reading artwork before knowing whether Apple Wallet is
  // even configured turns "not set up" into a 500 about missing files.
  if (appleWalletConfig({}) === null) {
    return new Response('Apple Wallet is not configured.', { status: 404 });
  }

  let images: Record<string, Buffer>;
  try {
    images = Object.fromEntries(
      await Promise.all(
        Object.entries(IMAGES).map(async ([name, file]) => [
          name,
          await readFile(path.join(IMAGE_DIR, file)),
        ]),
      ),
    );
  } catch {
    // Missing artwork produces a pass iOS silently refuses, which is far worse
    // to diagnose than an honest refusal here.
    return new Response('Pass artwork is missing on the server.', { status: 500 });
  }

  const cfg = appleWalletConfig(images)!;
  const pkpass = buildPkpass(cfg, {
    memberCode: member.memberCode,
    fullName: member.fullName,
    balance: member.balance,
  });

  return new Response(new Uint8Array(pkpass), {
    headers: {
      // This exact type is what makes iOS offer to add it to Wallet rather than
      // downloading a file nobody can open.
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="stackd-${member.memberCode}.pkpass"`,
      'Cache-Control': 'no-store',
    },
  });
}
