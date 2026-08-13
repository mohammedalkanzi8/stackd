/**
 * Encrypting the few secrets that have to live in the database.
 *
 * ⚠ THIS EXISTS BECAUSE THE SMTP PASSWORD MOVED OUT OF `deploy/.env`. That was a
 * deliberate trade and it is worth being honest about which way it cuts:
 *
 *   Before — the password was only on the VM, in a file reachable over SSH.
 *            Changing it meant an SSH session and a container restart, which the
 *            owner cannot do from a phone at the counter.
 *   After  — it is editable from the admin portal, which means an admin account
 *            is now closer to the mail password than it used to be.
 *
 * Encrypting at rest does NOT undo that: the portal can decrypt by definition,
 * so anyone who can run code as the portal can read it. What it does close is
 * the cheaper paths — a database dump, a backup file, a `select *` from a psql
 * session, a screenshot of a table. Those are the ways credentials actually
 * leak, and they are worth closing.
 *
 * ⚠ THE KEY IS DERIVED FROM `STACKD_ADMIN_SECRET`, so the ciphertext is useless
 * without the environment as well as the database. It also means ROTATING THAT
 * SECRET MAKES STORED SECRETS UNREADABLE. Rotating it already signs every staff
 * member out, so it is not a quiet operation, but the failure mode here is
 * different: decryption returns null and mail silently falls back to the env
 * value. `decryptSecret` therefore never throws — the caller decides what an
 * unreadable secret means, and for mail that is "use the env one and say so".
 *
 * AES-256-GCM, not CBC: GCM authenticates, so a tampered ciphertext fails to
 * decrypt rather than decrypting to rubbish that then gets sent to an SMTP
 * server.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/** Format marker, so a future scheme can be told apart from this one. */
const VERSION = 'v1';

/**
 * ⚠ A FIXED SALT, DELIBERATELY. A per-secret random salt would be better in
 * general, but the key has to be re-derivable from the environment alone and
 * scrypt at these parameters is deliberately slow. The salt is not the secret
 * here — `STACKD_ADMIN_SECRET` is, and it is a long random value.
 */
const SALT = Buffer.from('stackd.app_settings.v1');

function key(): Buffer {
  const secret = process.env.STACKD_ADMIN_SECRET;
  if (!secret) {
    throw new Error(
      'STACKD_ADMIN_SECRET is not set — refusing to store a secret with a key ' +
        'that would not survive a restart',
    );
  }
  // N=16384 rather than the 65536 used for passwords: this runs on every mail
  // send, not once per sign-in, and the input is already a high-entropy secret
  // rather than something a person chose.
  return scryptSync(secret, SALT, 32, { N: 16384, r: 8, p: 1 });
}

/** `v1:<iv>:<tag>:<ciphertext>`, all base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * The plaintext, or null when it cannot be read.
 *
 * ⚠ NEVER THROWS. An unreadable secret means the environment changed under a
 * stored value, and the right response is almost always to fall back rather than
 * to take the portal down — a password reset that cannot be sent locks customers
 * out of their points.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [version, ivB64, tagB64, ctB64] = stored.split(':');
    if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key, tampered ciphertext, or a value written by another scheme.
    return null;
  }
}

/**
 * A secret rendered safe to show on a screen.
 *
 * ⚠ Used for the Settings page and for anything printed to a log. The password
 * itself is never sent to the browser — the form shows this and an empty field
 * meaning "leave it alone", so a secret cannot leak through view-source, a
 * screenshot, or a password manager offering to save it.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 4) return '••••';
  return `••••••••${value.slice(-2)}`;
}
