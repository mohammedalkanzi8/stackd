import { qrSvg, registrationUrl, queryOne } from '@stackd/server';

import { requireStaff } from '@/lib/auth.ts';

export const metadata = { title: 'Signup QR · STACKD admin' };
export const dynamic = 'force-dynamic';

export default async function SignupQrPage() {
  await requireStaff();

  const url = registrationUrl();
  const qr = await qrSvg(url);
  const settings = await queryOne<{ signup_bonus: number; earn_percent: string }>(
    'select signup_bonus, earn_percent from loyalty_settings',
  );

  const pointsOnLocalhost = url.includes('localhost');

  return (
    <>
      <p className="eyebrow">Loyalty</p>
      <h1>Signup QR for the counter</h1>
      <p className="lede">
        Print this and stand it by the till. Scanning it opens the registration
        page, and the customer is a member before their order is ready.
      </p>

      {pointsOnLocalhost ? (
        <div className="banner note">
          <b>This QR points at <code>{url}</code> and will not work on a phone.</b> Set{' '}
          <code>STACKD_PORTAL_URL</code> to the portal&rsquo;s real public address
          before printing anything. Paper cannot be corrected afterwards.
        </div>
      ) : null}

      <div className="card" style={{ maxWidth: 420 }}>
        <div className="qr" style={{ width: 300, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: qr }} />
        <p style={{ textAlign: 'center', marginBlockEnd: 4, fontWeight: 700, fontSize: 18 }}>
          Join STACKD Rewards
        </p>
        <p className="muted" style={{ textAlign: 'center', fontSize: 14, marginBlockStart: 0 }}>
          {settings && settings.signup_bonus > 0
            ? `${settings.signup_bonus} points just for joining, then ${Number(settings.earn_percent)}% back on every bill.`
            : `Get ${Number(settings?.earn_percent ?? 10)}% of every bill back as points.`}
        </p>
        <p className="mono muted" style={{ textAlign: 'center', fontSize: 12, wordBreak: 'break-all' }}>
          {url}
        </p>
      </div>

      <p className="muted" style={{ fontSize: 13, marginBlockStart: 18 }}>
        Use your browser&rsquo;s print command. The page strips the navigation and
        buttons when printed. The QR is vector, so it stays sharp at any size.
      </p>
    </>
  );
}
