/**
 * Outbound email.
 *
 * There is exactly one thing this app sends — a forgotten-password code — so
 * this is deliberately a single function over SMTP rather than a provider SDK.
 * SMTP is the one interface every host speaks: Zoho, Google Workspace, Amazon
 * SES, Resend and Postmark all expose it, so changing provider is a change to
 * one environment variable and no code.
 *
 * Configure with:
 *
 *   SMTP_URL   smtps://user:pass@smtp.zoho.sa:465     (smtps = implicit TLS)
 *              smtp://user:pass@smtp.example.com:587  (STARTTLS)
 *   MAIL_FROM  "STACKD Rewards <rewards@stackd.com.sa>"
 *
 * ⚠ WITH NO SMTP_URL SET, MAIL IS WRITTEN TO THE SERVER LOG INSTEAD OF SENT.
 * That is what makes the reset flow testable before a mailbox exists, and it is
 * why `assertMailConfigured()` exists and is called at the point a code is
 * issued: in production the log transport is refused outright, because a
 * password reset that silently goes nowhere looks identical to a working one
 * from the outside and the customer is simply locked out.
 */

import { createTransport, type Transporter } from 'nodemailer';

import { queryOne } from './db.ts';
import { decryptSecret } from './secrets.ts';

export interface Mail {
  to: string;
  subject: string;
  /**
   * Plain text, and it is NOT optional even when `html` is supplied.
   *
   * ⚠ A MULTIPART MESSAGE WITH NO TEXT PART IS A SPAM SIGNAL, and it is also
   * what a screen reader, a watch and a text-only client fall back to. The
   * text part is the message; the HTML is a nicer rendering of it.
   */
  text: string;
  /** Optional HTML alternative. Sent alongside `text`, never instead of it. */
  html?: string;
  /**
   * Images referenced from `html` as `cid:<cid>`.
   *
   * ⚠ EMBEDDED, NOT LINKED. A remote <img> is blocked by default in Gmail,
   * Outlook and Apple Mail, so a linked logo shows as a broken box until the
   * reader clicks "display images" — and loading one is also the tracking pixel
   * pattern every client is defending against. A cid: attachment travels inside
   * the message and renders immediately.
   */
  images?: { cid: string; filename: string; base64: string }[];
  /**
   * Which sender identity to use. Defaults to `reset`.
   *
   * ⚠ ON THE MESSAGE, not a parameter of sendMail, so it travels with the thing
   * being sent. A promotion built in one file and sent in another cannot lose
   * its marketing identity somewhere in between and go out as the transactional
   * address — which is the failure that gets reset codes buried in spam.
   */
  kind?: MailKind;
}

const FROM_FALLBACK = 'STACKD Rewards <no-reply@stackd.com.sa>';

/**
 * Which sender an outgoing message should use.
 *
 * ⚠ TRANSACTIONAL AND MARKETING MUST BE SEPARABLE. A password reset has to reach
 * the inbox; a promotion is the thing most likely to be reported as junk. Sent
 * from one address, a customer marking an offer as spam can bury the reset code
 * that same customer needs later. Defaults to `reset`, because a message that
 * has not said which it is is far more likely to be transactional.
 */
export type MailKind = 'reset' | 'promo';

export interface MailConfig {
  /** Connection string, or null when mail is not configured at all. */
  url: string | null;
  from: Record<MailKind, string>;
  /** Where the values came from, for the Settings page to show honestly. */
  source: 'database' | 'environment' | 'none';
  /**
   * True when a password IS stored but could not be decrypted — almost always
   * because STACKD_ADMIN_SECRET changed under it. Surfaced rather than silently
   * swallowed, because the symptom otherwise is "mail stopped working" with the
   * settings page cheerfully showing a configured host.
   */
  secretUnreadable: boolean;
}

interface SettingsRow {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password_enc: string | null;
  mail_from_reset: string | null;
  mail_from_promo: string | null;
}

/**
 * Builds an SMTP URL from parts.
 *
 * ⚠ THE USERNAME AND PASSWORD ARE PERCENT-ENCODED HERE so that nobody editing a
 * form has to know they must be. A mailbox username is an email address, the @
 * inside it terminates the userinfo section of a URL, and the resulting parse
 * failure looks exactly like a wrong password. That single character has cost
 * this project an evening before; it is now impossible to get wrong from the UI.
 */
export function smtpUrlFrom(parts: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}): string {
  const scheme = parts.secure ? 'smtps' : 'smtp';
  const auth =
    parts.user || parts.password
      ? `${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}@`
      : '';
  return `${scheme}://${auth}${parts.host}:${parts.port}`;
}

/**
 * The mail configuration actually in force.
 *
 * ⚠ DATABASE FIRST, ENVIRONMENT SECOND, AND ONLY FIELD BY FIELD. A half-filled
 * settings row must not take mail down: a host with no sender address uses the
 * stored host and the env sender. Clearing a field in the form returns that one
 * setting to `deploy/.env` rather than blanking it.
 *
 * ⚠ AND THE DATABASE IS ONLY PREFERRED WHEN IT HAS A HOST *AND* A READABLE
 * PASSWORD. A stored host whose password cannot be decrypted would otherwise
 * produce an SMTP URL with no credentials, which authenticates as nobody and
 * fails on every send — worse than the env value that was working yesterday.
 */
