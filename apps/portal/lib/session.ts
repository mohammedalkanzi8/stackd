/**
 * Customer sessions.
 *
 * A different cookie name from the admin portal's, deliberately: a shared name
 * would mean signing into one silently signed you into the other, and these are
 * two different kinds of person.
 *
 * Longer-lived than a staff session too. A cashier's cookie should die with the
 * shift; a customer checking their points once a fortnight should not have to
 * sign in every time.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessions, queryOne } from '@stackd/server';

const sessions = createSessions({
  cookieName: 'stackd_member',
  secretEnv: 'STACKD_PORTAL_SECRET',
  maxAgeSeconds: 60 * 60 * 24 * 30,
});

export interface Member {
  id: string;
  memberCode: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  locale: 'ar' | 'en';
  balance: number;
  lifetimeEarned: number;
  /**
   * They arrived by a one-time code and have not chosen a password yet. Every
   * signed-in page sends them to /password while this is true.
   *
   * Read from the database on each request rather than carried in the cookie,
   * like everything else about the member: a flag baked into a session at sign-in
   * would still be true after they had set the password, or still be false for a
   * session that predates the reset.
   */
  mustChangePassword: boolean;
}

export async function startSession(customerId: string): Promise<void> {
  sessions.start(await cookies(), customerId);
}

export async function endSession(): Promise<void> {
  sessions.end(await cookies());
}

/** The signed-in member with a live balance, or null. */
export async function currentMember(): Promise<Member | null> {
  const id = sessions.subject(await cookies());
  if (!id) return null;

  // customer_credentials is LEFT joined: a member signed up at the counter has
  // no credential row at all, and they are exactly who the reset flow exists to
  // let in. An inner join here would make them invisible to their own session.
  return queryOne<Member>(
    `select c.id, c.member_code as "memberCode", c.full_name as "fullName",
            c.phone, c.email, c.locale,
            coalesce(b.balance, 0) as balance,
            coalesce(b.lifetime_earned, 0) as "lifetimeEarned",
            coalesce(cc.must_change_password, false) as "mustChangePassword"
       from customers c
       left join loyalty_balances b on b.customer_id = c.id
       left join customer_credentials cc on cc.customer_id = c.id
      where c.id = $1`,
    [id],
  );
}

/**
 * The signed-in member, or a redirect.
 *
 * Sends them to /login when there is no session, and to /password when they got
 * here with a one-time code and still owe us a password. Every authenticated
 * page should call this rather than `currentMember()`, so the forced reset
 * cannot be walked around by typing a different path.
 */
export async function requireMember(): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect('/login');
  if (member.mustChangePassword) redirect('/password');
  return member;
}

/**
 * Normalises whatever someone types into a Saudi mobile into E.164.
 *
 * Returns null rather than throwing: every caller here turns it into a message
 * for the person at the keyboard, not an exception.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, '');
  if (/^9665\d{8}$/.test(digits)) return `+${digits}`;
  if (/^05\d{8}$/.test(digits)) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return null;
}
