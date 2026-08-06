import type { Metadata } from 'next';
import {
  BRANCH,
  STACKD_HOURS,
  groupHoursForDisplay,
  formatTime,
  WEEKDAY_NAMES,
  t,
  assertLocale,
} from '@stackd/shared';
import { OpenStatus } from '../../components/OpenStatus';
import { SloganBand } from '../../components/SloganBand';

export function generateStaticParams() {
  return [{ locale: 'ar' }, { locale: 'en' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  return {
    title: locale === 'ar' ? 'زورونا | ستاكد الخبر الشمالية' : 'Visit | STACKD Al Khobar',
    description:
      locale === 'ar'
        ? 'ستاكد الخبر الشمالية. مفتوح كل يوم من ٣ عصراً حتى ٣ فجراً. العنوان، الهاتف، والاتجاهات.'
        : 'STACKD Al Khobar Al Shamalia. Open daily 3 PM to 3 AM. Address, phone and directions.',
  };
}

export default async function VisitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  const isAr = locale === 'ar';
  const rows = groupHoursForDisplay(STACKD_HOURS);
  const days = WEEKDAY_NAMES[locale];

  const services = [
    BRANCH.services.dineIn && t(locale, 'visit.dineIn'),
    BRANCH.services.takeaway && t(locale, 'visit.takeaway'),
    BRANCH.services.delivery && t(locale, 'visit.delivery'),
  ].filter(Boolean) as string[];

  return (
    <>
      <section className="hero" style={{ paddingBlockEnd: 'clamp(30px, 5vw, 56px)' }}>
        <div className="glow-bg" />
        <div className="wrap stack above">
          <p className="eyebrow">{isAr ? BRANCH.cityAr : BRANCH.cityEn}</p>
          <h1 className="display h-xl">{t(locale, 'visit.title')}</h1>
          <div className="clock" style={{ marginBlock: 4 }}>
            <span className="clock-t" style={{ fontSize: 'clamp(34px, 7vw, 62px)' }}>
              3 PM
            </span>
            <span className="clock-sep">{isAr ? 'حتى' : 'until'}</span>
            <span className="clock-t" style={{ fontSize: 'clamp(34px, 7vw, 62px)' }}>
              3 AM
            </span>
          </div>
          <OpenStatus locale={locale} />
        </div>
      </section>

      <SloganBand locale={locale} />

      <section className="section">
        <div className="wrap">
          <div className="info reveal" style={{ marginBlockStart: 0 }}>
            <div className="card">
              <h2 className="info-title">{t(locale, 'visit.address')}</h2>
              <span className="info-big info-address">
                {isAr ? BRANCH.addressAr : BRANCH.addressEn}
              </span>
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                <span dir="ltr">{BRANCH.plusCode}</span>
              </p>
              <div className="link-row">
                <a
                  href={BRANCH.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  {t(locale, 'visit.directions')}
                </a>
              </div>
            </div>

            <div className="card">
              <h2 className="info-title">{t(locale, 'visit.hours')}</h2>
              {rows.map((row, i) => {
                // Seven identical days collapse into one "Every day" line.
                const label =
                  row.weekdays.length === 7
                    ? t(locale, 'visit.everyDay')
                    : row.weekdays.length === 1
                      ? days[row.weekdays[0]]
                      : `${days[row.weekdays[0]]} – ${days[row.weekdays[row.weekdays.length - 1]]}`;
                return (
                  <div className="hours-row" key={i}>
                    <span>{label}</span>
                    <span className="hours-time">
                      {formatTime(row.opens, locale)} – {formatTime(row.closes, locale)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <h2 className="info-title">{t(locale, 'visit.phone')}</h2>
              <span className="info-big">{BRANCH.phoneDisplay}</span>
              <div className="link-row">
                <a href={`tel:${BRANCH.phone}`} className="btn btn-primary btn-sm">
                  {t(locale, 'visit.call')}
                </a>
              </div>
            </div>

            <div className="card">
              <h2 className="info-title">{t(locale, 'visit.services')}</h2>
              <ul className="svc">
                {services.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBlockStart: 8 }}>
                {t(locale, 'visit.avgSpend')}: {BRANCH.priceRange}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
