import { BRAND, type Locale } from '@stackd/shared';

/**
 * Static bilingual slogan band. Replaces the scrolling ticker that sat here.
 *
 * The slogan is the loudest thing the brand says, so it is set once at full
 * size rather than sliding past. Both languages appear together — the active
 * locale leads, the other follows in gold beneath a rule. Motion is not what
 * made the ticker weak; repetition at small size was.
 */
export function SloganBand({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const lead = isAr ? BRAND.sloganAr : BRAND.sloganEn;
  const second = isAr ? BRAND.sloganEn : BRAND.sloganAr;
  const secondLang = isAr ? 'en' : 'ar';

  return (
    <section className="band" aria-label={BRAND.sloganEn}>
      <div className="checker" role="presentation" />
      <div className="band-body">
        <div className="wrap band-inner">
          <p className="band-lead">{lead}</p>
          <span className="band-rule" role="presentation" />
          <p className="band-second" lang={secondLang} dir={secondLang === 'ar' ? 'rtl' : 'ltr'}>
            {second}
          </p>
        </div>
      </div>
      <div className="checker" role="presentation" />
    </section>
  );
}
