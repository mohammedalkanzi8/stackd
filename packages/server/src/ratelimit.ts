/**
 * Rate limiting for the things an unauthenticated stranger can reach.
 *
 * ⚠ THIS EXISTED NOWHERE BEFORE. Both sign-in forms and the forgotten-password
 * form accepted unlimited attempts from anywhere on the internet, with the staff
 * portal's allowlist open to `0.0.0.0/0`. Two consequences, and the second is
 * the one that bites first:
 *
 *   1. Unlimited password guessing against staff accounts that can move money.
 *   2. Every attempt — INCLUDING failures against accounts that do not exist,
 *      because the login deliberately verifies a dummy hash to avoid leaking
 *      which addresses are real — costs ~64 MB and ~100 ms of scrypt on a
 *      TWO-CORE box that also runs Postgres, both portals and the till. A few
 *      dozen concurrent requests starve the counter mid-service.
 *
 * ⚠ THE LIMITER MUST RUN BEFORE THE HASH. Order is the whole point: a limiter
 * called after verifyPassword() still pays for the attack it is meant to stop.
 *
 * Backed by Postgres rather than memory. The portals run as separate processes
 * and are restarted by every deploy, so an in-memory counter is both per-process
 * and erased on restart — an attacker gets a fresh budget from each, and a
 * redeploy hands them a clean slate. One table, one row per key, is enough.
 */

import { query, queryOne } from './db.ts';

export interface Limit {
  /** What is being limited: 'login', 'reset', and so on. Namespaces the key. */
  action: string;
  /** Identity of the caller — an IP, an email, or both as separate calls. */
  key: string;
  /** Attempts allowed inside the window. */
  max: number;
  /** Window length in seconds. */
  windowSecs: number;
}

export interface LimitResult {
  allowed: boolean;
  /** Seconds until the caller may try again. Zero when allowed. */
  retryAfter: number;
}

/**
 * Counts one attempt and says whether it is allowed.
 *
 * A single statement, so two racing requests cannot both read "4 attempts" and
 * both write "5". The insert-on-conflict does the read, the increment and the
 * window reset atomically; anything split into select-then-update is a race an
 * attacker can widen with concurrency.
 */
export async function rateLimit(limit: Limit): Promise<LimitResult> {
  const { action, key, max, windowSecs } = limit;

  const row = await queryOne<{ attempts: number; retry_after: number }>(
    `insert into rate_limits (action, key, attempts, window_start)
     values ($1, $2, 1, now())
     on conflict (action, key) do update
        set attempts = case
              when rate_limits.window_start < now() - make_interval(secs => $3) then 1
              else rate_limits.attempts + 1
            end,
            window_start = case
              when rate_limits.window_start < now() - make_interval(secs => $3) then now()
              else rate_limits.window_start
            end
     returning attempts,
               greatest(0, ceil(extract(epoch from
                 (window_start + make_interval(secs => $3)) - now())))::int as retry_after`,
    // ⚠ `max` is NOT a query parameter. It is compared in JS below, and passing
    // it as an unused $3 made Postgres raise 42P18 "could not determine data
    // type of parameter" — which took the whole sign-in action down with a 500.
    // An unused placeholder has no inferable type; there is nothing to infer it
    // from.
    [action, key, windowSecs],
  );

  const attempts = row?.attempts ?? 1;
  return attempts > max
    ? { allowed: false, retryAfter: row?.retry_after ?? windowSecs }
    : { allowed: true, retryAfter: 0 };
}

/** Forgets the counter for a key. Called after a SUCCESSFUL sign-in. */
export async function clearLimit(action: string, key: string): Promise<void> {
  await query('delete from rate_limits where action = $1 and key = $2', [action, key]);
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * ⚠ `x-forwarded-for` IS CLIENT-SUPPLIED and trivially spoofed. It is only
 * meaningful because Caddy sits in front of both portals and rewrites it, and
 * because nothing is published on the box except Caddy's 80 and 443 — so a
 * request cannot reach the app without passing through it. The LAST entry is
 * taken, not the first: the first is whatever the client sent, the last is what
 * the proxy appended.
 *
 * If a second ingress is ever added, or a container port is published, this
 * assumption breaks and per-IP limiting becomes bypassable. Per-account limits
 * are applied alongside precisely so that IP is not the only defence.
 */
export function callerIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return headers.get('x-real-ip') ?? 'unknown';
}
