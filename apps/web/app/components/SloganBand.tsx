import { BRAND, type Locale } from '@stackd/shared';

/**
 * Slogan band. Shows the slogan in the ACTIVE locale only.
 *
 * An earlier version printed both languages at once. That is wrong for a
 * localised site: a visitor who chose Arabic should read Arabic, not Arabic
 * plus a translation. The language switch already makes the other version one
 * tap away.
 */
export function SloganBand({ locale }: { locale: Locale }) {
  const slogan = locale === 'ar' ? BRAND.sloganAr : BRAND.sloganEn;

  return (
    <section className="band" aria-label={slogan}>
      <div className="checker" role="presentation" />
      <div className="band-body">
        <div className="wrap band-inner">
          <p className="band-lead">{slogan}</p>
          <span className="band-rule" role="presentation" />
        </div>
      </div>
      <div className="checker" role="presentation" />
    </section>
  );
}
