import { BRAND, type Locale } from '@stackd/shared';

/**
 * Slogan band. Shows the slogan in the ACTIVE locale only.
 *
 * An earlier version printed both languages at once. That is wrong for a
 * localised site: a visitor who chose Arabic should read Arabic, not Arabic
 * plus a translation. The language switch already makes the other version one
 * tap away.
 *
 * A plain <div>, not a <section aria-label={slogan}>. A section with an
 * accessible name becomes a landmark, so that version put a navigable region
 * into the page whose name was the slogan and whose entire contents were the
 * same slogan — announced twice, once as the landmark and once as its text, on
 * every page of the site. This is brand furniture between sections, not a
 * region of the document, so it takes no role and no name and the <p> inside is
 * simply read as what it is.
 */
export function SloganBand({ locale }: { locale: Locale }) {
  const slogan = locale === 'ar' ? BRAND.sloganAr : BRAND.sloganEn;

  return (
    <div className="band">
      <div className="checker" role="presentation" />
      <div className="band-body">
        <div className="wrap band-inner">
          <p className="band-lead">{slogan}</p>
          <span className="band-rule" role="presentation" />
        </div>
      </div>
      <div className="checker" role="presentation" />
    </div>
  );
}
