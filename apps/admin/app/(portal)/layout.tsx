/**
 * The signed-in shell. Everything in this route group is behind a session —
 * `requireStaff()` redirects to /login before any child renders, so no page in
 * here repeats the check just to be safe.
 */

import Link from 'next/link';

import { ADMIN, requireStaff, type Role } from '@/lib/auth.ts';
import { getLang, getTheme } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { LangSwitch, ThemeSwitch } from './Prefs.tsx';
import { NavLinks, type NavItem } from './NavLinks.tsx';
import { SubmitButton } from '@/app/SubmitButton.tsx';
import {
  IconMembers,
  IconMenu,
  IconOrders,
  IconOverview,
  IconPoints,
  IconPrint,
  IconPromotions,
  IconQr,
  IconReports,
  IconRewards,
  IconSignOut,
  IconStaff,
} from '@/app/NavIcons.tsx';
import { signOut } from './actions.ts';

/**
 * The whole nav, in one list.
 *
 * `key` rather than a literal label, because this is the one place every page's
 * name appears — translating it here translates the chrome at once.
 *
 * `roles` gates a link. Reports is management information and is not offered to
 * a cashier; Staff is the owner's alone. ⚠ In both cases the PAGE is what
 * enforces it — this only avoids offering a door that will not open. Two
 * role-gated links used to live as separate JSX branches further down, which is
 * how one of them ended up without an icon when the nav was refactored.
 */
const NAV: { href: string; key: string; Icon: () => React.ReactElement; roles?: Role[] }[] = [
  { href: '/', key: 'nav.overview', Icon: IconOverview },
  { href: '/scan', key: 'nav.scan', Icon: IconQr },
  { href: '/orders', key: 'nav.orders', Icon: IconOrders },
  { href: '/members', key: 'nav.members', Icon: IconMembers },
  { href: '/points', key: 'nav.points', Icon: IconPoints },
  { href: '/rewards', key: 'nav.rewards', Icon: IconRewards },
  { href: '/signup-qr', key: 'nav.print', Icon: IconPrint },
  { href: '/menu', key: 'nav.menu', Icon: IconMenu },
  // Manager and owner only. Emailing every customer at once is a brand-level
  // act, not something a till session should reach by wandering into a URL.
  { href: '/promotions', key: 'nav.promotions', Icon: IconPromotions, roles: ADMIN },
  { href: '/reports', key: 'nav.reports', Icon: IconReports, roles: ADMIN },
  { href: '/staff', key: 'nav.staff', Icon: IconStaff, roles: ['owner'] },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [staff, lang, theme] = await Promise.all([requireStaff(), getLang(), getTheme()]);

  // Gate once, then resolve labels, so the client component never touches the
  // dictionary, the cookie, or the role rules.
  const visible = NAV.filter((n) => !n.roles || n.roles.includes(staff.role));
  const items: NavItem[] = visible.map(({ href, key }) => ({ href, label: t(lang, key) }));

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          {/* ⚠ dir="ltr" on the wordmark. It is a Latin lockup, and the accent
              full stop is part of the mark rather than punctuation in a
              sentence. Left to inherit RTL, bidi resolves that trailing period
              to the paragraph direction and renders ".STACKD" — the brand
              silently broken on every Arabic screen. */}
          <Link href="/" className="brand" dir="ltr">
            STACKD<span>.</span>
          </Link>
          {/* `title` on every link, and the label in its own element: below
              900px the words are hidden and only the glyph shows, so the
              tooltip is the only thing left that names the destination. */}
          <nav className="main">
            {/* Icons are handed over as already-rendered nodes keyed by href.
                They are inert SVG, so there is no reason to ship the icon
                module to the browser alongside the one hook that needs it.
                Built from `visible`, not NAV, so a gated link cannot arrive
                with a label and no glyph. */}
            <NavLinks
              items={items}
              Icons={Object.fromEntries(visible.map(({ href, Icon }) => [href, <Icon key={href} />]))}
            />
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
