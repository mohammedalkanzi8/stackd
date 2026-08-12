/**
 * The signed-in shell. Everything in this route group is behind a session —
 * `requireStaff()` redirects to /login before any child renders, so no page in
 * here repeats the check just to be safe.
 */

import Link from 'next/link';

import { ADMIN, requireStaff, ROLE_LABEL } from '@/lib/auth.ts';
import { SubmitButton } from '@/app/SubmitButton.tsx';
import {
  IconMembers,
  IconMenu,
  IconOrders,
  IconOverview,
  IconPoints,
  IconPrint,
  IconQr,
  IconReports,
  IconRewards,
  IconSignOut,
  IconStaff,
} from '@/app/NavIcons.tsx';
import { signOut } from './actions.ts';

const NAV = [
  { href: '/', label: 'Overview', Icon: IconOverview },
  { href: '/scan', label: 'Scan', Icon: IconQr },
  { href: '/orders', label: 'Orders', Icon: IconOrders },
  { href: '/members', label: 'Members', Icon: IconMembers },
  { href: '/points', label: 'Points', Icon: IconPoints },
  { href: '/rewards', label: 'Rewards', Icon: IconRewards },
  { href: '/signup-qr', label: 'Print studio', Icon: IconPrint },
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
          {/* `title` on every link, and the label in its own element: below
              900px the words are hidden and only the glyph shows, so the
              tooltip is the only thing left that names the destination. */}
          <nav className="main">
            {NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} title={label}>
                <Icon />
                <span className="nav-label">{label}</span>
              </Link>
            ))}
            {/* Revenue, liability and the best-customer list are management
                information, so the link is not offered to a cashier. As with
                Staff below, the page itself is what enforces that. */}
            {ADMIN.includes(staff.role) ? (
              <Link href="/reports" title="Reports">
                <IconReports />
                <span className="nav-label">Reports</span>
              </Link>
            ) : null}
            {/* Staff management is the owner's alone, so the link is not shown to
                anyone else. The page enforces it too; this only avoids offering
                a door that will not open. */}
            {staff.role === 'owner' ? (
              <Link href="/staff" title="Staff">
                <IconStaff />
                <span className="nav-label">Staff</span>
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
