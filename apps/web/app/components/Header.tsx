import Link from 'next/link';
import { t, type Locale } from '@stackd/shared';
import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';

/**
 * Where the Rewards link points.
 *
 * The loyalty portal is a separate app that RUNS A SERVER — this site is a
 * static export and cannot hold an account. So it is an ordinary outbound link,
 * baked in at build time, not a route.
 *
 * `NEXT_PUBLIC_PORTAL_URL` must be set before a production build or the button
 * points at localhost on the live site. It defaults to the eventual public
 * address rather than to localhost for exactly that reason: a wrong-but-plausible
 * link is better than one that is obviously broken only on the developer's
 * machine.
 */
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://stackd.com.sa';

export function Header({ locale }: { locale: Locale }) {
  return (
    <header className="header">
      <div className="wrap header-inner">
        <Link href={`/${locale}/`} className="header-logo" aria-label="STACKD">
          <img src="/brand/logo.svg" alt="STACKD" width={800} height={886} />
        </Link>
        <nav className="nav">
          <Link href={`/${locale}/`} className="nav-link nav-icon" aria-label={t(locale, 'nav.home')}>
            <HomeIcon />
            <span className="nav-icon-label">{t(locale, 'nav.home')}</span>
          </Link>
          <Link href={`/${locale}/menu/`} className="nav-link">
            {t(locale, 'nav.menu')}
          </Link>
          <Link href={`/${locale}/visit/`} className="nav-link">
            {t(locale, 'nav.visit')}
          </Link>
          <a
            href={`${PORTAL_URL}/login`}
            className="nav-link nav-icon"
            aria-label={t(locale, 'nav.login')}
          >
            <UserIcon />
            <span className="nav-icon-label">{t(locale, 'nav.login')}</span>
          </a>
          <LangToggle locale={locale} />
          <ThemeToggle locale={locale} />
        </nav>
      </div>
    </header>
  );
}

/* Inline SVG rather than an icon font or an <img>: two glyphs do not justify a
   network request, and `currentColor` means they follow the nav's own colour
   through both themes without a second rule. */

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
