import type { Metadata } from 'next';
import { LOCALES, assertLocale, dir } from '@stackd/shared';
import { BRAND, BRANCH } from '@stackd/shared';
import '../globals.css';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { RestaurantSchema } from '../components/RestaurantSchema';

/**
 * This is the ROOT layout. There is no app/layout.tsx — in the App Router only
 * one layout may render <html>/<body>, and `lang`/`dir` differ per locale, so the
 * locale segment has to own it.
 *
 * The bare `/` path is redirected to a locale by .htaccess (see public/.htaccess),
 * because a static export has no middleware.
 */

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  const isAr = locale === 'ar';

  const title = isAr
    ? `${BRAND.nameAr} | ${BRAND.nameEn} — الخبر الشمالية`
    : `${BRAND.nameEn} — Al Khobar Al Shamalia`;
  const description = isAr
    ? `${BRAND.taglineAr} مطعم دجاج ومأكولات شارع أمريكية في الخبر الشمالية. برجر، ستربس، وأطباق العماليق.`
    : `${BRAND.taglineEn} American street food and fried chicken in Al Khobar. Burgers, strips, and Giants.`;

  return {
    title,
    description,
    // Rendered relative because the final domain (stackd.com.sa) is not live yet.
    // Set metadataBase once DNS is pointed, so OG images resolve absolutely.
    alternates: {
      canonical: `/${locale}/`,
      languages: { ar: '/ar/', en: '/en/' },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: isAr ? 'ar_SA' : 'en_US',
      siteName: BRAND.nameEn,
    },
    other: {
      'geo.region': 'SA-04',
      'geo.placename': isAr ? BRANCH.cityAr : BRANCH.cityEn,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);

  return (
    <html lang={locale} dir={dir(locale)}>
      <head>
        {/* Fonts are self-hosted rather than pulled from a CDN: Hostinger shared
            hosting is in-region, and a third-party font request is the slowest
            thing on an otherwise static page. Drop the woff2 files into
            public/fonts and add @font-face rules to globals.css. */}
        <meta name="theme-color" content="#0b0b0b" />
      </head>
      <body>
        <RestaurantSchema locale={locale} />
        <Header locale={locale} />
        <main>{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
