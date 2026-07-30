import Link from 'next/link';
import { t, type Locale } from '@stackd/shared';

/** The language toggle swaps only the locale segment, preserving the page. */
export function Header({ locale }: { locale: Locale }) {
  const other: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <>
      <header className="header">
        <div className="wrap header-inner">
          <Link href={`/${locale}/`} className="logo" aria-label="STACKD">
            STACKD
          </Link>
          <nav className="nav">
            <Link href={`/${locale}/menu/`}>{t(locale, 'nav.menu')}</Link>
            <Link href={`/${locale}/visit/`}>{t(locale, 'nav.visit')}</Link>
            {/* Language toggle links to the same page in the other locale.
                Hardcoded to the home page of the other locale because a static
                export cannot read the current path on the server. A client
                component could preserve the path — worth doing once there are
                more than three pages. */}
            <Link href={`/${other}/`} className="lang-toggle" lang={other}>
              {t(locale, 'nav.lang')}
            </Link>
          </nav>
        </div>
      </header>
      <div className="checker" role="presentation" />
    </>
  );
}
