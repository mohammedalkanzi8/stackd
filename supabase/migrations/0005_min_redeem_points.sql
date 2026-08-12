-- 0005 — a floor on counter redemptions, 500 points
--
-- Asked for on 12 Aug 2026: a customer cannot spend points off a bill until they
-- have at least 500 of them. 500 points is 5.00 SAR, because one point is one
-- halala throughout.
--
-- ⚠ IT APPLIES TO issue_redemption() ONLY — points spent as money off a bill.
-- It deliberately does NOT apply to redeem_reward(), the rewards catalogue,
-- because a reward already carries a price the owner set and two of the seeded
-- ones are cheaper than this floor:
--
--     Free Sauce      300 points
--     Free Coleslaw   400 points
--
-- Applying the floor there would leave both listed and un-redeemable, which
-- reads to a customer as a broken app rather than a rule. If the floor is meant
-- to cover the catalogue too, raise those two rewards to 500 first, then add the
-- same check to redeem_reward().
--
-- ⚠ The website's own copy says points come off a bill "or a few riyals"
-- (packages/shared/src/rewards.ts). That sentence stops being true at a 500
-- floor and is corrected in the same change. Deploy the site with this.
--
-- Set to 0 to remove the floor.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0005_min_redeem_points.sql
--
-- Safe to run twice.

alter table loyalty_settings
  add column if not exists min_redeem_points int not null default 500;

alter table loyalty_settings drop constraint if exists loyalty_settings_min_redeem_points_check;
alter table loyalty_settings
  add constraint loyalty_settings_min_redeem_points_check check (min_redeem_points >= 0);

comment on column loyalty_settings.min_redeem_points is
  'Floor on a single counter redemption, in points. 0 disables. Enforced by '
  'issue_redemption(); redeem_reward() is deliberately exempt.';

-- Rewritten whole rather than patched: this is the canonical body, and it must
-- stay identical to the one in schema.sql.
create or replace function issue_redemption(p_customer_id uuid, p_points int)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bal    int;
  secs   int;
  tok    text;
  floor_ int;
begin
  if p_points is null or p_points <= 0 then
    raise exception 'choose how many points to spend';
  end if;

  -- Checked in the database, not just in the portal that draws the slider: this
  -- function is reachable from the portal AND the till, and a floor enforced in
  -- one caller is not a floor.
  select min_redeem_points into floor_ from loyalty_settings;
  if floor_ > 0 and p_points < floor_ then
    raise exception 'minimum redemption is % points', floor_;
  end if;

  select balance into bal from loyalty_balances
   where customer_id = p_customer_id for update;

  if coalesce(bal, 0) < p_points then
    raise exception 'insufficient points: have %, asked for %', coalesce(bal, 0), p_points;
  end if;

  -- Superseded, not kept. An old code left valid is a second way to spend.
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

grant execute on function issue_redemption(uuid, int) to service_role;
