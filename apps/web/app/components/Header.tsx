import Link from 'next/link';
import { t, type Locale } from '@stackd/shared';

/**
 * The logo is the real extracted vector (transparent ground variant), so it
 * stays crisp at any size and needs no raster fallbacks.
 */
export function Header({ locale }: { locale: Locale }) {
  const other: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <>
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
            <Link href={`/${other}/`} className="lang-btn" lang={other}>
              {t(locale, 'nav.lang')}
            </Link>
          </nav>
        </div>
      </header>
      <div className="checker" role="presentation" />
    </>
  );
}
