import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  encryptSecret,
  maskSecret,
  query,
  queryOne,
  resolveMailConfig,
  sendMail,
  smtpUrlFrom,
  portalBase,
} from '@stackd/server';
import { createTransport } from 'nodemailer';

import { SUPER_ADMIN, requireRole, requireStaff } from '@/lib/auth.ts';
import { getLang } from '@/lib/prefs.ts';
import { t, tf } from '@/lib/i18n.ts';

export const metadata = { title: 'Settings · STACKD admin' };
export const dynamic = 'force-dynamic';

const BACK = '/settings';

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(message)}`);
}

interface SettingsRow {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password_enc: string | null;
  mail_from_reset: string | null;
  mail_from_promo: string | null;
  updated_at: Date;
  updated_by_name: string | null;
}

/**
 * Saves the mail settings.
 *
 * ⚠ SUPER ADMIN ONLY. These fields hold the credential the shop sends mail with
 * and decide the address customers see. A manager can send a promotion; only the
 * owner can change who it comes from.
 */
async function saveMail(formData: FormData): Promise<void> {
  'use server';
  const staff = await requireRole(...SUPER_ADMIN);
  const lang = await getLang();

  const host = String(formData.get('smtpHost') ?? '').trim();
  const portRaw = String(formData.get('smtpPort') ?? '').trim();
  const secure = String(formData.get('smtpSecurity') ?? 'tls') === 'tls';
  const user = String(formData.get('smtpUser') ?? '').trim();
  const password = String(formData.get('smtpPassword') ?? '');
  const fromReset = String(formData.get('fromReset') ?? '').trim();
  const fromPromo = String(formData.get('fromPromo') ?? '').trim();

  // Clearing the host is how you hand mail back to deploy/.env, so an empty
  // form is valid rather than an error.
  if (host) {
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail(t(lang, 'set.errPort'));
    if (!user) fail(t(lang, 'set.errUser'));

    // ⚠ AN EMPTY PASSWORD FIELD MEANS "LEAVE IT ALONE", NOT "SET IT TO EMPTY".
    // The stored password is never sent to the browser, so the field renders
    // blank every time — treating blank as a new value would wipe the
    // credential every time somebody corrected a typo in the host.
    const existing = await queryOne<{ smtp_password_enc: string | null }>(
      'select smtp_password_enc from app_settings',
    );
    if (!password && !existing?.smtp_password_enc) fail(t(lang, 'set.errPassword'));

    await query(
      `update app_settings
          set smtp_host = $1, smtp_port = $2, smtp_secure = $3, smtp_user = $4,
              smtp_password_enc = coalesce($5, smtp_password_enc),
              mail_from_reset = nullif($6, ''), mail_from_promo = nullif($7, ''),
              updated_at = now(), updated_by = $8`,
      [
        host,
        port,
        secure,
        user,
        password ? encryptSecret(password) : null,
        fromReset,
        fromPromo,
        staff.id,
      ],
    );
  } else {
    // Host cleared: drop the whole SMTP block, keep the sender addresses. The
    // password goes with it rather than lingering encrypted for a server that
    // is no longer configured.
    await query(
      `update app_settings
          set smtp_host = null, smtp_port = null, smtp_user = null,
              smtp_password_enc = null,
              mail_from_reset = nullif($1, ''), mail_from_promo = nullif($2, ''),
              updated_at = now(), updated_by = $3`,
      [fromReset, fromPromo, staff.id],
    );
  }

  done(t(lang, 'set.saved'));
}

/**
 * Sends one test message to whoever asked for it.
 *
 * ⚠ THE POINT IS TO FAIL HERE RATHER THAN IN A CUSTOMER'S MISSING INBOX. A wrong
 * password, the wrong port for the scheme, an unaligned From address — all of
 * them look identical from the outside: mail simply never arrives, and the first
 * person to notice is somebody locked out of their points. This authenticates
 * first and reports the SMTP error verbatim, because "535 authentication failed"
 * is a sentence somebody can act on and "could not send" is not.
 */
async function sendTest(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...SUPER_ADMIN);
  const lang = await getLang();

  const to = String(formData.get('testTo') ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) fail(t(lang, 'set.errTestTo'));

  const config = await resolveMailConfig();
  if (!config.url) fail(t(lang, 'set.errNoSmtp'));

  // Verify the credentials separately from sending, so the two failures can be
  // told apart. Authentication failing is a settings problem; the send failing
  // after a successful login usually is not.
  try {
    await createTransport(config.url).verify();
  } catch (err) {
    fail(tf(lang, 'set.errAuth', { m: (err as Error)?.message ?? 'unknown' }));
  }

  const kind = String(formData.get('testKind') ?? 'reset') === 'promo' ? 'promo' : 'reset';

  try {
    await sendMail({
      to,
      kind,
      subject: t(lang, 'set.testSubject'),
      text: `${t(lang, 'set.testBody')}\n\n${config.from[kind]}\n`,
    });
  } catch (err) {
    fail(tf(lang, 'set.errSend', { m: (err as Error)?.message ?? 'unknown' }));
  }

  done(tf(lang, 'set.testSent', { to, from: config.from[kind] }));
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  // The page guard. NOT the layout's — a Next layout renders concurrently with
  // its page, so its redirect does not stop this component running.
  const staff = await requireStaff();
  const lang = await getLang();
  const { ok, error } = await searchParams;
  const canEdit = SUPER_ADMIN.includes(staff.role);

  const row = await queryOne<SettingsRow>(
    `select s.smtp_host, s.smtp_port, s.smtp_secure, s.smtp_user, s.smtp_password_enc,
            s.mail_from_reset, s.mail_from_promo, s.updated_at,
            st.full_name as updated_by_name
       from app_settings s
       left join staff st on st.id = s.updated_by`,
  );
  const config = await resolveMailConfig();

  // ⚠ What the environment holds, shown MASKED and read-only. This panel is the
  // answer to the question that prompted the whole page — "where do I configure
  // this?" — for the settings that deliberately stay in deploy/.env.
  const envRows: { label: string; value: string; where: string }[] = [
    {
      label: t(lang, 'set.envPortalUrl'),
      value: portalBase(),
      where: 'STACKD_PORTAL_URL',
    },
    {
      label: t(lang, 'set.envSmtpUrl'),
      value: process.env.SMTP_URL ? maskSecret(process.env.SMTP_URL) : '—',
      where: 'SMTP_URL',
    },
    {
      label: t(lang, 'set.envMailFrom'),
      value: process.env.MAIL_FROM ?? '—',
      where: 'MAIL_FROM',
    },
  ];

  return (
    <>
      <p className="eyebrow">{t(lang, 'set.title')}</p>
      <h1>{t(lang, 'set.heading')}</h1>
      <p className="lede">{t(lang, 'set.lede')}</p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      {config.secretUnreadable ? (
        <div className="banner bad">{t(lang, 'set.unreadable')}</div>
      ) : null}

      <div className="grid">
        <div className="card stat">
          <div className="k">{t(lang, 'set.inForce')}</div>
          <div className="v">
            {config.source === 'database'
              ? t(lang, 'set.srcDatabase')
              : config.source === 'environment'
                ? t(lang, 'set.srcEnv')
                : t(lang, 'set.srcNone')}
          </div>
          <div className="sub">{t(lang, `set.src${config.source}Note` as 'set.lede')}</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'set.senderReset')}</div>
          <div className="v" style={{ fontSize: 15, wordBreak: 'break-word' }} dir="ltr">
            {config.from.reset}
          </div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'set.senderPromo')}</div>
          <div className="v" style={{ fontSize: 15, wordBreak: 'break-word' }} dir="ltr">
            {config.from.promo}
          </div>
        </div>
      </div>

      {canEdit ? (
        <>
          <div className="card">
            <h2>{t(lang, 'set.mailServer')}</h2>
            <p className="muted sm">{t(lang, 'set.mailServerNote')}</p>

            <form action={saveMail} className="stack">
              <div className="row">
                <div className="field">
                  <label htmlFor="smtpHost">{t(lang, 'set.host')}</label>
                  <input
                    id="smtpHost"
                    name="smtpHost"
                    type="text"
                    dir="ltr"
                    placeholder="sunfire.mxrouting.net"
                    defaultValue={row?.smtp_host ?? ''}
                  />
                </div>
                <div className="field field-sm">
                  <label htmlFor="smtpPort">{t(lang, 'set.port')}</label>
                  <input
                    id="smtpPort"
                    name="smtpPort"
                    type="number"
                    dir="ltr"
                    placeholder="465"
                    defaultValue={row?.smtp_port ?? ''}
                  />
                </div>
                <div className="field field-sm">
                  <label htmlFor="smtpSecurity">{t(lang, 'set.security')}</label>
                  {/* ⚠ Paired with the port in the label, because mismatching
                      them HANGS rather than erroring — the hardest failure to
                      diagnose from a shop counter. */}
                  <select
                    id="smtpSecurity"
                    name="smtpSecurity"
                    defaultValue={row?.smtp_secure === false ? 'starttls' : 'tls'}
                  >
                    <option value="tls">{t(lang, 'set.secTls')}</option>
                    <option value="starttls">{t(lang, 'set.secStartTls')}</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label htmlFor="smtpUser">{t(lang, 'set.user')}</label>
                  <input
                    id="smtpUser"
                    name="smtpUser"
                    type="text"
                    dir="ltr"
                    autoComplete="off"
                    placeholder="rewards@stackd.com.sa"
                    defaultValue={row?.smtp_user ?? ''}
                  />
                </div>
                <div className="field">
                  <label htmlFor="smtpPassword">
                    {t(lang, 'set.password')}{' '}
                    <span className="hint">
                      {row?.smtp_password_enc
                        ? t(lang, 'set.passwordKeep')
                        : t(lang, 'set.passwordNew')}
                    </span>
                  </label>
                  {/* ⚠ NEVER PRE-FILLED. The stored password is not sent to the
                      browser at all, so it cannot leak through view-source, a
                      screenshot, or a password manager offering to save it.
                      Blank on save means "leave it alone". */}
                  <input
                    id="smtpPassword"
                    name="smtpPassword"
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    placeholder={row?.smtp_password_enc ? '••••••••' : ''}
                  />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label htmlFor="fromReset">
                    {t(lang, 'set.fromReset')}{' '}
                    <span className="hint">{t(lang, 'set.fromResetHint')}</span>
                  </label>
                  <input
                    id="fromReset"
                    name="fromReset"
                    type="text"
                    dir="ltr"
                    placeholder="STACKD Rewards <rewards@stackd.com.sa>"
                    defaultValue={row?.mail_from_reset ?? ''}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fromPromo">
                    {t(lang, 'set.fromPromo')}{' '}
                    <span className="hint">{t(lang, 'set.fromPromoHint')}</span>
                  </label>
                  <input
                    id="fromPromo"
                    name="fromPromo"
                    type="text"
                    dir="ltr"
                    placeholder="STACKD <offers@stackd.com.sa>"
                    defaultValue={row?.mail_from_promo ?? ''}
                  />
                </div>
              </div>

              <p className="muted sm">{t(lang, 'set.separateNote')}</p>
              <button type="submit" className="primary">
                {t(lang, 'set.save')}
              </button>
            </form>
          </div>

          <div className="card">
            <h2>{t(lang, 'set.test')}</h2>
            <p className="muted sm">{t(lang, 'set.testNote')}</p>
            <form action={sendTest} className="row">
              <div className="field">
                <label htmlFor="testTo">{t(lang, 'set.testTo')}</label>
                <input
                  id="testTo"
                  name="testTo"
                  type="email"
                  dir="ltr"
                  placeholder="you@example.com"
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="testKind">{t(lang, 'set.testAs')}</label>
                <select id="testKind" name="testKind" defaultValue="reset">
                  <option value="reset">{t(lang, 'set.senderReset')}</option>
                  <option value="promo">{t(lang, 'set.senderPromo')}</option>
                </select>
              </div>
              <button type="submit" className="primary">
                {t(lang, 'set.sendTest')}
              </button>
            </form>
          </div>
        </>
      ) : (
        <div className="card">
          <p className="muted">{t(lang, 'set.ownerOnly')}</p>
        </div>
      )}

      <div className="card">
        <h2>{t(lang, 'set.envTitle')}</h2>
        {/* ⚠ READ-ONLY, AND THAT IS THE DESIGN. These are not settings the app
            refuses to manage out of laziness. STACKD_PORTAL_URL is encoded into
            every printed QR code and poster on the wall, so a typo in a web form
            would silently invalidate paper already in the shop. It stays
            somewhere that takes deliberate effort to reach. */}
        <p className="muted sm">{t(lang, 'set.envNote')}</p>
        <table className="table">
          <tbody>
            {envRows.map((r) => (
              <tr key={r.where}>
                <td>{r.label}</td>
                <td className="mono" dir="ltr">
                  {r.value}
                </td>
                <td className="mono muted" dir="ltr">
                  {r.where}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted sm">{t(lang, 'set.envHow')}</p>
      </div>

      {row?.updated_at ? (
        <p className="muted sm">
          {tf(lang, 'set.lastChanged', {
            who: row.updated_by_name ?? '—',
            when: new Date(row.updated_at).toISOString().slice(0, 16).replace('T', ' '),
          })}
        </p>
      ) : null}
    </>
  );
}
