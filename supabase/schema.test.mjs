/**
 * Tests that supabase/schema.sql behaves the way its comments claim.
 *
 * Run against the local database built by `npm run db:reset`. These are not
 * unit tests of application code — they are assertions about Postgres itself:
 * that RLS is on, that policies bite, that the ledger reconciles, and that the
 * SQL and TypeScript halves of the money math still agree.
 *
 * If the database is unreachable these tests FAIL rather than skip. A schema
 * test that quietly passes because nothing ran is the exact failure mode
 * recorded in STATUS.md, where `node --test functions/` reported `# pass 1` with
 * a deliberately broken assertion in the file. Set STACKD_SKIP_DB_TESTS=1 to opt
 * out explicitly; there is no implicit escape.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

// Hand DATE back as a plain 'YYYY-MM-DD' string (oid 1082). node-postgres
// otherwise builds a JS Date at LOCAL midnight, and this machine runs
// Asia/Riyadh — so `.toISOString()` on a 2026-08-02 date yields 2026-08-01, and
// a correct service_date reads as an off-by-one.
pg.types.setTypeParser(1082, (v) => v);

import { connectionFor, DB_NAME } from '../scripts/db-reset.mjs';
import { MENU } from '../packages/shared/src/menu.ts';
import { pointsForOrder, splitVatInclusive } from '../packages/shared/src/money.ts';

const BRANCH = '00000000-0000-0000-0000-000000000001';
const CUSTOMER_1 = 'c0000000-0000-0000-0000-000000000001';
const CUSTOMER_2 = 'c0000000-0000-0000-0000-000000000002';
const CASHIER = 'a0000000-0000-0000-0000-000000000001';

let db;

const SKIP = process.env.STACKD_SKIP_DB_TESTS === '1';

/**
 * Every test in this file needs the database. Declaring the skip on each one is
 * what makes the opt-out real: returning early from the `before` hook still runs
 * all twenty, which then fail on an undefined client — a worse report than
 * either running or skipping.
 */
const dbTest = (name, fn) =>
  test(name, { skip: SKIP && 'STACKD_SKIP_DB_TESTS=1' }, fn);

before(async () => {
  if (SKIP) return;
  db = new pg.Client(connectionFor(DB_NAME));
  try {
    await db.connect();
  } catch (err) {
    throw new Error(
      `cannot reach ${DB_NAME}: ${err.message}\n` +
        '  Start Postgres and run `npm run db:reset` first.\n' +
        '  To run the rest of the suite without a database: STACKD_SKIP_DB_TESTS=1 npm test',
    );
  }
});

after(async () => {
  await db?.end();
});

/**
 * Runs fn inside a transaction that is always rolled back, so tests never leave
 * rows behind for each other to trip over.
 *
 * Nests via savepoints. A plain `begin` inside an open transaction is a no-op
 * that Postgres only warns about, so the inner `rollback` would discard the
 * OUTER transaction's work — including setup the test had just done. That
 * failure is silent and looks like a policy bug.
 */
let depth = 0;

async function beginNested() {
  await db.query(depth === 0 ? 'begin' : `savepoint sp_${depth}`);
  depth++;
}

async function rollbackNested() {
  depth--;
  await db.query(depth === 0 ? 'rollback' : `rollback to savepoint sp_${depth}`);
}

async function commitNested() {
  depth--;
  await db.query(depth === 0 ? 'commit' : `release savepoint sp_${depth}`);
}

async function withRollback(fn) {
  await beginNested();
  try {
    return await fn();
  } finally {
    await rollbackNested();
  }
}

/** Runs fn as a PostgREST role with auth.uid() bound, then rolls everything back. */
function asRole(role, uid, fn) {
  return withRollback(async () => {
    // Claims first: after `set local role`, the session is no longer privileged.
    if (uid) {
      await db.query(`set local request.jwt.claims = '${JSON.stringify({ sub: uid })}'`);
    }
    await db.query(`set local role ${role}`);
    // No `reset role` in a finally here. Several of these tests expect a query
    // to raise, which aborts the transaction — and then the cleanup itself fails
    // with 25P02, masking the real assertion error behind "current transaction
    // is aborted". The enclosing rollback undoes SET LOCAL ROLE anyway.
    return fn();
  });
}

/**
 * Asserts a query raises, and that the message mentions `contains`.
 *
 * Runs inside its own savepoint when already in a transaction. A failed
 * statement aborts the whole transaction, so a second expectation in the same
 * test would otherwise report 25P02 — "current transaction is aborted" — instead
 * of whatever it was actually checking.
 */
