-- 0008 — claiming a reward gives the customer a code, and stops taking the
--        points before anybody hands anything over
--
-- Reported from production 13 Aug 2026: claiming Free Sauce took 300 points and
-- showed no code. The customer was left with nothing to present and no way to
-- get the points back.
--
-- ⚠ THE TWO REDEMPTION PATHS WERE ASYMMETRIC IN THE WORST DIRECTION.
--
--   issue_redemption()  reserves points and writes NO ledger row. The row is
--                       written when the cashier scans. An abandoned code costs
--                       the customer nothing — which the schema comment states
--                       outright, because most codes are abandoned.
--
--   redeem_reward()     wrote the ledger row IMMEDIATELY and issued NO token.
--                       An abandoned claim cost the customer everything, and
--                       even a completed one gave them nothing to show.
--
-- The portal's own banner said "Claimed. Show your code at the counter" while
-- there was no code to show. That sentence is the clearest statement of the bug.
--
-- This makes a reward claim work the way spending points already does: issue a
-- token, deduct when it is scanned.
--
-- ⚠ THE MINIMUM-REDEEM FLOOR DOES NOT APPLY HERE, DELIBERATELY, and this
-- function is where that is enforced by being absent. `min_redeem_points` exists
-- so a cashier is not asked to knock 3 halalas off a bill. A catalogue reward is
-- priced individually — Free Sauce at 300 against a 500 floor — and applying the
-- floor would leave rewards listed and unclaimable, which reads as a broken app
-- rather than a rule. Confirmed by the owner, twice.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0008_reward_redemption_tokens.sql
--
-- Safe to run twice.

-- A token can now stand for a reward instead of a number of points. Nullable,
-- because the counter path still issues plain points tokens.
alter table redemption_tokens
  add column if not exists reward_id uuid references rewards(id);

comment on column redemption_tokens.reward_id is
  'Set when this code is a catalogue reward rather than points off a bill. '
  'The points column still carries the cost, so the ledger maths is identical; '
  'this only records WHAT was claimed so the cashier knows what to hand over.';

-- ---------------------------------------------------------------------------
-- Issuing a reward code
-- ---------------------------------------------------------------------------
create or replace function issue_reward_redemption(p_customer_id uuid, p_reward_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r    rewards%rowtype;
  bal  int;
  secs int;
  tok  text;
begin
  select * into r from rewards where id = p_reward_id and is_active;
  if not found then
    raise exception 'reward % not found or inactive', p_reward_id;
  end if;
  if (r.starts_at is not null and now() < r.starts_at)
     or (r.ends_at is not null and now() > r.ends_at) then
    raise exception 'reward % is not currently available', r.name_en;
  end if;

  select balance into bal from loyalty_balances
   where customer_id = p_customer_id for update;

  if coalesce(bal, 0) < r.points_cost then
    raise exception 'insufficient points: have %, need %', coalesce(bal, 0), r.points_cost;
  end if;

  -- ⚠ NO min_redeem_points CHECK. See the header. A reward is priced on its own
  -- and the floor is about counter change, not about the catalogue.

  -- Superseded, not kept — the same rule as issue_redemption(). A customer with
  -- two live codes could screenshot one and spend the same points twice, and the
  -- partial unique index would refuse the insert anyway.
  delete from redemption_tokens
   where customer_id = p_customer_id and redeemed_at is null;

  select redeem_window_secs into secs from loyalty_settings;

  -- Same retry loop as issue_redemption(): the token alphabet is short enough
  -- that a collision is possible, and a unique_violation on the primary key is
  -- the cheapest way to detect one.
  loop
    tok := generate_claim_token();
    begin
      insert into redemption_tokens (token, customer_id, points, reward_id, expires_at)
      values (tok, p_customer_id, r.points_cost, p_reward_id,
              now() + make_interval(secs => coalesce(secs, 180)));
      return tok;
    exception when unique_violation then
      -- Token collision only. Try again.
    end;
  end loop;
end $$;

revoke all on function issue_reward_redemption(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Scanning it
-- ---------------------------------------------------------------------------
-- ⚠ The return type gains a column, and Postgres will not let `create or
-- replace` change a function's return type. It has to be dropped first. Nothing
-- else references it by signature, and the app is deployed with the migration.
drop function if exists redeem_points_token(text, uuid);

create function redeem_points_token(p_token text, p_staff_id uuid)
returns table (
  points        int,
  customer_id   uuid,
  customer_name text,
  member_code   text,
  reward_name   text,
  reward_name_ar text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t redemption_tokens%rowtype;
  r rewards%rowtype;
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

  if t.reward_id is not null then
    select * into r from rewards where id = t.reward_id;

    -- Reason `redeem_reward`, not `redeem_counter`: the reports page separates
    -- what the catalogue costs from what customers knock off bills, and folding
    -- the two together would make both figures meaningless.
    insert into loyalty_transactions (customer_id, delta, reason, reward_id, actor_id, note)
    values (t.customer_id, -t.points, 'redeem_reward', t.reward_id, p_staff_id,
            format('Claimed %s at the counter', r.name_en));
  else
    insert into loyalty_transactions (customer_id, delta, reason, actor_id, note)
    values (t.customer_id, -t.points, 'redeem_counter', p_staff_id,
            format('Redeemed %s points at the counter', t.points));
  end if;

  return query
    select t.points, t.customer_id, c.full_name, c.member_code,
           r.name_en, r.name_ar
      from customers c where c.id = t.customer_id;
end $$;

revoke all on function redeem_points_token(text, uuid) from public;

-- ---------------------------------------------------------------------------
-- Put back what the broken path took
-- ---------------------------------------------------------------------------
-- ⚠ Every reward claim made before this migration spent points and produced
-- nothing. Those customers are owed the points back. This credits each one once,
-- as `manual_adjust` against the owner, so the correction is visible in the
-- ledger and in the customer's own history rather than being a silent rewrite.
--
-- Idempotent: the note is matched before inserting, so re-running adds nothing.
do $$
declare
  owner_id uuid;
  n int := 0;
  rec record;
begin
  select s.id into owner_id from staff s where s.role = 'owner' and s.is_active limit 1;
  if owner_id is null then
    raise notice 'no active owner to attribute the refund to; skipping';
    return;
  end if;

  for rec in
    select t.id, t.customer_id, -t.delta as pts, coalesce(r.name_en, 'a reward') as nm
      from loyalty_transactions t
      left join rewards r on r.id = t.reward_id
     where t.reason = 'redeem_reward'
       and t.actor_id is null            -- pre-0008 claims had no staff member
       and not exists (
         select 1 from loyalty_transactions f
          where f.customer_id = t.customer_id
            and f.reason = 'manual_adjust'
            and f.note = 'Refund: reward claim gave no code (fix 0008) #' || t.id::text
       )
  loop
    insert into loyalty_transactions (customer_id, delta, reason, actor_id, note)
    values (rec.customer_id, rec.pts, 'manual_adjust', owner_id,
            'Refund: reward claim gave no code (fix 0008) #' || rec.id::text);
    n := n + 1;
  end loop;

  raise notice 'refunded % reward claim(s) that produced no code', n;
end $$;
