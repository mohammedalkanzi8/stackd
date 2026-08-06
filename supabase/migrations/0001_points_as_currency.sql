-- 0001 — points become currency, and redemption moves to the counter
--
-- THE FIRST MIGRATION. Until now supabase/schema.sql was applied whole, because
-- nothing was live. Production went up on 6 Aug 2026, so from here every change
-- needs a file like this one AND the matching edit in schema.sql: the schema
-- file builds a fresh database, migrations bring an existing one forward, and
-- the two must agree. `npm run db:reset && npm test` is what proves they do.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 < supabase/migrations/0001_points_as_currency.sql
--
-- What changes, and why:
--
--   ONE POINT BECOMES ONE HALALA. 100 points is 1.00 SAR off a bill, so a
--   reward's cost in points is just its price in halalas. Earning becomes a
--   straight 10% of the total PAID, VAT included, because that is the figure on
--   the receipt and a customer can check it.
--
--   Customers can now spend any amount off a bill, not only claim a catalogue
--   item. That needs a short-lived single-use token the cashier scans.
--
-- Safe to run once. It is wrapped in a transaction, so a failure anywhere leaves
-- the database exactly as it was.

begin;

-- ---------------------------------------------------------------------------
-- 1. Settings: a percentage of the bill, not points per riyal
-- ---------------------------------------------------------------------------

alter table loyalty_settings
  add column if not exists earn_percent numeric(5,2) not null default 10.00,
  add column if not exists redeem_window_secs int not null default 180;

alter table loyalty_settings
  drop constraint if exists loyalty_settings_earn_percent_check,
  add constraint loyalty_settings_earn_percent_check
    check (earn_percent >= 0 and earn_percent <= 100);

alter table loyalty_settings
  drop constraint if exists loyalty_settings_redeem_window_secs_check,
  add constraint loyalty_settings_redeem_window_secs_check
    check (redeem_window_secs between 30 and 3600);

alter table loyalty_settings drop column if exists points_per_riyal;

-- ---------------------------------------------------------------------------
-- 2. Earning maths
--
-- The signature changes, so the old function is dropped rather than replaced.
-- points_for_order() calls it and is recreated immediately below; between these
-- two statements the database is inside a transaction and nobody can observe it.
-- ---------------------------------------------------------------------------

drop function if exists points_for_amount(int, numeric, numeric);
drop function if exists points_for_amount(int, numeric, int);

create or replace function points_for_amount(
  p_gross        int,
  p_earn_percent numeric default 10.00
) returns int
language sql immutable as $$
  select floor(p_gross * p_earn_percent / 100.0)::int
$$;

create or replace function points_for_order(p_order_id uuid)
returns int
language sql stable as $$
  with s as (select earn_percent from loyalty_settings),
       o as (select grand_total from orders where id = p_order_id),
       lines as (
         select case
                  when mi.points_award is not null then mi.points_award * oi.quantity
                  else points_for_amount(oi.line_total, s.earn_percent)
                end as pts
         from order_items oi
         left join menu_items mi on mi.id = oi.menu_item_id
         cross join s
         where oi.order_id = p_order_id
       )
  select coalesce(
    (select sum(pts)::int from lines),
    (select points_for_amount(o.grand_total, s.earn_percent) from o, s),
    0
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Redemption tokens
-- ---------------------------------------------------------------------------

create table if not exists redemption_tokens (
  token       text primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  points      int  not null check (points > 0),
  expires_at  timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references staff(id),
  created_at  timestamptz not null default now(),

  constraint redemption_is_whole
    check ((redeemed_at is null) = (redeemed_by is null))
);

create index if not exists redemption_tokens_customer
  on redemption_tokens (customer_id, created_at desc);

-- Exactly one live code per customer, or several screenshots could each be spent.
create unique index if not exists redemption_one_live_per_customer
  on redemption_tokens (customer_id)
  where redeemed_at is null;

alter table redemption_tokens enable row level security;

create or replace function issue_redemption(p_customer_id uuid, p_points int)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bal    int;
  secs   int;
  tok    text;
begin
  if p_points is null or p_points <= 0 then
    raise exception 'choose how many points to spend';
  end if;

  select balance into bal from loyalty_balances
   where customer_id = p_customer_id for update;

  if coalesce(bal, 0) < p_points then
    raise exception 'insufficient points: have %, asked for %', coalesce(bal, 0), p_points;
  end if;

  delete from redemption_tokens
   where customer_id = p_customer_id and redeemed_at is null;

  select redeem_window_secs into secs from loyalty_settings;

  loop
    tok := generate_claim_token();
    begin
      insert into redemption_tokens (token, customer_id, points, expires_at)
      values (tok, p_customer_id, p_points, now() + make_interval(secs => secs));
      return tok;
    exception when unique_violation then
      -- Token collision only. Try again.
    end;
  end loop;
end $$;

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

  insert into loyalty_transactions (customer_id, delta, reason, actor_id, note)
  values (t.customer_id, -t.points, 'manual_adjust', p_staff_id,
          format('Redeemed %s points at the counter', t.points));

  return query
    select t.points, t.customer_id, c.full_name, c.member_code
    from customers c where c.id = t.customer_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------

revoke all on function issue_redemption(uuid, int)      from public;
revoke all on function redeem_points_token(text, uuid)  from public;
grant execute on function issue_redemption(uuid, int)      to service_role;
grant execute on function redeem_points_token(text, uuid)  to service_role;
grant execute on function points_for_amount(int, numeric)  to anon, authenticated;
grant execute on function points_for_order(uuid)           to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reprice the catalogue
--
-- One point is one halala, so a reward costs exactly what it is worth. This is
-- self-correcting rather than a list of magic numbers: Free Fries is a 900
-- halala discount, therefore 900 points.
--
-- Safe here because the ledger is empty. Doing this after customers hold
-- balances would silently change what their points buy, and would need a
-- decision rather than a migration.
-- ---------------------------------------------------------------------------

update rewards
   set points_cost = discount_amount
 where discount_amount is not null
   and points_cost <> discount_amount;

commit;
