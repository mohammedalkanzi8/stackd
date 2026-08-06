/**
 * The signed-in shell. Everything in this route group is behind a session —
 * `requireStaff()` redirects to /login before any child renders, so no page in
 * here repeats the check just to be safe.
 */

import Link from 'next/link';

import { requireStaff, ROLE_LABEL } from '@/lib/auth.ts';
import { SubmitButton } from '@/app/SubmitButton.tsx';
import {
  IconMembers,
  IconMenu,
  IconOrders,
  IconOverview,
  IconPoints,
  IconQr,
  IconRewards,
  IconSignOut,
  IconStaff,
} from '@/app/NavIcons.tsx';
import { signOut } from './actions.ts';

const NAV = [
  { href: '/', label: 'Overview', Icon: IconOverview },
  { href: '/orders', label: 'Orders', Icon: IconOrders },
  { href: '/members', label: 'Members', Icon: IconMembers },
  { href: '/points', label: 'Points', Icon: IconPoints },
  { href: '/rewards', label: 'Rewards', Icon: IconRewards },
  { href: '/signup-qr', label: 'Signup QR', Icon: IconQr },
  { href: '/menu', label: 'Menu', Icon: IconMenu },
];

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
            {NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href}>
                <Icon />
                {label}
              </Link>
            ))}
            {/* Staff management is the owner's alone, so the link is not shown to
                anyone else. The page enforces it too; this only avoids offering
                a door that will not open. */}
            {staff.role === 'owner' ? (
              <Link href="/staff">
                <IconStaff />
                Staff
              </Link>
            ) : null}
          </nav>
          <div className="whoami">
            <span>
              <b>{staff.fullName ?? staff.email}</b> · {ROLE_LABEL[staff.role]}
            </span>
            <form action={signOut}>
              <SubmitButton className="quiet" pendingLabel="Signing out">
                <IconSignOut />
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