async function rejects(sql, params, contains) {
  const nested = depth > 0;
  if (nested) await beginNested();

  let raised;
  try {
    await db.query(sql, params);
  } catch (err) {
    raised = err;
  } finally {
    if (nested) await rollbackNested();
  }

  if (!raised) assert.fail(`expected the query to raise (${contains}), but it succeeded`);
  assert.match(
    raised.message,
    new RegExp(contains, 'i'),
    `raised, but with an unexpected message: ${raised.message}`,
  );
  return raised;
}

// ---------------------------------------------------------------------------
// 1. Row Level Security is on. Everywhere. No exceptions.
// ---------------------------------------------------------------------------

dbTest('every public table has RLS enabled', async () => {
  const { rows } = await db.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by c.relname
  `);
  // Behind PostgREST a table with RLS off is not merely readable — it is
  // WRITABLE with the anon key, which ships inside the app bundle. A previous
  // revision of this schema left seven tables off, tax_invoices among them.
  assert.deepEqual(
    rows.map((r) => r.relname),
    [],
    'these tables have RLS disabled and are world-writable behind PostgREST',
  );
});

dbTest('server-only tables have RLS on and deliberately no policy', async () => {
  const { rows } = await db.query(`
    select c.relname, count(p.polname)::int as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public'
      and c.relname in ('tax_invoices','invoice_counters','payments',
                        'pickup_code_counters','staff_credentials','order_claims')
    group by c.relname
    order by c.relname
  `);
  assert.equal(rows.length, 6);
  // Zero policies plus RLS on means deny-all except bypassrls. That is the
  // intended posture, so assert it rather than leaving it looking forgotten.
  for (const r of rows) {
    assert.equal(r.policies, 0, `${r.relname} grew a client policy — was that deliberate?`);
  }
});

// ---------------------------------------------------------------------------
// 2. is_branch_open() across the midnight wrap
//
// STACKD trades 15:00 → 03:00. The post-midnight stretch is peak trade, and the
// naive `now()::time between opens_at and closes_at` is false for every minute
// of it.
// ---------------------------------------------------------------------------

dbTest('is_branch_open handles the overnight window', async () => {
  // 2026-08-02 is a Sunday. All times given with an explicit +03 offset so the
  // test does not depend on the server's TimeZone setting.
  const cases = [
    ['2026-08-02 14:59:00+03', false, 'Sunday, one minute before opening'],
    ['2026-08-02 15:00:00+03', true, 'Sunday, on opening'],
    ['2026-08-02 23:30:00+03', true, 'Sunday evening'],
    ['2026-08-03 00:30:00+03', true, "past midnight, still Sunday's shift"],
    ['2026-08-03 02:59:00+03', true, 'one minute before close'],
    ['2026-08-03 03:00:00+03', false, 'on close'],
    ['2026-08-03 12:00:00+03', false, 'Monday midday, between shifts'],
    ['2026-08-03 16:00:00+03', true, "Monday's own shift"],
  ];

  for (const [at, expected, why] of cases) {
    const { rows } = await db.query('select is_branch_open($1, $2::timestamptz) as open', [
      BRANCH,
      at,
    ]);
    assert.equal(rows[0].open, expected, `${at} — ${why}`);
  }
});

dbTest('a closure covers the whole trading day, including the small hours', async () => {
  await beginNested();
  try {
    // Closing Sunday must also close Monday 00:00–03:00, because that stretch is
    // Sunday's trade. Closing the calendar day would leave the small hours open
    // with nobody in the kitchen.
    await db.query(
      `insert into branch_closures (branch_id, closed_on, reason_en)
       values ($1, date '2026-08-02', 'test')`,
      [BRANCH],
    );

    const check = async (at) =>
      (await db.query('select is_branch_open($1, $2::timestamptz) as open', [BRANCH, at]))
        .rows[0].open;

    assert.equal(await check('2026-08-02 20:00:00+03'), false, 'Sunday evening, closed');
    assert.equal(await check('2026-08-03 01:00:00+03'), false, "Monday small hours are Sunday's");
    assert.equal(await check('2026-08-03 20:00:00+03'), true, "Monday's own shift is unaffected");
  } finally {
    await rollbackNested();
  }
});

dbTest('riyadh_service_date rolls over at 04:00, not midnight', async () => {
  const { rows } = await db.query(`
    select riyadh_service_date(timestamptz '2026-08-03 01:30:00+03') as small_hours,
           riyadh_service_date(timestamptz '2026-08-03 16:00:00+03') as evening
  `);
  // A 01:30 order belongs to the previous evening's ticket numbering.
  assert.equal(rows[0].small_hours, '2026-08-02');
  assert.equal(rows[0].evening, '2026-08-03');
});

// ---------------------------------------------------------------------------
// 3. The money math agrees across the two languages it is written in
// ---------------------------------------------------------------------------

dbTest('SQL and TypeScript compute the same points, for every price on the menu', async () => {
  const prices = MENU.flatMap((c) => c.items.map((i) => i.price));
  // Plus realistic ticket totals, since a real order is several items.
  const totals = [...prices, 6000, 12345, 4999, 10000, 1, 99, 100];

  const { rows } = await db.query(
    'select g as gross, points_for_amount(g) as pts from unnest($1::int[]) as g',
    [totals],
  );

  for (const { gross, pts } of rows) {
    assert.equal(
      pts,
      pointsForOrder(gross),
      `points disagree for ${gross} halalas — schema.sql and money.ts have drifted`,
    );
  }
});

dbTest('the VAT check constraint matches splitVatInclusive exactly', async () => {
  // The constraint is what stops a wrong VAT figure reaching a tax filing, so it
  // has to agree with the implementation the app actually uses to a halala.
  for (const gross of [2700, 6000, 12345, 4999, 300, 1]) {
    const { vat } = splitVatInclusive(gross);
    const ok = await db.query(
      `insert into orders (customer_id, branch_id, status, subtotal, vat_total, grand_total)
       values ($1, $2, 'completed', $3, $4, $3) returning id`,
      [CUSTOMER_1, BRANCH, gross, vat],
    );
    assert.ok(ok.rows[0].id, `${gross} should satisfy the constraint at vat=${vat}`);

    await rejects(
      `insert into orders (customer_id, branch_id, status, subtotal, vat_total, grand_total)
       values ($1, $2, 'completed', $3, $4, $3)`,
      [CUSTOMER_1, BRANCH, gross, vat + 1],
      'order_vat_extracted_not_added',
    );
  }
  await db.query('delete from orders where customer_id = $1', [CUSTOMER_1]);
});

// ---------------------------------------------------------------------------
// 4. The loyalty ledger
// ---------------------------------------------------------------------------

async function makeOrder({ customer = CUSTOMER_1, gross = 6000, source = 'app', status = 'completed' } = {}) {
  const { vat } = splitVatInclusive(gross);
  const { rows } = await db.query(
    `insert into orders (customer_id, branch_id, source, status, subtotal, vat_total, grand_total)
     values ($1, $2, $3, $4, $5, $6, $5) returning id, pickup_code, service_date`,
    [customer, BRANCH, source, status, gross, vat],
  );
  return rows[0];
}

dbTest('balance always equals the sum of the ledger', async () => {
  await beginNested();
  try {
    const order = await makeOrder({ gross: 6000 });
    const { rows: minted } = await db.query('select mint_loyalty_points($1) as pts', [order.id]);

    // 60.00 SAR gross → 52.17 net → 52 points. Earned on the net, not the gross.
    assert.equal(minted[0].pts, 52);
    assert.equal(minted[0].pts, pointsForOrder(6000));

    const reward = (
      await db.query(`select id, points_cost from rewards where name_en = 'Free Sauce'`)
    ).rows[0];
    await db.query('select redeem_reward($1, $2)', [CUSTOMER_1, reward.id]);

    const { rows } = await db.query(
      `select b.balance, b.lifetime_earned,
              (select coalesce(sum(delta), 0) from loyalty_transactions t
                where t.customer_id = b.customer_id) as ledger_sum
         from loyalty_balances b where b.customer_id = $1`,
      [CUSTOMER_1],
    );
    assert.equal(rows[0].balance, 52 - reward.points_cost);
    assert.equal(Number(rows[0].ledger_sum), rows[0].balance, 'cached balance drifted from the ledger');
    assert.equal(rows[0].lifetime_earned, 52, 'a redemption must not reduce lifetime earned');
  } finally {
    await rollbackNested();
  }
});

dbTest('an order can only ever mint once', async () => {
  await beginNested();
  try {
    const order = await makeOrder();
    await db.query('select mint_loyalty_points($1)', [order.id]);
    // The retry that double-credits is always the one nobody wrote a test for.
    await rejects('select mint_loyalty_points($1)', [order.id], 'loyalty_tx_one_earn_per_order');
  } finally {
    await rollbackNested();
  }
});

dbTest('over-redemption fails with a message a cashier can read out', async () => {
  await beginNested();
  try {
    const reward = (
      await db.query(`select id from rewards where name_en = 'Free Classic-Stackd'`)
    ).rows[0];
    // 380 points against a zero balance.
    const err = await rejects(
      'select redeem_reward($1, $2)',
      [CUSTOMER_2, reward.id],
      'insufficient points',
    );
    assert.doesNotMatch(
      err.message,
      /check constraint/i,
      'should not surface the raw loyalty_balances constraint',
    );
  } finally {
    await rollbackNested();
  }
});

dbTest('expiry does not reset the inactivity clock it fired on', async () => {
  await beginNested();
  try {
    const order = await makeOrder();
    await db.query('select mint_loyalty_points($1)', [order.id]);
    await db.query(
      `update loyalty_balances set last_activity_at = now() - interval '18 months'
        where customer_id = $1`,
      [CUSTOMER_1],
    );

    const { rows } = await db.query('select expire_stale_points(12) as n');
    assert.equal(rows[0].n, 1);

    const after = (
      await db.query('select balance, last_activity_at from loyalty_balances where customer_id = $1', [
        CUSTOMER_1,
      ])
    ).rows[0];
    assert.equal(after.balance, 0);
    // If expiry counted as activity it would reset the clock it just fired on,
    // and the same points could never lapse a second time.
    assert.ok(
      after.last_activity_at < new Date(Date.now() - 300 * 24 * 3600 * 1000),
      'expiry must not count as customer activity',
    );
  } finally {
    await rollbackNested();
  }
});

// ---------------------------------------------------------------------------
// 4b. Per-item points and the bill QR
// ---------------------------------------------------------------------------

/** Adds one unit of `slug` to an order at the menu price. */
async function addLine(orderId, slug, quantity = 1) {
  await db.query(
    `insert into order_items (order_id, menu_item_id, name_en, name_ar,
                              unit_price, quantity, line_total)
     select $1, id, name_en, name_ar, price, $3, price * $3
       from menu_items where slug = $2`,
    [orderId, slug, quantity],
  );
}

dbTest('a fixed points_award overrides the per-riyal rate, per line', async () => {
  await withRollback(async () => {
    await db.query(`update menu_items set points_award = 200 where slug = 'scoopy-doo'`);
    const order = await makeOrder({ customer: null, source: 'pos', gross: 7300 });
    await addLine(order.id, 'scoopy-doo'); // flat 200
    await addLine(order.id, 'big-stackd'); // 48.00 by value

    const { rows } = await db.query('select points_for_order($1) as pts', [order.id]);
    // The flat award ignores the 25.00 price entirely; the other line does not.
    assert.equal(rows[0].pts, 200 + pointsForOrder(4800));
  });
});

dbTest('quantity multiplies a fixed award', async () => {
  await withRollback(async () => {
    await db.query(`update menu_items set points_award = 50 where slug = 'fries'`);
    const order = await makeOrder({ customer: null, source: 'pos', gross: 2700 });
    await addLine(order.id, 'fries', 3);
    const { rows } = await db.query('select points_for_order($1) as pts', [order.id]);
    assert.equal(rows[0].pts, 150);
  });
});

dbTest('an order with no line items still earns on its total', async () => {
  await withRollback(async () => {
    // Every POS integration until someone writes one sends a ticket total and
    // nothing else. That must not silently earn zero.
    const order = await makeOrder({ customer: null, source: 'pos', gross: 6000 });
    const { rows } = await db.query('select points_for_order($1) as pts', [order.id]);
    assert.equal(rows[0].pts, pointsForOrder(6000));
  });
});

dbTest('the earn rate is a setting, not a constant', async () => {
  await withRollback(async () => {
    const order = await makeOrder({ customer: null, source: 'pos', gross: 6000 });
    await db.query('update loyalty_settings set points_per_riyal = 2');
    const { rows } = await db.query('select points_for_order($1) as pts', [order.id]);
    assert.equal(rows[0].pts, pointsForOrder(6000, 2));
  });
});

dbTest('reprinting a receipt reissues the same code, never a second claim', async () => {
  await withRollback(async () => {
    const order = await makeOrder({ customer: null, source: 'pos', gross: 6000 });
    const first = (await db.query('select issue_order_claim($1) as t', [order.id])).rows[0].t;
    const again = (await db.query('select issue_order_claim($1) as t', [order.id])).rows[0].t;
    assert.equal(first, again, 'a reprint must not mint a second claim on one sale');
    assert.match(first, /^[2-9A-HJ-NP-Z]{10}$/, 'no 0/O/1/I/L — it gets typed off a creased receipt');

    const { rows } = await db.query('select count(*)::int as n from order_claims where order_id = $1', [
      order.id,
    ]);
    assert.equal(rows[0].n, 1);
  });
});

dbTest('claiming a bill QR credits the member and links the sale to them', async () => {
  await withRollback(async () => {
    const order = await makeOrder({ customer: null, source: 'pos', gross: 6000 });
    const token = (await db.query('select issue_order_claim($1) as t', [order.id])).rows[0].t;

    const claimed = (
      await db.query('select claim_order_points($1, $2) as pts', [token, CUSTOMER_2])
    ).rows[0].pts;
    assert.equal(claimed, pointsForOrder(6000));

    const after = (
      await db.query(
        `select o.customer_id, b.balance
           from orders o join loyalty_balances b on b.customer_id = $2
          where o.id = $1`,
        [order.id, CUSTOMER_2],
      )
    ).rows[0];
    // The sale was anonymous when it was rung up. Claiming is the only moment
    // the link between ticket and member can be made.
    assert.equal(after.customer_id, CUSTOMER_2);
    assert.equal(after.balance, claimed);
  });
});

dbTest('a bill QR can only be claimed once', async () => {
  await withRollback(async () => {
    const order = await makeOrder({ customer: null, source: 'pos', gross: 6000 });
    const token = (await db.query('select issue_order_claim($1) as t', [order.id])).rows[0].t;
    await db.query('select claim_order_points($1, $2)', [token, CUSTOMER_2]);
    await rejects(
      'select claim_order_points($1, $2)',
      [token, CUSTOMER_1],
      'already been claimed',
    );
  });
});

dbTest('an expired or unknown code is refused', async () => {
  await withRollback(async () => {
    const order = await makeOrder({ customer: null, source: 'pos', gross: 6000 });
    const token = (await db.query('select issue_order_claim($1) as t', [order.id])).rows[0].t;
    await db.query(`update order_claims set expires_at = now() - interval '1 day'`);
    await rejects('select claim_order_points($1, $2)', [token, CUSTOMER_2], 'expired');
    await rejects('select claim_order_points($1, $2)', ['NOTATOKEN1', CUSTOMER_2], 'not one of ours');
  });
});

dbTest('an order that already credited a member cannot also issue a QR', async () => {
  await withRollback(async () => {
    const order = await makeOrder({ customer: CUSTOMER_1, gross: 6000 });
    await db.query('select mint_loyalty_points($1)', [order.id]);
    // Otherwise one sale pays out twice: once to the member at the till, and
    // again to whoever picks the receipt up off the table.
    await rejects('select issue_order_claim($1)', [order.id], 'already earned');
  });
});

// ---------------------------------------------------------------------------
// 5. Walk-in / POS orders
// ---------------------------------------------------------------------------

dbTest('a walk-in ticket needs no customer and no payment record', async () => {
  await beginNested();
  try {
    const order = await makeOrder({ customer: null, source: 'pos', gross: 2700 });
    assert.match(order.pickup_code, /^\d{3}$/, 'pickup code is assigned by trigger');

    // Nothing to credit, and that is not an error — most walk-ins are anonymous.
    const { rows } = await db.query('select mint_loyalty_points($1) as pts', [order.id]);
    assert.equal(rows[0].pts, 0);
  } finally {
    await rollbackNested();
  }
});

dbTest('an app order without a customer is rejected, a POS one is not', async () => {
  await rejects(
    `insert into orders (customer_id, branch_id, source, status, subtotal, vat_total, grand_total)
     values (null, $1, 'app', 'paid', 2700, 352, 2700)`,
    [BRANCH],
    'app_orders_have_a_customer',
  );
  await rejects(
    `insert into orders (customer_id, branch_id, source, status, subtotal, vat_total, grand_total)
     values (null, $1, 'pos', 'pending_payment', 2700, 352, 2700)`,
    [BRANCH],
    'pos_orders_are_already_paid',
  );
});

dbTest('pickup codes are sequential per branch per trading day', async () => {
  await beginNested();
  try {
    const a = await makeOrder({ customer: null, source: 'pos' });
    const b = await makeOrder({ customer: null, source: 'pos' });
    assert.equal(Number(b.pickup_code), Number(a.pickup_code) + 1);
    assert.equal(a.service_date, b.service_date);
  } finally {
    await rollbackNested();
  }
});

// ---------------------------------------------------------------------------
// 6. The policies actually bite
//
// Everything above runs as the owner, which RLS does not apply to. These run as
// the roles PostgREST hands a real request.
// ---------------------------------------------------------------------------

dbTest('a customer cannot read another customer\'s orders', async () => {
  await beginNested();
  const mine = await makeOrder({ customer: CUSTOMER_1 });
  const theirs = await makeOrder({ customer: CUSTOMER_2 });
  await commitNested();

  try {
    await asRole('authenticated', CUSTOMER_1, async () => {
      const { rows } = await db.query('select id from orders where id = any($1::uuid[])', [
        [mine.id, theirs.id],
      ]);
      assert.deepEqual(rows.map((r) => r.id), [mine.id]);
    });

    // Staff at the branch see both — this is the kitchen display's whole query.
    await asRole('authenticated', CASHIER, async () => {
      const { rows } = await db.query('select id from orders where id = any($1::uuid[])', [
        [mine.id, theirs.id],
      ]);
      assert.equal(rows.length, 2);
    });

    await asRole('anon', null, async () => {
      const { rows } = await db.query('select id from orders');
      assert.equal(rows.length, 0, 'anonymous visitors must see no orders at all');
    });
  } finally {
    await db.query('delete from orders where id = any($1::uuid[])', [[mine.id, theirs.id]]);
  }
});

dbTest('nobody but the server can write the loyalty ledger', async () => {
  await asRole('authenticated', CUSTOMER_1, async () => {
    // No insert policy exists, so this is a silent zero-row write, not an error.
    // Asserting on the row count is the only way to catch it.
    const res = await db.query(
      `insert into loyalty_transactions (customer_id, delta, reason)
       values ($1, 1000000, 'signup_bonus') on conflict do nothing`,
      [CUSTOMER_1],
    ).catch((err) => err);
    assert.ok(
      res instanceof Error || res.rowCount === 0,
      'a client minted points into the ledger',
    );
  });
});

dbTest('mint_loyalty_points is not executable by a client', async () => {
  await beginNested();
  const order = await makeOrder();
  await commitNested();

  try {
    await asRole('authenticated', CUSTOMER_1, async () => {
      // The grant is the enforcement. "Server-side only" was a comment in the
      // previous revision, which is not a control.
      await rejects('select mint_loyalty_points($1)', [order.id], 'permission denied');
    });
  } finally {
    await db.query('delete from orders where id = $1', [order.id]);
  }
});

dbTest('menu items disappear with their category', async () => {
  await beginNested();
  try {
    await asRole('anon', null, async () => {
      const { rows } = await db.query(`
        select count(*)::int as n from menu_items mi
        join categories c on c.id = mi.category_id where c.slug = 'sauces'
      `);
      assert.equal(rows[0].n, 4);
    });

    await db.query(`update categories set is_active = false where slug = 'sauces'`);

    await asRole('anon', null, async () => {
      const { rows } = await db.query(`select count(*)::int as n from menu_items`);
      // Checking is_active on the item alone lets a deactivated category keep
      // serving its items to anyone who asks for them by id.
      const total = MENU.flatMap((c) => c.items).length;
      const sauces = MENU.find((c) => c.slug === 'sauces').items.length;
      assert.equal(rows[0].n, total - sauces);
    });
  } finally {
    await rollbackNested();
  }
});

dbTest('a cashier resolves a member code without reading the customer table', async () => {
  await asRole('authenticated', CASHIER, async () => {
    const { rows } = await db.query('select * from find_member($1)', ['DEV22222']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].customer_id, CUSTOMER_1);

    // The function returns the name to confirm out loud, and nothing else. A
    // blanket staff read policy would have exposed every phone number and
    // birthday in the database to every till.
    assert.deepEqual(Object.keys(rows[0]).sort(), ['customer_id', 'full_name']);

    const direct = await db.query('select count(*)::int as n from customers');
    assert.equal(direct.rows[0].n, 0, 'staff must not have blanket read on customers');
  });
});

dbTest('a customer cannot resolve member codes at all', async () => {
  await asRole('authenticated', CUSTOMER_2, async () => {
    const { rows } = await db.query('select * from find_member($1)', ['DEV22222']);
    assert.equal(rows.length, 0, 'find_member is gated on the caller being active staff');
  });
});
