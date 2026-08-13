import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STACKD_ADMIN_SECRET ??= 'test-secret-for-the-suite-only';

const { encryptSecret, decryptSecret, maskSecret } = await import('./secrets.ts');
const { smtpUrlFrom } = await import('./mail.ts');

test('a secret survives a round trip', () => {
  const plain = 'a-mailbox-password-with-@-and-:-in-it';
  assert.equal(decryptSecret(encryptSecret(plain)), plain);
});

test('the same plaintext encrypts differently every time', () => {
  // A fresh IV per encryption. Without it, two identical passwords produce
  // identical ciphertext, and anyone reading the table learns they match.
  assert.notEqual(encryptSecret('same'), encryptSecret('same'));
});

test('tampering is detected rather than decrypting to rubbish', () => {
  // ⚠ This is why GCM and not CBC. A flipped byte must fail, not produce
  // plausible-looking garbage that then gets handed to an SMTP server.
  const good = encryptSecret('hunter2');
  const [v, iv, tag, ct] = good.split(':');
  const flipped = Buffer.from(ct, 'base64');
  flipped[0] ^= 0xff;
  assert.equal(decryptSecret([v, iv, tag, flipped.toString('base64')].join(':')), null);
});

test('a wrong key returns null instead of throwing', () => {
  // ⚠ The real scenario: STACKD_ADMIN_SECRET was rotated. Mail must fall back to
  // the environment, not take the portal down — a reset that cannot be sent
  // locks customers out of their points.
  const sealed = encryptSecret('hunter2');
  const original = process.env.STACKD_ADMIN_SECRET;
  process.env.STACKD_ADMIN_SECRET = 'a-completely-different-secret';
  try {
    assert.equal(decryptSecret(sealed), null);
  } finally {
    process.env.STACKD_ADMIN_SECRET = original;
  }
});

test('junk and empties are survivable', () => {
  for (const bad of [null, undefined, '', 'not-encrypted-at-all', 'v9:a:b:c', 'v1::::']) {
    assert.equal(decryptSecret(bad), null, `threw or decoded on ${JSON.stringify(bad)}`);
  }
});

test('masking never shows enough to be useful', () => {
  assert.equal(maskSecret(null), '—');
  assert.equal(maskSecret('abc'), '••••');
  const masked = maskSecret('supersecretpassword');
  assert.ok(!masked.includes('supersecret'), 'the mask leaks the secret');
  assert.ok(masked.endsWith('rd'), 'no tail to recognise it by');
});

test('the @ in a mailbox username is percent-encoded', () => {
  // ⚠ THE BUG THIS EXISTS TO PREVENT. A mailbox username is an email address;
  // the @ inside it terminates the userinfo section of a URL, and the resulting
  // parse failure looks exactly like a wrong password. Nobody filling in a form
  // should have to know that.
  const url = smtpUrlFrom({
    host: 'sunfire.mxrouting.net',
    port: 465,
    secure: true,
    user: 'rewards@stackd.com.sa',
    password: 'p@ss:word/with?specials',
  });
  assert.ok(url.includes('rewards%40stackd.com.sa'), 'the @ was not encoded');
  assert.ok(!url.includes('p@ss'), 'the password @ was not encoded');

  // And it must parse back to exactly what went in.
  const parsed = new URL(url);
  assert.equal(decodeURIComponent(parsed.username), 'rewards@stackd.com.sa');
  assert.equal(decodeURIComponent(parsed.password), 'p@ss:word/with?specials');
  assert.equal(parsed.hostname, 'sunfire.mxrouting.net');
  assert.equal(parsed.port, '465');
});

test('the scheme follows the security flag, not the port', () => {
  // ⚠ smtps:// is 465 (implicit TLS); smtp:// is 587 (STARTTLS). Mismatched,
  // the connection HANGS rather than erroring, which is the hardest kind of
  // wrong to diagnose from a shop counter.
  const base = { host: 'h', user: 'u', password: 'p' };
  assert.ok(smtpUrlFrom({ ...base, port: 465, secure: true }).startsWith('smtps://'));
  assert.ok(smtpUrlFrom({ ...base, port: 587, secure: false }).startsWith('smtp://'));
});

test('no credentials means no stray @ in the url', () => {
  const url = smtpUrlFrom({ host: 'h', port: 25, secure: false, user: '', password: '' });
  assert.equal(url, 'smtp://h:25');
});
