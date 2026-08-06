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

/** Who may change the menu, the rewards, and anyone's points. */
export const MANAGERIAL: Role[] = ['manager', 'owner'];

export const ROLE_LABEL: Record<Role, string> = {
  cashier: 'Cashier',
  kitchen: 'Kitchen',
  manager: 'Manager',
  owner: 'Owner',
};
