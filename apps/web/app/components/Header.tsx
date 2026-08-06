import Link from 'next/link';
import { t, type Locale } from '@stackd/shared';
import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';
import { PORTAL_URL } from '../portal-url.ts';

export function Header({ locale }: { locale: Locale }) {
  return (
    <header className="header">
      <div className="wrap header-inner">
        <Link href={`/${locale}/`} className="header-logo" aria-label="STACKD">
          <img src="/brand/logo.svg" alt="STACKD" width={800} height={886} />
        </Link>
        <nav className="nav">
          {/* Home, Menu and Visit are peers and read as peers: plain text, same
              weight. Only the portal link takes an icon, because it is the one
              that leaves the site. */}
          <Link href={`/${locale}/`} className="nav-link">
            {t(locale, 'nav.home')}
          </Link>
          <Link href={`/${locale}/menu/`} className="nav-link">
            {t(locale, 'nav.menu')}
          </Link>
          <Link href={`/${locale}/rewards/`} className="nav-link">
            {t(locale, 'nav.loyalty')}
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

/* Inline SVG rather than an icon font or an <img>: one glyph does not justify a
   network request, and `currentColor` means it follows the nav's own colour
   through both themes without a second rule. */


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
