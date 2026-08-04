/**
 * Sessions: a signed cookie, no server-side store.
 *
 * The payload is the staff id and an expiry, HMAC-signed. It is a bearer token,
 * not an encrypted secret — anyone holding the cookie is that staff member until
 * it expires, so it is httpOnly, sameSite strict, and short-lived. Roles are
 * re-read from the database on every request rather than carried in the cookie,
 * so revoking someone by setting `is_active = false` takes effect immediately
 * instead of whenever their cookie happens to lapse.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { queryOne } from './db.ts';

const COOKIE = 'stackd_admin';
const MAX_AGE_SECONDS = 60 * 60 * 12; // one long shift

/**
 * Signing key, resolved on first use rather than at import.
 *
 * Lazily, because `next build` imports every module to collect page data — a
 * check at module scope fails the BUILD on a machine that has no runtime secret,
 * which is the wrong moment to ask for one. This way the demand lands when a
 * session is actually signed.
 *
 * The per-boot random fallback is deliberate: without STACKD_ADMIN_SECRET a
 * restart invalidates every session, which is a mild nuisance locally and a loud
 * failure in production — far better than a default secret that ships quietly
 * and makes every session forgeable.
 */
let cachedSecret: string | undefined;

function secret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.STACKD_ADMIN_SECRET;
  if (fromEnv) return (cachedSecret = fromEnv);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'STACKD_ADMIN_SECRET must be set in production — sessions cannot be signed without it',
    );
  }
  return (cachedSecret = randomBytes(32).toString('hex'));
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface StaffSession {
  id: string;
  fullName: string | null;
  role: 'cashier' | 'kitchen' | 'manager' | 'owner';
  branchId: string;
  email: string | null;
}

export async function startSession(staffId: string): Promise<void> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${staffId}.${expires}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in staff member, or null. Re-reads role and status every call. */
export async function currentStaff(): Promise<StaffSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  const [staffId, expires, signature] = raw.split('.');
  if (!staffId || !expires || !signature) return null;
  if (!safeEqual(signature, sign(`${staffId}.${expires}`))) return null;
  if (Number(expires) < Date.now()) return null;

  return queryOne<StaffSession>(
    `select s.id, s.full_name as "fullName", s.role,
            s.branch_id as "branchId", u.email
       from staff s
       join auth.users u on u.id = s.id
      where s.id = $1 and s.is_active`,
    [staffId],
  );
}
