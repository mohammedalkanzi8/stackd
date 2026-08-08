-- 0002 — spending points at the counter gets its own reason
--
-- Until now `redeem_points_token()` wrote reason `manual_adjust`, which is also
-- what a manager writes when correcting someone's balance by hand. Those are
-- different events — one is a customer spending money's worth, the other is an
-- internal fix — and the ledger could not tell them apart. Anything asking
-- "what has the loyalty programme cost us" had to fall back on matching the
-- note text, which is a fragile way to price a liability.
--
-- After this, `redeem_counter` says it outright.
--
-- ⚠ DO NOT run this with `psql -1` or `--single-transaction`.
--
--    `ALTER TYPE ... ADD VALUE` cannot be USED in the same transaction that
--    added it — Postgres raises `unsafe use of new value "redeem_counter"`,
--    with a hint that new enum values must be committed first. Verified against
--    Postgres 18.4. That is why step 1 below sits outside the transaction, and
--    why the apply command relies on psql's default autocommit.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 < supabase/migrations/0002_redeem_counter.sql
--
-- Safe to run twice: the enum add is `if not exists`, the function is
-- `create or replace`, the backfill matches nothing on a second run, and the
-- constraint is dropped before it is added.
--
-- If step 2 fails, only the enum value has been added. That is harmless on its
-- own — nothing writes it yet — and re-running the file picks up where it left
-- off.

-- ---------------------------------------------------------------------------
-- 1. The new reason. Must be committed before anything can use it.
-- ---------------------------------------------------------------------------

-- `after 'redeem_reward'` so that a database migrated with this file and one
-- built fresh from schema.sql end up with the same enum ORDER, not merely the
-- same set of values. Appending instead would leave `order by reason` sorting
-- differently on the two, which is the kind of divergence that surfaces years
-- later in a report nobody can reconcile.
--
-- Note for anyone diffing the two: `pg_enum.enumsortorder` will read 2.5 here
-- and 3 on a fresh build. That is how ADD VALUE slots a label in without
-- rewriting the type, and it is internal — `order by` and the comparison
-- operators give identical answers on both. Compare `enum_range()`, not
-- `enumsortorder`.
alter type loyalty_reason add value if not exists 'redeem_counter' after 'redeem_reward';

-- ---------------------------------------------------------------------------
-- 2. Everything that uses it.
-- ---------------------------------------------------------------------------

begin;

-- The only change is the reason written. The note stays: it is what the member
-- sees in their own history, and the rows backfilled below keep theirs, so
-- dropping it here would make old and new redemptions look different for no
-- gain.
create or replace function redeem_points_token(p_token text, p_staff_id uuid)
returns table (points int, customer_id uuid, customer_name text, member_code text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t redemption_tokens%rowtype;
begin
  select * into t from redemption_tokens
   where token = upper(trim(p_token)) for update;

  if not found then
    raise exception 'that code is not one of ours';
  end if;
  if t.redeemed_at is not null then
    raise exception 'those points have already been taken off a bill';
  end if;
  if t.expires_at < now() then
    raise exception 'that code expired, ask them to generate a new one';
  end if;

  update redemption_tokens
     set redeemed_at = now(), redeemed_by = p_staff_id
   where token = t.token;

  -- The ledger write is what actually spends them, and the balance check
  -- constraint is the backstop if the balance moved since the code was issued.
  insert into loyalty_transactions (customer_id, delta, reason, actor_id, note)
  values (t.customer_id, -t.points, 'redeem_counter', p_staff_id,
          format('Redeemed %s points at the counter', t.points));

  return query
    select t.points, t.customer_id, c.full_name, c.member_code
    from customers c where c.id = t.customer_id;
end $$;

-- Reclassify the redemptions already in the ledger.
--
-- The note is not free text on this path — the old function built it with a
-- fixed `format()` string — so the pattern identifies exactly the rows that
-- function wrote. `actor_id is not null` is belt and braces: every one of them
-- recorded the cashier who scanned, and it also means a row that somehow did
-- not is left behind for a human rather than failing the constraint below and
-- rolling back the whole migration.
--
-- This is an UPDATE, so the AFTER INSERT trigger on this table does not fire
-- and no balance moves. Neither partial unique index covers manual_adjust, so
-- nothing collides.
update loyalty_transactions
   set reason = 'redeem_counter'
 where reason = 'manual_adjust'
   and delta < 0
   and actor_id is not null
   and note like 'Redeemed % points at the counter';

-- A counter redemption always has the cashier who scanned it. Without this the
-- new reason would be weaker than the manual_adjust it replaces, which required
-- an actor.
alter table loyalty_transactions
  drop constraint if exists counter_redemptions_need_an_actor;
alter table loyalty_transactions
  add constraint counter_redemptions_need_an_actor
    check (reason <> 'redeem_counter' or actor_id is not null);

commit;

-- ---------------------------------------------------------------------------
-- 3. What happened.
-- ---------------------------------------------------------------------------
--
-- `left_behind` must be 0. Anything else is a counter redemption this file
-- could not identify, which stays readable only through the note-matching
-- fallback the admin reports page still carries — do not delete that fallback
-- while this number is above zero anywhere.
select count(*) filter (where reason = 'redeem_counter')            as counter_redemptions,
       count(*) filter (where reason = 'manual_adjust' and delta < 0
                          and note like 'Redeemed % points at the counter') as left_behind
  from loyalty_transactions;
