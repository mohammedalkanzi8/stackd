import { BRAND, type Locale } from '@stackd/shared';

/**
 * Bilingual slogan ticker. Both languages run in the same strip regardless of
 * the active locale — the brand is bilingual and this is the one place where
 * showing both at once is an asset rather than clutter.
 *
 * The track is duplicated so the -100% translate loops seamlessly; the copy is
 * aria-hidden because it is decoration, not content a screen reader needs twice.
 */
export function Marquee({ locale }: { locale: Locale }) {
  const items = [
    BRAND.sloganEn,
    BRAND.sloganAr,
    locale === 'ar' ? BRAND.taglineAr : BRAND.taglineEn,
    'EST. 2023',
    'الخبر الشمالية',
    '3 PM — 3 AM',
  ];

  const track = (
    <div className="marquee-track" aria-hidden="true">
      {items.map((text, i) => (
        <span className="marquee-item" key={i}>
          {text}
        </span>
      ))}
    </div>
  );

  return (
    <div className="marquee" role="presentation">
      {track}
      {track}
    </div>
  );
}
