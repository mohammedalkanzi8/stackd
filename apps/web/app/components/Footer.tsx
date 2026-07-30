import { BRAND, BRANCH, t, toArabicDigits, type Locale } from '@stackd/shared';

export function Footer({ locale }: { locale: Locale }) {
  const year = new Date().getFullYear();
  const yearText = locale === 'ar' ? toArabicDigits(year) : String(year);

  return (
    <>
      <div className="checker" role="presentation" />
      <footer className="footer">
        <div className="wrap footer-inner">
          <div>
            <div style={{ fontWeight: 700, color: '#fff' }}>
              {locale === 'ar' ? BRAND.nameAr : BRAND.nameEn}
            </div>
            <div>
              © {yearText} · {t(locale, 'footer.rights')}
            </div>
          </div>
          <div className="footer-social">
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
            <a href={`tel:${BRANCH.phone}`} dir="ltr">
              {BRANCH.phoneDisplay}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
