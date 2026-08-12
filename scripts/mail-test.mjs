/**
 * Proves the mail configuration actually delivers.
 *
 *   node scripts/mail-test.mjs you@example.com
 *
 * Reads SMTP_URL and MAIL_FROM from .env (or deploy/.env), authenticates against
 * the server, and sends the REAL forgotten-password email — the same template
 * customers receive, imported rather than copied, because a test against a
 * lookalike proves nothing about the mail that actually goes out.
 *
 * Touches no database and creates no account, so it is safe to run against
 * production. The code in the message is a fixed dummy and unlocks nothing.
 *
 * The password is never printed. It is read from the env file and the
 * connection string is masked in all output.
 */

import { createTransport } from 'nodemailer';

import { resetEmail } from '../apps/portal/lib/reset.ts';

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/mail-test.mjs <recipient@example.com>');
  process.exit(2);
}

// Node's own .env loader — no dependency. First file that exists wins, so a
// deployment can keep its real values in deploy/.env and a laptop in .env.
for (const file of ['.env', 'deploy/.env', '.env.local']) {
  try {
    process.loadEnvFile(file);
    console.log(`Loaded ${file}`);
    break;
  } catch {
    // Not there. Try the next, then fall back to the ambient environment.
  }
}

const url = process.env.SMTP_URL;
const from = process.env.MAIL_FROM;

if (!url) {
  console.error(
    '\nSMTP_URL is not set.\n\n' +
      'Put it in .env (already gitignored), for example:\n' +
      '  SMTP_URL=smtps://rewards%40stackd.com.sa:THE_PASSWORD@sunfire.mxrouting.net:465\n' +
      '  MAIL_FROM=STACKD Rewards <rewards@stackd.com.sa>\n\n' +
      'The @ inside the username must be written %40, or the URL parses wrong.\n',
  );
  process.exit(2);
}
if (!from) {
  console.error('\nMAIL_FROM is not set. Example:\n  MAIL_FROM=STACKD Rewards <rewards@stackd.com.sa>\n');
  process.exit(2);
}

/** The connection string with the password replaced, safe to print or paste. */
function masked(raw) {
  try {
    const u = new URL(raw);
    if (u.password) u.password = '********';
    return u.toString();
  } catch {
    return '(unparseable SMTP_URL)';
  }
}

console.log(`\n  SMTP_URL  ${masked(url)}`);
console.log(`  MAIL_FROM ${from}`);
console.log(`  To        ${to}\n`);

const parsed = new URL(url);
if (parsed.protocol === 'smtps:' && parsed.port === '587') {
  console.warn('⚠ smtps:// with port 587 — implicit TLS on a STARTTLS port usually just hangs.');
}
if (parsed.protocol === 'smtp:' && parsed.port === '465') {
  console.warn('⚠ smtp:// with port 465 — 465 expects implicit TLS, so use smtps://.');
}

const transporter = createTransport(url, { from });

console.log('Authenticating…');
try {
  await transporter.verify();
  console.log('✓ The server accepted the credentials.\n');
} catch (err) {
  console.error(`✗ ${err.message}`);
  const hints = {
    EAUTH: 'Wrong username or password. MXroute wants the FULL address as the username.',
    ETIMEDOUT: 'Nothing listening. Check the host and whether the port matches the protocol.',
    ESOCKET: 'TLS failed. smtps:// is 465, smtp:// is 587 — a mismatch lands here.',
    ECONNECTION: 'Could not connect. Check the hostname.',
  };
  if (hints[err.code]) console.error(`  ${hints[err.code]}`);
  process.exit(1);
}

// A fixed, obviously-fake code. This message unlocks nothing.
const mail = resetEmail('123456', null);

console.log('Sending the real reset email…');
const info = await transporter.sendMail({ from, to, ...mail });

console.log('\n✓ Accepted for delivery.');
console.log(`  accepted: ${JSON.stringify(info.accepted)}`);
if (info.rejected?.length) console.log(`  REJECTED: ${JSON.stringify(info.rejected)}`);
console.log(`  response: ${info.response}`);
console.log(`  subject:  ${mail.subject}`);
console.log(
  '\nNow open that inbox. Check the spam folder too — landing there is the failure\n' +
    'mode SPF and DKIM exist to prevent, and it is worth knowing before customers meet it.\n',
);
