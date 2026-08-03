import { BRAND, BRANCH, t, toArabicDigits, type Locale } from '@stackd/shared';

export function Footer({ locale }: { locale: Locale }) {
  const year = new Date().getFullYear();
  const yearText = locale === 'ar' ? toArabicDigits(year) : String(year);
  const isAr = locale === 'ar';

  return (
    <>
      <div className="checker" role="presentation" />
      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="footer-mark">
            <img src="/brand/logo.svg" alt="STACKD" width={800} height={886} />
            <div className="footer-legal">
              © {yearText} {isAr ? BRAND.nameAr : BRAND.nameEn} ·{' '}
              {t(locale, 'footer.rights')}
            </div>
          </div>

          <div className="footer-links">
            <a
              href={`https://instagram.com/${BRANCH.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
            <a
              href={`https://tiktok.com/@${BRANCH.tiktok}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              TikTok
            </a>
            <a href={BRANCH.mapsUrl} target="_blank" rel="noopener noreferrer">
              {t(locale, 'visit.directions')}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
