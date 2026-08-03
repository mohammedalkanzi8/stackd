import Link from 'next/link';
import { t, type Locale } from '@stackd/shared';
import { LangToggle } from './LangToggle';
import { ThemeToggle } from './ThemeToggle';

export function Header({ locale }: { locale: Locale }) {
  return (
    <header className="header">
      <div className="wrap header-inner">
        <Link href={`/${locale}/`} className="header-logo" aria-label="STACKD">
          <img src="/brand/logo.svg" alt="STACKD" width={800} height={886} />
        </Link>
        <nav className="nav">
          <Link href={`/${locale}/menu/`} className="nav-link">
            {t(locale, 'nav.menu')}
          </Link>
          <Link href={`/${locale}/visit/`} className="nav-link">
            {t(locale, 'nav.visit')}
          </Link>
          <LangToggle locale={locale} />
          <ThemeToggle locale={locale} />
        </nav>
      </div>
    </header>
  );
}
