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
    <section className="section">
      <div className="wrap">
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 56px)' }}>{t(locale, 'visit.title')}</h1>
        <div style={{ marginBlockStart: 18 }}>
          <OpenStatus locale={locale} />
        </div>

        <div className="info-grid">
          <div className="card">
            <h2>{t(locale, 'visit.address')}</h2>
            <p>{isAr ? BRANCH.addressAr : BRANCH.addressEn}</p>
            <p style={{ marginBlockStart: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <span dir="ltr">{BRANCH.plusCode}</span>
            </p>
            <div className="link-row">
              <a
                href={BRANCH.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-sm"
              >
                {t(locale, 'visit.directions')}
              </a>
            </div>
          </div>

          <div className="card">
            <h2>{t(locale, 'visit.hours')}</h2>
            {rows.map((row, i) => {
              // Seven identical days collapse to one "Every day" line.
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
            <h2>{t(locale, 'visit.phone')}</h2>
            <p dir="ltr" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              {BRANCH.phoneDisplay}
            </p>
            <div className="link-row">
              <a href={`tel:${BRANCH.phone}`} className="btn-sm">
                {t(locale, 'visit.call')}
              </a>
            </div>
          </div>

          <div className="card">
            <h2>{t(locale, 'visit.services')}</h2>
            <ul style={{ margin: 0, paddingInlineStart: '1.1em' }}>
              {services.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p style={{ marginBlockStart: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              {t(locale, 'visit.avgSpend')}: {BRANCH.priceRange}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