export async function resolveMailConfig(): Promise<MailConfig> {
  const envUrl = process.env.SMTP_URL ?? null;
  const envFrom = process.env.MAIL_FROM ?? FROM_FALLBACK;

  let row: SettingsRow | null = null;
  try {
    row = await queryOne<SettingsRow>(
      `select smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_enc,
              mail_from_reset, mail_from_promo
         from app_settings`,
    );
  } catch {
    // The table may not exist yet on a database that has not taken migration
    // 0012. Mail predates this feature and must go on working without it.
    row = null;
  }

  const stored = decryptSecret(row?.smtp_password_enc);
  const secretUnreadable = Boolean(row?.smtp_password_enc) && stored === null;

  const dbUsable = Boolean(row?.smtp_host && row?.smtp_port && !secretUnreadable);
  const url = dbUsable
    ? smtpUrlFrom({
        host: row!.smtp_host!,
        port: row!.smtp_port!,
        secure: row!.smtp_secure,
        user: row!.smtp_user ?? '',
        password: stored ?? '',
      })
    : envUrl;

  return {
    url,
    from: {
      reset: row?.mail_from_reset || envFrom,
      promo: row?.mail_from_promo || row?.mail_from_reset || envFrom,
    },
    source: url ? (dbUsable ? 'database' : 'environment') : 'none',
    secretUnreadable,
  };
}

/** True when a real SMTP server is configured, from either source. */
export async function mailConfigured(): Promise<boolean> {
  return Boolean((await resolveMailConfig()).url);
}

/**
 * Throws in production when mail would go to the log instead of a mailbox.
 *
 * Called before a reset code is created, not after it is sent, so a
 * misconfigured deployment fails while the customer is still looking at the
 * form and can be told something true.
 */
export async function assertMailConfigured(): Promise<void> {
  if (!(await mailConfigured()) && process.env.NODE_ENV === 'production') {
    throw new Error(
      'No SMTP server is configured, in the Settings page or in SMTP_URL — ' +
        'refusing to issue a password reset code that cannot be delivered',
    );
  }
}

/**
 * One transporter per connection string.
 *
 * ⚠ KEYED ON THE URL, NOT A BARE SINGLETON. The settings are editable from the
 * portal now, so the configuration can change while the process is running. A
 * single cached transporter would go on using the old server until somebody
 * restarted the container — and the whole point of the Settings page is not
 * having to. Keying on the URL means a change produces a new transport and the
 * old one is dropped.
 *
 * Still cached on globalThis, for the reason it always was: `next dev` reloads
 * modules on every edit, and a fresh connection pool per edit exhausts the SMTP
 * server's connection limit long before it exhausts the developer's patience.
 */
const globalForMail = globalThis as unknown as {
  stackdMailers?: Map<string, Transporter>;
};

function transport(url: string, from: string): Transporter {
  const cache = (globalForMail.stackdMailers ??= new Map());
  const existing = cache.get(url);
  if (existing) return existing;
  const t = createTransport(url, { from });
  cache.set(url, t);
  return t;
}

export async function sendMail(mail: Mail): Promise<void> {
  const config = await resolveMailConfig();

  if (!config.url) {
    // Not console.log: this is operational output, and on a server that
    // separates the two it belongs on stderr with the rest of the diagnostics.
    process.stderr.write(
      `\n─── mail (no SMTP configured, not sent) ───\n` +
        `To:      ${mail.to}\n` +
        `Subject: ${mail.subject}\n` +
        // The text part, not the HTML: this exists so a developer can read the
        // reset code off the terminal, and 3KB of markup buries it.
        (mail.html
          ? `(also has an HTML part and ${mail.images?.length ?? 0} inline image(s))\n`
          : '') +
        `\n${mail.text}\n` +
        `──────────────────────────────────────────\n\n`,
    );
    return;
  }

  if (config.secretUnreadable) {
    // Loud, because the settings page will show a configured host and the only
    // symptom otherwise is mail quietly going out as the wrong identity.
    console.warn(
      '[mail] the stored SMTP password could not be decrypted — ' +
        'STACKD_ADMIN_SECRET has probably changed. Falling back to SMTP_URL. ' +
        'Re-enter the password in Settings.',
    );
  }

  const from = config.from[mail.kind ?? 'reset'];
  await transport(config.url, from).sendMail({
    from,
    to: mail.to,
    ...mailBody(mail),
  });
}

/**
 * A `Mail` as nodemailer wants it.
 *
 * ⚠ EXPORTED SO `scripts/mail-test.mjs` CANNOT DRIFT FROM WHAT CUSTOMERS GET.
 * That script's whole purpose is proving the real message delivers, and it used
 * to spread a `Mail` straight into `sendMail()`. The moment this type grew an
 * `images` field that stopped being equivalent: nodemailer knows `attachments`,
 * not `images`, so the test would have sent the branded HTML with its `cid:`
 * reference pointing at an attachment that was never added — a broken image in
 * the one message whose job is to prove nothing is broken.
 */
export function mailBody(mail: Mail): {
  subject: string;
  text: string;
  html?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    cid: string;
    contentDisposition: 'inline';
  }[];
} {
  return {
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
    ...(mail.images?.length
      ? {
          attachments: mail.images.map((img) => ({
            filename: img.filename,
            content: Buffer.from(img.base64, 'base64'),
            // `cid` plus `inline` is what makes this render in place rather
            // than appearing as a downloadable attachment at the bottom.
            cid: img.cid,
            contentDisposition: 'inline' as const,
          })),
        }
      : {}),
  };
}
