import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  ALLOWED_IMAGE_TYPES,
  REWARDS_MARK_CID,
  REWARDS_MARK_PNG_BASE64,
  emailHtml,
  esc,
  looksLikeImage,
  query,
  queryOne,
  sendMail,
  mailConfigured,
  unsubscribeUrl,
} from '@stackd/server';

import { ADMIN, requireRole, requireStaff } from '@/lib/auth.ts';
import { getLang } from '@/lib/prefs.ts';
import { t, tf, fmtDate } from '@/lib/i18n.ts';

export const metadata = { title: 'Promotions · STACKD admin' };
export const dynamic = 'force-dynamic';

const BACK = '/promotions';

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(message)}`);
}

interface Recipient {
  id: string;
  email: string;
  full_name: string | null;
  locale: string;
  unsubscribe_token: string;
}

interface Campaign {
  id: string;
  subject_en: string | null;
  subject_ar: string | null;
  created_at: Date;
  recipients: number;
  delivered: number;
  failed: number;
  sent_by_name: string | null;
}

/**
 * How many messages go out before pausing.
 *
 * ⚠ SMTP SERVERS RATE-LIMIT AND MXROUTE IS NO EXCEPTION. Firing several hundred
 * messages down one connection as fast as the loop can manage is what gets a
 * sending domain throttled or blocked, and the reputation that costs is the same
 * one the password-reset mail depends on. A shop this size will not notice the
 * pause; a blocklist would be noticed for weeks.
 */
const BATCH = 20;
const BATCH_PAUSE_MS = 1000;

/** Content-ID for the promotion's own picture, distinct from the brand mark. */
const PROMO_IMAGE_CID = 'stackd-promo-image';

/**
 * ⚠ SMALLER THAN THE MENU UPLOAD'S 4 MB, AND FOR A DIFFERENT REASON. A menu
 * photo is written to disk once. This one is base64'd into EVERY message, which
 * inflates it by about a third and then multiplies by the size of the list —
 * a 4 MB picture to 300 customers is over 1.5 GB through the SMTP server, and
 * Gmail clips messages over 102 KB of HTML and refuses very large ones outright.
 * 1 MB is generous for something read on a phone.
 */
const MAX_IMAGE_BYTES = 1024 * 1024;

/**
 * The attached picture, or null when none was chosen.
 *
 * ⚠ NEVER TRUSTS `file.type`. That is client-supplied; the bytes are checked
 * against the container's magic numbers, the same check the menu photo upload
 * makes and now literally the same function.
 */
async function readPromoImage(
  formData: FormData,
  lang: Awaited<ReturnType<typeof getLang>>,
): Promise<{ filename: string; base64: string } | null> {
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return null;

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) fail(t(lang, 'promo.errImageType'));
  if (file.size > MAX_IMAGE_BYTES) {
    fail(tf(lang, 'promo.errImageBig', { n: (file.size / 1024 / 1024).toFixed(1) }));
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(bytes, ext)) fail(t(lang, 'promo.errImageFake'));

  return { filename: `promotion.${ext}`, base64: bytes.toString('base64') };
}

/**
 * Sends the promotion.
 *
 * ⚠ ONE MESSAGE PER CUSTOMER, NEVER ONE MESSAGE WITH EVERYONE IN IT. A single
 * mail BCC'd to the whole list would be faster and is the obvious shortcut, but
 * it cannot carry a per-customer unsubscribe link, it puts the shop one
 * mis-click from publishing its entire customer list to itself, and bulk
 * recipients are a strong spam signal. Each customer gets their own.
 */
async function sendPromotion(formData: FormData): Promise<void> {
  'use server';
  // Manager or owner. Emailing every customer at once is a brand-level act, not
  // something a till session should be able to do by wandering into a URL.
  const staff = await requireRole(...ADMIN);
  const lang = await getLang();

  const subjectEn = String(formData.get('subjectEn') ?? '').trim();
  const bodyEn = String(formData.get('bodyEn') ?? '').trim();
  const subjectAr = String(formData.get('subjectAr') ?? '').trim();
  const bodyAr = String(formData.get('bodyAr') ?? '').trim();

  // ⚠ THE IMAGE IS READ BEFORE VALIDATION, because whether a body is required
  // depends on whether there is one. A promotion may be text, a picture, or
  // both — a shop announcing a new burger has an image and little to say.
  const picture = await readPromoImage(formData, lang);

  // A language is usable when it has a SUBJECT. Every email needs one: it is
  // what the customer sees on a lock screen, and a blank subject is both a spam
  // signal and unopenable. The body may be empty when a picture carries the
  // message.
  const hasEn = Boolean(subjectEn) && Boolean(bodyEn || picture);
  const hasAr = Boolean(subjectAr) && Boolean(bodyAr || picture);
  if (!hasEn && !hasAr) {
    fail(t(lang, picture ? 'promo.errNoSubject' : 'promo.errEmpty'));
  }

  // ⚠ Checked BEFORE anything is written or sent. Without SMTP this would
  // otherwise record a campaign that reached nobody and report success.
  if (!mailConfigured()) fail(t(lang, 'promo.errNoSmtp'));

  // ⚠ THE AUDIENCE IS RE-READ HERE, not taken from the count the page showed.
  // Someone may have unsubscribed between the page rendering and the button
  // being pressed, and the whole point of an unsubscribe is that it is obeyed.
  const audience = await query<Recipient>(
    `select id, email, full_name, locale, unsubscribe_token
       from customers
      where marketing_opt_in
        and email is not null
      order by created_at`,
  );
  if (audience.length === 0) fail(t(lang, 'promo.errNobody'));

  const campaign = await queryOne<{ id: string }>(
    `insert into email_campaigns
       (subject_en, body_en, subject_ar, body_ar, sent_by, recipients)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      hasEn ? subjectEn : null,
      hasEn ? bodyEn : null,
      hasAr ? subjectAr : null,
      hasAr ? bodyAr : null,
      staff.id,
      audience.length,
    ],
  );

  let delivered = 0;
  let failed = 0;

  for (let i = 0; i < audience.length; i += BATCH) {
    const slice = audience.slice(i, i + BATCH);

    await Promise.all(
      slice.map(async (person) => {
        // Their language when we have it, the other when we do not. Writing to
        // an Arabic customer in English because only English was filled in is
        // better than not writing at all; sending them a blank is not.
        const useAr = person.locale === 'ar' ? hasAr : !hasEn;
        const subject = useAr ? subjectAr : subjectEn;
        const body = useAr ? bodyAr : bodyEn;
        const dir = useAr ? 'rtl' : 'ltr';

        const unsubUrl = unsubscribeUrl(person.unsubscribe_token);
        const hello = person.full_name
          ? useAr
            ? `مرحباً ${person.full_name}،`
            : `Hi ${person.full_name},`
          : useAr
            ? 'مرحباً،'
            : 'Hi,';

        const unsubLabel = useAr ? 'إلغاء الاشتراك' : 'Unsubscribe';
        const footerNote = useAr
          ? 'تصلك هذه الرسالة لأنك مشترك في مكافآت ستاكد.'
          : 'You are receiving this because you joined STACKD Rewards.';

        try {
          await sendMail({
            to: person.email,
            subject,
            // ⚠ The plain-text part carries the unsubscribe URL too. A text-only
            // client that could not opt out would leave the customer with no way
            // off the list but marking the mail as spam.
            // ⚠ A text part that is only a greeting reads as broken. When the
            // promotion is a picture with no words, say so — a text-only client
            // shows this and nothing else.
            text:
              `${hello}\n\n` +
              `${body || (useAr ? '(الرسالة صورة مرفقة.)' : '(This message is a picture.)')}\n\n` +
              `—\n${footerNote}\n${unsubLabel}: ${unsubUrl}\n`,
            html: emailHtml({
              heading: subject,
              blocks: [
                { p: hello },
                // Blank paragraphs are dropped, so an image-only promotion does
                // not render an empty <p> under the greeting.
                ...body
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p) => ({ p })),
                ...(picture ? [{ image: { cid: PROMO_IMAGE_CID, alt: subject } }] : []),
              ],
              // esc() is applied to the parts, then the anchor is added — the
              // footer is the one place composed markup is intended.
              footer:
                `${esc(footerNote)}<br>` +
                `<a href="${esc(unsubUrl)}" style="color:#A8A69C;">${esc(unsubLabel)}</a>`,
              dir,
            }),
            images: [
              {
                cid: REWARDS_MARK_CID,
                filename: 'stackd-rewards.png',
                base64: REWARDS_MARK_PNG_BASE64,
              },
              ...(picture
                ? [
                    {
                      cid: PROMO_IMAGE_CID,
                      filename: picture.filename,
                      base64: picture.base64,
                    },
                  ]
                : []),
            ],
          });
          delivered += 1;
        } catch (err) {
          // ⚠ ONE BAD ADDRESS MUST NOT STOP THE SEND. A typo'd domain throws on
          // its own message; without this the loop would abort and everyone
          // after that person would silently get nothing.
          failed += 1;
          console.warn(
            `[promo] failed to ${person.email}: ${(err as Error)?.message ?? 'unknown'}`,
          );
        }
      }),
    );

    if (i + BATCH < audience.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  await query('update email_campaigns set delivered = $2, failed = $3 where id = $1', [
    campaign!.id,
    delivered,
    failed,
  ]);

  done(
    failed > 0
      ? tf(lang, 'promo.sentSome', { n: delivered, f: failed })
      : tf(lang, 'promo.sentAll', { n: delivered }),
  );
}

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  // The page guard, which is NOT the action guard above and is not the layout's
  // either — a Next layout renders concurrently with its page, so its redirect
  // does not stop this component running. See the note on the members page.
  const staff = await requireStaff();
  const lang = await getLang();
  const { ok, error } = await searchParams;
  const canSend = ADMIN.includes(staff.role);

  const counts = await queryOne<{ total: number; opted: number; mailable: number }>(
    `select count(*)::int as total,
            count(*) filter (where marketing_opt_in)::int as opted,
            count(*) filter (where marketing_opt_in and email is not null)::int as mailable
       from customers`,
  );

  const past = await query<Campaign>(
    `select c.id, c.subject_en, c.subject_ar, c.created_at,
            c.recipients, c.delivered, c.failed, s.full_name as sent_by_name
       from email_campaigns c
       left join staff s on s.id = c.sent_by
      order by c.created_at desc
      limit 20`,
  );

  const mailable = counts?.mailable ?? 0;

  return (
    <>
      <p className="eyebrow">{t(lang, 'promo.title')}</p>
      <h1>{t(lang, 'promo.heading')}</h1>
      <p className="lede">{t(lang, 'promo.lede')}</p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      {!mailConfigured() ? (
        <div className="banner bad">{t(lang, 'promo.noSmtp')}</div>
      ) : null}

      {/* ⚠ `<div>`, NOT `<span>`. `.stat .k/.v/.sub` are styled but never given
          a display, so they inherit it from the element — and inline spans run
          the label straight into the figure on one line: "WILL RECEIVE0The gap
          between…". The overview page has always used divs; this screen was the
          odd one out. Reported from a screenshot, in both languages.

          The long note moved out from under the first figure too. As a `.sub`
          it wrapped to four lines and made one card three times the height of
          its neighbours. */}
      <div className="grid">
        <div className="card stat">
          <div className="k">{t(lang, 'promo.willReceive')}</div>
          <div className="v num">{mailable}</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'promo.optedIn')}</div>
          <div className="v num">{counts?.opted ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'promo.members')}</div>
          <div className="v num">{counts?.total ?? 0}</div>
        </div>
      </div>
      <p className="muted sm">{t(lang, 'promo.audienceNote')}</p>

      {canSend ? (
        <div className="card">
          <h2>{t(lang, 'promo.compose')}</h2>
          <p className="muted sm">{t(lang, 'promo.composeNote')}</p>

          {/* encType is required for a file to arrive at all — without it the
              browser sends the filename as a string and the server sees no
              File. Server Actions accept multipart, but only if asked. */}
          <form action={sendPromotion} className="stack" encType="multipart/form-data">
            <div className="field">
              <label htmlFor="subjectAr">{t(lang, 'promo.subjectAr')}</label>
              <input
                id="subjectAr"
                name="subjectAr"
                type="text"
                lang="ar"
                dir="rtl"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="bodyAr">{t(lang, 'promo.bodyAr')}</label>
              <textarea id="bodyAr" name="bodyAr" lang="ar" dir="rtl" rows={6} />
            </div>

            <div className="field">
              <label htmlFor="subjectEn">{t(lang, 'promo.subjectEn')}</label>
              <input
                id="subjectEn"
                name="subjectEn"
                type="text"
                lang="en"
                dir="ltr"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="bodyEn">{t(lang, 'promo.bodyEn')}</label>
              <textarea id="bodyEn" name="bodyEn" lang="en" dir="ltr" rows={6} />
            </div>

            <div className="field">
              <label htmlFor="image">
                {t(lang, 'promo.image')} <span className="hint">{t(lang, 'promo.imageHint')}</span>
              </label>
              <input
                id="image"
                name="image"
                type="file"
                accept="image/webp,image/jpeg,image/png"
              />
            </div>

            <p className="muted sm">{tf(lang, 'promo.confirm', { n: mailable })}</p>
            <button type="submit" className="primary" disabled={mailable === 0}>
              {t(lang, 'promo.send')}
            </button>
          </form>
        </div>
      ) : (
        <div className="card">
          <p className="muted">{t(lang, 'promo.readOnly')}</p>
        </div>
      )}

      <div className="card">
        <h2>{t(lang, 'promo.past')}</h2>
        {past.length === 0 ? (
          <p className="empty">{t(lang, 'promo.noneYet')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t(lang, 'promo.thSubject')}</th>
                <th>{t(lang, 'promo.thWhen')}</th>
                <th>{t(lang, 'promo.thSent')}</th>
                <th>{t(lang, 'promo.thBy')}</th>
              </tr>
            </thead>
            <tbody>
              {past.map((c) => (
                <tr key={c.id}>
                  <td>{c.subject_ar ?? c.subject_en}</td>
                  {/* Asia/Riyadh explicitly, like every other date in the
                      portal: the container runs UTC, and a send that happened
                      at 1am local would otherwise be listed on the day before. */}
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {fmtDate(lang, c.created_at, {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Riyadh',
                    })}
                  </td>
                  <td className="num">
                    {c.delivered}
                    {c.failed > 0 ? (
                      <span className="muted"> · {tf(lang, 'promo.nFailed', { n: c.failed })}</span>
                    ) : null}
                  </td>
                  <td>{c.sent_by_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
