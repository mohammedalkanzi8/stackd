import { notFound } from 'next/navigation';
import { qrSvg, registrationUrl, queryOne } from '@stackd/server';

import { requireStaff } from '@/lib/auth.ts';
import { FORMATS, isFormatId } from '@/lib/poster/formats.ts';
import { Poster } from '@/lib/poster/Poster.tsx';
import { sheetCss } from '@/lib/poster/sheet-css.ts';
import { PrintButton } from './PrintButton.tsx';
import '@/app/fonts.generated.css';

/**
 * The print surface: one sheet, at true physical size, and nothing else.
 *
 * Deliberately OUTSIDE the `(portal)` route group, so it inherits only the bare
 * root layout and there is no navigation, sidebar or header to suppress. A
 * print stylesheet that hides the portal chrome is the usual approach and it is
 * fragile — anything added to the layout later has to remember to opt out, and
 * nobody finds out it did not until a sheet comes off the printer with a
 * sidebar down one edge.
 *
 * Still behind `requireStaff()`. The chrome is gone; the session is not.
 *
 * Save as PDF from here to send to a print shop.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ format: string }>;
}) {
  const { format } = await params;
  const f = isFormatId(format) ? FORMATS[format] : null;
  // The tab title becomes the default filename when printing to PDF, so it is
  // worth making it something a print shop can act on.
  return { title: f ? `STACKD Rewards ${f.w}x${f.h}mm` : 'Print' };
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ format: string }>;
}) {
  await requireStaff();
  const { format } = await params;
  if (!isFormatId(format)) notFound();

  const f = FORMATS[format];
  const url = registrationUrl();
  const qr = await qrSvg(url);
  const settings = await queryOne<{ signup_bonus: number; earn_percent: string }>(
    'select signup_bonus, earn_percent from loyalty_settings',
  );

  return (
    <>
      {/* Scale 1: this route is the real thing, not a preview. */}
      <style dangerouslySetInnerHTML={{ __html: sheetCss(f, 1) }} />
      <div className="sheet-frame">
        <Poster
          format={f}
          qrSvg={qr}
          url={url}
          earnPercent={Number(settings?.earn_percent ?? 10)}
          signupBonus={settings?.signup_bonus ?? 0}
        />
      </div>
      <PrintButton />
    </>
  );
}
