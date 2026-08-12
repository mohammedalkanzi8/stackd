/**
 * The signed-in shell. Everything in this route group is behind a session —
 * `requireStaff()` redirects to /login before any child renders, so no page in
 * here repeats the check just to be safe.
 */

import Link from 'next/link';

import { ADMIN, requireStaff } from '@/lib/auth.ts';
import { getLang, getTheme } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { LangSwitch, ThemeSwitch } from './Prefs.tsx';
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

// `key` rather than a literal label: the nav is the one place every page's name
// appears, so translating it here translates the whole chrome at once.
const NAV = [
  { href: '/', key: 'nav.overview', Icon: IconOverview },
  { href: '/scan', key: 'nav.scan', Icon: IconQr },
  { href: '/orders', key: 'nav.orders', Icon: IconOrders },
  { href: '/members', key: 'nav.members', Icon: IconMembers },
  { href: '/points', key: 'nav.points', Icon: IconPoints },
  { href: '/rewards', key: 'nav.rewards', Icon: IconRewards },
  { href: '/signup-qr', key: 'nav.print', Icon: IconPrint },
  { href: '/menu', key: 'nav.menu', Icon: IconMenu },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [staff, lang, theme] = await Promise.all([requireStaff(), getLang(), getTheme()]);

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
            {NAV.map(({ href, key, Icon }) => (
              <Link key={href} href={href} title={t(lang, key)}>
                <Icon />
                <span className="nav-label">{t(lang, key)}</span>
              </Link>
            ))}
            {/* Revenue, liability and the best-customer list are management
                information, so the link is not offered to a cashier. As with
                Staff below, the page itself is what enforces that. */}
            {ADMIN.includes(staff.role) ? (
              <Link href="/reports" title={t(lang, 'nav.reports')}>
                <IconReports />
                <span className="nav-label">{t(lang, 'nav.reports')}</span>
              </Link>
            ) : null}
            {/* Staff management is the owner's alone, so the link is not shown to
                anyone else. The page enforces it too; this only avoids offering
                a door that will not open. */}
            {staff.role === 'owner' ? (
              <Link href="/staff" title={t(lang, 'nav.staff')}>
                <IconStaff />
                <span className="nav-label">{t(lang, 'nav.staff')}</span>
              </Link>
            ) : null}
          </nav>
          <div className="whoami">
            {/* The role comes from the dictionary rather than ROLE_LABEL so
                "Admin" and "Super Admin" read as مشرف and المالك in Arabic.
                ROLE_LABEL stays the authority for the English wording. */}
            <span className="who">
              <b>{staff.fullName ?? staff.email}</b>
              <span className="who-role">{t(lang, `role.${staff.role}`)}</span>
            </span>
            <div className="prefs">
              <LangSwitch lang={lang} />
              <ThemeSwitch lang={lang} theme={theme} />
            </div>
            <form action={signOut}>
              <SubmitButton className="quiet" pendingLabel={t(lang, 'nav.signingOut')}>
                <IconSignOut />
                {t(lang, 'nav.signOut')}
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
