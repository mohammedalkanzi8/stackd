/**
 * Signed-cookie sessions, one factory used by both portals.
 *
 * The payload is a subject id and an expiry, HMAC-signed. It is a bearer token,
 * not an encrypted secret — whoever holds the cookie is that subject until it
 * expires — so it is httpOnly, sameSite strict and short-lived. Nothing about
 * the subject beyond its id is carried: roles, names and whether the account is
 * still active are re-read from the database on every request, so revoking
 * someone takes effect immediately rather than whenever their cookie lapses.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SessionCookieOptions {
  /** Cookie name. Must differ per app, or one portal's session overwrites the other's. */
  cookieName: string;
  /** Env var holding the signing key, e.g. STACKD_ADMIN_SECRET. */
  secretEnv: string;
  maxAgeSeconds: number;
}

/**
 * Minimal shape of Next's cookie jar. Typed structurally so this package does
 * not have to depend on next — it is called with `await cookies()`.
 */
export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: Record<string, unknown>): void;
  delete(name: string): void;
}

export function createSessions(options: SessionCookieOptions) {
  const { cookieName, secretEnv, maxAgeSeconds } = options;

  // The dev fallback lives on globalThis, NOT in a module-scoped variable.
  //
  // `next dev` compiles each route separately and gives the new bundle its own
  // module registry, so a module-scoped fallback produces a different random key
  // per route. The symptom is vicious: you sign in, two or three pages work, and
  // then the nav signs you out — because that page was compiled later against
  // another key. Setting the env var hides it entirely, which is exactly how it
  // survives testing.
  const globalKey = `stackdSecret_${secretEnv}`;
  const store = globalThis as unknown as Record<string, string | undefined>;

  // ...and globalThis only reaches as far as one process. `next dev` runs a
  // launcher plus a child `next-server`, restarts that child on a crash, and is
  // itself restarted constantly during development — every one of which minted a
  // fresh random key and silently invalidated every session cookie on every
  // device. What that looks like from a phone is "I reload the page and it logs
  // me out", with nothing wrong on screen to explain it.
  //
  // So in development the key is written next to the app and read back. Same key
  // across restarts, across the launcher and the server, and across the two
  // portals' separate processes. Gitignored, and never consulted in production:
  // there the env var is mandatory and its absence still throws.
  const devKeyFile = join(process.cwd(), '.stackd-dev-secret');

  function devSecret(): string {
    if (store[globalKey]) return store[globalKey]!;

    let keys: Record<string, string> = {};
    try {
      keys = JSON.parse(readFileSync(devKeyFile, 'utf8')) as Record<string, string>;
    } catch {
      // No file yet, or something unreadable in it. Either way it is about to be
      // rewritten — a corrupt dev key file should cost one re-login, not a crash.
    }

    if (!keys[secretEnv]) {
      keys[secretEnv] = randomBytes(32).toString('hex');
      try {
        writeFileSync(devKeyFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
      } catch {
        // Read-only checkout, or a container with no write access. Fall through
        // to the in-memory key: sessions still work, they just do not survive a
        // restart, which is exactly the old behaviour.
      }
    }

    return (store[globalKey] = keys[secretEnv]);
  }

  function secret(): string {
    const fromEnv = process.env[secretEnv];
    if (fromEnv) return fromEnv;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${secretEnv} must be set in production — sessions cannot be signed without it`);
    }
    return devSecret();
  }

  function sign(value: string): string {
    return createHmac('sha256', secret()).update(value).digest('base64url');
  }

  function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  return {
    start(jar: CookieJar, subjectId: string): void {
      const expires = Date.now() + maxAgeSeconds * 1000;
      const payload = `${subjectId}.${expires}`;
      jar.set(cookieName, `${payload}.${sign(payload)}`, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: maxAgeSeconds,
      });
    },

    end(jar: CookieJar): void {
      jar.delete(cookieName);
    },

    /** The signed-in subject's id, or null. Verifies signature and expiry only. */
    subject(jar: CookieJar): string | null {
      const raw = jar.get(cookieName)?.value;
      if (!raw) return null;

      const [id, expires, signature] = raw.split('.');
      if (!id || !expires || !signature) return null;
      if (!safeEqual(signature, sign(`${id}.${expires}`))) return null;
      if (Number(expires) < Date.now()) return null;
      return id;
    },
  };
}
