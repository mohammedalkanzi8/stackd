/**
 * The signed-in shell. Everything in this route group is behind a session —
 * `requireStaff()` redirects to /login before any child renders, so no page in
 * here repeats the check just to be safe.
 */

import Link from 'next/link';

import { requireStaff } from '@/lib/auth.ts';
import { ROLE_LABEL } from '@/lib/auth.ts';
import { signOut } from './actions.ts';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            STACKD<span>.</span>
          </Link>
          <nav className="main">
            <Link href="/">Overview</Link>
            <Link href="/members">Members</Link>
            <Link href="/rewards">Rewards</Link>
            <Link href="/menu">Menu</Link>
          </nav>
          <div className="whoami">
            <span>
              <b>{staff.fullName ?? staff.email}</b> · {ROLE_LABEL[staff.role]}
            </span>
            <form action={signOut}>
              <button type="submit" className="quiet">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
