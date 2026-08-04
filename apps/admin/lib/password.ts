/**
 * Staff password hashing.
 *
 * scrypt from node:crypto — no dependency, and deliberately memory-hard, which
 * is the property that matters if this file's contents ever leak. Parameters are
 * stored inside the hash string so raising the cost later does not invalidate
 * existing rows: verification reads N/r/p from the record it is checking.
 *
 * Format: scrypt$<N>$<r>$<p>$<salt base64>$<key base64>
 */

import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

// promisify picks scrypt's 3-argument overload, which drops the options we need
// to raise maxmem. Naming the signature keeps the call sites honest.
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** ~64 MB of memory per verification. Comfortable on a laptop, painful to brute force. */
const COST = { N: 2 ** 16, r: 8, p: 1 };
const KEY_LENGTH = 32;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p } = COST;
  // maxmem must be raised explicitly: node's default rejects N this large.
  const key = await scrypt(plain, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return [
    'scrypt',
    N,
    r,
    p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(plain: string, record: string): Promise<boolean> {
  const [scheme, N, r, p, saltB64, keyB64] = record.split('$');
  if (scheme !== 'scrypt') return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(plain, salt, expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * 1024 * 1024,
  });

  // Constant time: a plain === would leak how much of the hash matched via
  // timing, which is enough to reconstruct it byte by byte.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
