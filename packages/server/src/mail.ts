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
}

const FROM_FALLBACK = 'STACKD Rewards <no-reply@stackd.com.sa>';

/** True when a real SMTP server is configured. */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL);
}

/**
 * Throws in production when mail would go to the log instead of a mailbox.
 *
 * Called before a reset code is created, not after it is sent, so a
 * misconfigured deployment fails while the customer is still looking at the
 * form and can be told something true.
 */
export function assertMailConfigured(): void {
  if (!mailConfigured() && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SMTP_URL is not set — refusing to issue a password reset code that cannot be delivered',
    );
  }
}

/**
 * One transporter per process, cached on globalThis for the same reason the pg
 * pool is: `next dev` reloads modules on every edit, and a fresh connection pool
 * per edit exhausts the SMTP server's connection limit long before it exhausts
 * the developer's patience.
 */
const globalForMail = globalThis as unknown as { stackdMailer?: Transporter };

function transport(): Transporter {
  if (globalForMail.stackdMailer) return globalForMail.stackdMailer;
  const t = createTransport(process.env.SMTP_URL!, {
    from: process.env.MAIL_FROM ?? FROM_FALLBACK,
  });
  globalForMail.stackdMailer = t;
  return t;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!mailConfigured()) {
    // Not console.log: this is operational output, and on a server that
    // separates the two it belongs on stderr with the rest of the diagnostics.
    process.stderr.write(
      `\n─── mail (no SMTP_URL, not sent) ───\n` +
        `To:      ${mail.to}\n` +
        `Subject: ${mail.subject}\n` +
        // The text part, not the HTML: this exists so a developer can read the
        // reset code off the terminal, and 3KB of markup buries it.
        (mail.html ? `(also has an HTML part and ${mail.images?.length ?? 0} inline image(s))\n` : '') +
        `\n${mail.text}\n` +
        `────────────────────────────────────\n\n`,
    );
    return;
  }

  await transport().sendMail({
    from: process.env.MAIL_FROM ?? FROM_FALLBACK,
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
