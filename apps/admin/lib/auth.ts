/**
 * Access control for the portal.
 *
 * Because the portal connects as the database owner it bypasses RLS entirely, so
 * these checks are not a second line of defence — they are the only one. Every
 * page and every server action starts with one.
 */

import { redirect } from 'next/navigation';

import { currentStaff, type StaffSession } from './session.ts';

export type Role = StaffSession['role'];

/** Anyone signed in. Sends you to the login page if not. */
export async function requireStaff(): Promise<StaffSession> {
  const staff = await currentStaff();
  if (!staff) redirect('/login');
  return staff;
}

/**
 * Signed in AND holding one of these roles.
 *
 * Throws rather than redirects, because this is what guards server actions: a
 * redirect there would look to the caller like the write succeeded.
 */
export async function requireRole(...roles: Role[]): Promise<StaffSession> {
  const staff = await requireStaff();
  if (!roles.includes(staff.role)) {
    throw new Error(
      `${staff.role} cannot do this. Needs ${roles.join(' or ')}`,
    );
  }
  return staff;
}

// --- The two privileged tiers ----------------------------------------------
//
// The database enum is still `cashier | kitchen | manager | owner`, because
// renaming a Postgres enum means a migration against production and touching
// every policy and query that names a role. The owner asked for the portal to
// speak in terms of Admin and Super Admin, so that renaming happens here, in the
// labels — `manager` IS Admin and `owner` IS Super Admin, everywhere.
//
// If you are reading this because you are adding a role: change ROLE_LABEL and
// these two lists, not the strings in the queries.

/**
 * Admin. Runs the shop day to day: the menu and its photos, the rewards
 * catalogue, and removing a member.
 */
export const ADMIN: Role[] = ['manager', 'owner'];

/**
 * Super Admin. Everything that rewrites history or hands out money, kept to one
 * tier on the owner's instruction (12 Aug 2026):
 *
 *   - deleting a staff account
 *   - voiding an order
 *   - adjusting or clawing back points
 *
 * `owner` alone. Note this is a LIST OF ONE, not a mistake — it reads at every
 * call site as "super admin only" and it takes a deliberate edit here to widen.
 */
export const SUPER_ADMIN: Role[] = ['owner'];

export const ROLE_LABEL: Record<Role, string> = {
  cashier: 'Cashier',
  kitchen: 'Kitchen',
  manager: 'Admin',
  owner: 'Super Admin',
};
