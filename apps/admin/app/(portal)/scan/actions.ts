'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { parseRiyals, query, queryOne } from '@stackd/server';

import { requireStaff } from '@/lib/auth.ts';

const BACK = '/scan';

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

/**
 * Works out what a scanned code is, and routes accordingly.
 *
 * Three kinds of code exist and they are told apart by lookup, not by shape.
 * Deriving meaning from length would be brittle the first time a format
 * changes, and the tables are the authority anyway:
 *
 *   member code       -> a customer wants points for a bill
 *   redemption token  -> a customer wants points taken off a bill
 *   bill claim token  -> a receipt QR someone is claiming at the counter
 */
export async function identify(formData: FormData): Promise<void> {
  await requireStaff();
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase();
  if (!code) fail('Nothing was scanned.');

  const member = await queryOne<{ id: string }>(
    'select id from customers where member_code = $1',
    [code],
  );
  if (member) redirect(`${BACK}?member=${code}`);

  const redemption = await queryOne<{ token: string }>(
    'select token from redemption_tokens where token = $1',
    [code],
  );
  if (redemption) redirect(`${BACK}?redeem=${code}`);

  const claim = await queryOne<{ token: string }>(
    'select token from order_claims where token = $1',
    [code],
  );
  if (claim) redirect(`${BACK}?claim=${code}`);

  fail(`"${code}" is not a code we recognise. Check it and try again.`);
}

/**
 * Credits a member for a bill.
 *
 * Writes a real POS order and mints against it, rather than inserting a bare
 * ledger row. That keeps every point traceable to a ticket, reuses the earn
 * calculation the rest of the system uses, and means the double-mint guard
 * applies here too.
 */
export async function creditBill(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const memberCode = String(formData.get('memberCode') ?? '').trim().toUpperCase();
  const billRaw = String(formData.get('bill') ?? '').trim();

  const member = await queryOne<{ id: string; full_name: string | null }>(
    'select id, full_name from customers where member_code = $1',
    [memberCode],
  );
  if (!member) fail('That member no longer exists.');

  let gross: number;
  try {
    gross = parseRiyals(billRaw);
  } catch (err) {
    redirect(
      `${BACK}?member=${memberCode}&error=${encodeURIComponent(
        err instanceof Error ? err.message : 'That is not an amount.',
      )}`,
    );
  }
  if (gross <= 0) {
    redirect(`${BACK}?member=${memberCode}&error=${encodeURIComponent('Enter the bill total.')}`);
  }

  const branch = await queryOne<{ id: string }>('select id from branches order by created_at limit 1');
  if (!branch) fail('No branch is configured.');

  // VAT is stored for the record even though earning ignores it: the order row
  // is a real ticket and its totals have to reconcile like any other.
  const vat = Math.round(gross - gross / 1.15);

  const order = await queryOne<{ id: string }>(
    `insert into orders (customer_id, branch_id, source, status,
                         subtotal, vat_total, grand_total)
     values ($1, $2, 'pos', 'completed', $3, $4, $3)
     returning id`,
    [member.id, branch.id, gross, vat],
  );

  const minted = await queryOne<{ pts: number }>('select mint_loyalty_points($1) as pts', [
    order!.id,
  ]);

  revalidatePath(BACK);
  redirect(
    `${BACK}?ok=${encodeURIComponent(
      `${minted?.pts ?? 0} points added for ${member.full_name ?? memberCode}.`,
    )}`,
  );
}

/**
 * Takes points off a bill.
 *
 * All the checking lives in redeem_points_token: expiry, single use, and the
 * balance. Doing any of it here would be a race with the customer's own phone.
 */
export async function takePoints(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const token = String(formData.get('token') ?? '').trim().toUpperCase();

  try {
    const out = await queryOne<{ points: number; customer_name: string | null }>(
      'select * from redeem_points_token($1, $2)',
      [token, staff.id],
    );
    const riyals = ((out?.points ?? 0) / 100).toFixed(2);
    revalidatePath(BACK);
    redirect(
      `${BACK}?ok=${encodeURIComponent(
        `Take ${riyals} SAR off the bill. ${out?.points ?? 0} points deducted from ${
          out?.customer_name ?? 'the member'
        }.`,
      )}`,
    );
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    fail(err instanceof Error ? err.message.replace(/^[^:]*:\s*/, '') : 'Could not redeem that code.');
  }
}

/** Attaches a receipt's points to a member, when they present both at the counter. */
export async function claimForMember(formData: FormData): Promise<void> {
  await requireStaff();
  const token = String(formData.get('token') ?? '').trim().toUpperCase();
  const memberCode = String(formData.get('memberCode') ?? '').trim().toUpperCase();

  const member = await queryOne<{ id: string; full_name: string | null }>(
    'select id, full_name from customers where member_code = $1',
    [memberCode],
  );
  if (!member) {
    redirect(`${BACK}?claim=${token}&error=${encodeURIComponent(`No member with code ${memberCode}.`)}`);
  }

  try {
    const out = await queryOne<{ pts: number }>('select claim_order_points($1, $2) as pts', [
      token,
      member.id,
    ]);
    revalidatePath(BACK);
    redirect(
      `${BACK}?ok=${encodeURIComponent(
        `${out?.pts ?? 0} points added to ${member.full_name ?? memberCode}.`,
      )}`,
    );
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    fail(err instanceof Error ? err.message.replace(/^[^:]*:\s*/, '') : 'Could not claim that receipt.');
  }
}
