-- 0007 — "lifetime earned" counts buying, not gifts
--
-- Reported from production on 12 Aug 2026: a customer who had just joined and
-- bought nothing showed 100 lifetime points. The 100 is the welcome bonus.
--
-- apply_loyalty_transaction() added `greatest(new.delta, 0)` to lifetime_earned
-- for EVERY positive ledger row, so the welcome bonus, a birthday bonus and a
-- manager's goodwill credit all counted as something the customer had earned.
-- The portal shows this figure as "earned since you joined" and the admin as
-- "earned all time", and neither sentence was true.
--
-- ⚠ THE NEW RULE: lifetime_earned is the NET of 'earn_purchase' and
-- 'order_refund', and nothing else.
--
-- Those two are one idea, not two. `order_refund` exists to claw back the points
-- an order earned when that order is refunded, so leaving it out would let a
-- customer refund every purchase they ever made and keep a lifetime figure
-- saying they had earned it. Summing both deltas is exactly "what buying has
-- earned this customer, net of the buying that was undone" — earn_purchase is
-- positive, order_refund is negative, so the sum is the whole rule.
--
-- Deliberately NOT counted: signup_bonus, birthday_bonus, manual_adjust. All
-- three are gifts. A gift is not something you earned, and counting it inflates
-- the one number that answers "how much has this customer actually spent with
-- us". redeem_reward, redeem_counter and expiry were never counted and still are
-- not: spending points does not un-earn them.
--
-- ⚠ `balance` IS UNTOUCHED. Nobody's spendable points change. This migration
-- only rewrites a display figure. A customer who reads their own points page
-- during the deploy sees the balance they had before and after.
--
-- Two steps: the trigger function for every row from here on, then a rebuild of
-- every existing row from the ledger. The ledger is complete and is the source
-- of truth for exactly this reason, so the rebuild is arithmetic, not an
-- estimate.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0007_lifetime_earned_purchases_only.sql
--
-- Safe to run twice. The rebuild is idempotent by construction — it computes an
-- absolute value from the ledger rather than adjusting the current one, so
-- running it ten times gives the same answer as running it once.

-- ⚠ DO NOT "simplify" THIS BACK INTO AN UPSERT. See the comment on this function
-- in schema.sql: Postgres evaluates CHECK constraints on the proposed row before
-- it detects a conflict, so an upsert trips `balance >= 0` on every debit even
-- when the row plainly exists with enough points in it.
create or replace function apply_loyalty_transaction()
returns trigger language plpgsql as $$
begin
  insert into loyalty_balances (customer_id)
  values (new.customer_id)
  on conflict (customer_id) do nothing;

  update loyalty_balances set
    balance          = balance + new.delta,
    -- Buying only. earn_purchase is positive and order_refund is negative, so
    -- adding both deltas nets a refund back out of the total. greatest(0, ...)
    -- guards the one case the ledger permits but nothing produces: a clawback
    -- arriving without the earn it reverses.
    lifetime_earned  = greatest(0, lifetime_earned + case
                         when new.reason in ('earn_purchase', 'order_refund')
                         then new.delta
                         else 0
                       end),
    -- Expiry is not activity. Counting it would reset the clock it just fired
    -- on, and the same points would never lapse twice.
    last_activity_at = case when new.reason = 'expiry' then last_activity_at else now() end,
    updated_at       = now()
  where customer_id = new.customer_id;

  return new;
end $$;

-- Rebuild every existing row from the ledger under the new rule.
--
-- `updated_at` is deliberately NOT touched. It records when a customer's points
-- last moved, and nobody's points are moving here — bumping it would make every
-- member look active on the day of this migration, which is the input to the
-- expiry sweep.
update loyalty_balances b set
  lifetime_earned = greatest(0, coalesce((
    select sum(t.delta)
      from loyalty_transactions t
     where t.customer_id = b.customer_id
       and t.reason in ('earn_purchase', 'order_refund')
  ), 0))
where b.lifetime_earned is distinct from greatest(0, coalesce((
    select sum(t.delta)
      from loyalty_transactions t
     where t.customer_id = b.customer_id
       and t.reason in ('earn_purchase', 'order_refund')
  ), 0));

comment on column loyalty_balances.lifetime_earned is
  'Net points earned by BUYING: earn_purchase plus order_refund, nothing else. '
  'Gifts (signup_bonus, birthday_bonus, manual_adjust) are excluded on purpose — '
  'the portal calls this "earned since you joined" and a welcome bonus is not '
  'something the customer earned. Rebuildable from loyalty_transactions at any '
  'time; see migration 0007.';

-- Report what moved, so the deploy log says whether this did anything.
do $$
declare
  wrong int;
begin
  select count(*) into wrong
    from loyalty_balances b
   where b.lifetime_earned is distinct from greatest(0, coalesce((
           select sum(t.delta) from loyalty_transactions t
            where t.customer_id = b.customer_id
              and t.reason in ('earn_purchase', 'order_refund')
         ), 0));

  raise notice 'lifetime_earned rows still disagreeing with the ledger: % (must be 0)', wrong;
end $$;
