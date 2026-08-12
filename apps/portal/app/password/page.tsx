import { redirect } from 'next/navigation';
import { queryOne, verifyPassword } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember } from '@/lib/session.ts';
import { setPassword } from '@/lib/reset.ts';

export const metadata = { title: 'Choose a password · STACKD Rewards' };
export const dynamic = 'force-dynamic';

async function save(formData: FormData): Promise<void> {
  'use server';

  // Re-read the session rather than trusting a hidden field: this action writes
  // a credential, and the only acceptable answer to "whose?" is the cookie.
  const member = await currentMember();
  if (!member) redirect('/login');

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const current = String(formData.get('current') ?? '');
  const fail = (m: string) => redirect(`/password?error=${encodeURIComponent(m)}`);

  // A voluntary change has to prove the old password; a forced one cannot,
  // because the whole reason they are here is that they do not know it. The
  // one-time code was the proof in that case, and it was already spent.
  //
  // Without this, a thirty-day session on an unlocked phone is enough for anyone
  // holding it to take the account permanently.
  if (!member.mustChangePassword) {
    const row = await queryOne<{ password_hash: string }>(
      'select password_hash from customer_credentials where customer_id = $1',
      [member.id],
    );
    if (!row || !(await verifyPassword(current, row.password_hash))) {
      fail('That is not your current password.');
    }
  }

  if (password.length < 8) fail('Your password needs at least 8 characters.');
  if (password !== confirm) fail('Those two passwords are not the same.');

  await setPassword(member.id, password);
  redirect('/points?password=1');
}

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const member = await currentMember();
  if (!member) redirect('/login');

  const { error } = await searchParams;
  // Reachable deliberately by somebody who just wants to change a password they
  // still know, so this is not an error — it only changes what the page says.
  const forced = member.mustChangePassword;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>{forced ? 'Choose a new password' : 'Change your password'}</h1>
        <p className="lede">
          {forced
            ? 'Your code worked. Pick a password and you are back in — your points are exactly where you left them.'
            : 'Pick something you will remember. You stay signed in on this device.'}
        </p>

        {error ? <div className="banner bad">{error}</div> : null}

        <div className="card">
          <form action={save} className="stack">
            {/* Username hint for password managers. Without it Safari and Chrome
                save the new password against no account and never offer it back. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={member.email ?? member.phone ?? member.memberCode}
              readOnly
              hidden
            />
            {forced ? null : (
              <div>
                <label htmlFor="current">Current password</label>
                <input
                  id="current"
                  name="current"
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            )}
            <div>
              <label htmlFor="password">
                New password <span className="hint">at least 8 characters</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoFocus={forced}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="confirm">Again, to be sure</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <SubmitButton className="primary wide" pendingLabel="Saving…">
              Save and continue
            </SubmitButton>
          </form>
        </div>

        {/* No "skip" and no link away. The whole point of the flag is that a
            one-time code is not a password, so the account does not stay
            reachable by one. Signing out is the only other door. */}
        {forced ? null : (
          <p className="muted">
            <a href="/points">Back to your points</a>
          </p>
        )}
      </div>
    </div>
  );
}
