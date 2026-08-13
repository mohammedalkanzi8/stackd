import { queryOne } from '@stackd/server';

import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';

export const metadata = { title: 'Unsubscribe · STACKD Rewards' };
export const dynamic = 'force-dynamic';

/**
 * Turns off promotional email for one customer.
 *
 * ⚠ NO SIGN-IN, DELIBERATELY. The point of a one-click unsubscribe is that it is
 * one click: somebody who has decided they want no more mail from a burger shop
 * will not create a password to say so, they will press the spam button instead,
 * and that costs the sending reputation the password-reset mail depends on.
 * The token in the URL is the whole credential, which is why it is a random uuid
 * that grants exactly this one action and nothing else.
 *
 * ⚠ IT ALSO CANNOT RUN ON A GET FROM A LINK SCANNER. Corporate mail gateways and
 * some clients fetch every URL in a message to check it for malware, which would
 * unsubscribe people who never clicked. So the link lands on this page and the
 * change happens on the FORM POST below — one deliberate press, not a fetch.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ token }, { done }, lang] = await Promise.all([params, searchParams, getLang()]);

  async function confirm(): Promise<void> {
    'use server';
    const { redirect } = await import('next/navigation');
    // The function is `security definer` and returns false for an unknown or
    // already-used token rather than raising, because the page says the same
    // thing either way — see below.
    await queryOne<{ unsubscribe_by_token: boolean }>(
      'select unsubscribe_by_token($1) as unsubscribe_by_token',
      [token],
    );
    redirect(`/unsubscribe/${token}?done=1`);
  }

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD</p>

        {done ? (
          <>
            <h1>{t(lang, 'unsub.doneTitle')}</h1>
            {/* ⚠ THE SAME MESSAGE WHETHER OR NOT A ROW MATCHED. A token that is
                unknown, already used, or belongs to a deleted account must not
                read differently from one that just worked: the difference would
                turn this URL into a way of testing whether a given token — and
                so a given customer — exists. It is also simply kinder. Somebody
                clicking twice has not failed at anything. */}
            <p className="lede">{t(lang, 'unsub.doneLede')}</p>
            <p className="muted">{t(lang, 'unsub.stillMember')}</p>
          </>
        ) : (
          <>
            <h1>{t(lang, 'unsub.title')}</h1>
            <p className="lede">{t(lang, 'unsub.lede')}</p>
            <form action={confirm}>
              <button type="submit" className="primary wide">
                {t(lang, 'unsub.confirm')}
              </button>
            </form>
            <p className="muted">{t(lang, 'unsub.note')}</p>
          </>
        )}
      </div>
    </div>
  );
}
