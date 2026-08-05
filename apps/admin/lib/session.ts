/**
 * Staff sessions for the admin portal.
 *
 * The signing and cookie handling live in @stackd/server so the customer portal
 * uses the identical implementation; only the cookie name, the secret and the
 * lifetime differ. Two cookie names matter: a shared one would mean signing into
 * one portal silently signed you into the other.
 */

import { cookies } from 'next/headers';
import { createSessions, queryOne } from '@stackd/server';

const sessions = createSessions({
  cookieName: 'stackd_admin',
  secretEnv: 'STACKD_ADMIN_SECRET',
  maxAgeSeconds: 60 * 60 * 12, // one long shift
});

export interface StaffSession {
  id: string;
  fullName: string | null;
  role: 'cashier' | 'kitchen' | 'manager' | 'owner';
  branchId: string;
  email: string | null;
}

export async function startSession(staffId: string): Promise<void> {
  sessions.start(await cookies(), staffId);
}

export async function endSession(): Promise<void> {
  sessions.end(await cookies());
}

/**
 * The signed-in staff member, or null.
 *
 * Role and active status are re-read every call rather than carried in the
 * cookie, so deactivating someone locks them out on their next click instead of
 * whenever their session happens to expire.
 */
export async function currentStaff(): Promise<StaffSession | null> {
  const id = sessions.subject(await cookies());
  if (!id) return null;

  return queryOne<StaffSession>(
    `select s.id, s.full_name as "fullName", s.role,
            s.branch_id as "branchId", u.email
       from staff s
       join auth.users u on u.id = s.id
      where s.id = $1 and s.is_active`,
    [id],
  );
}
