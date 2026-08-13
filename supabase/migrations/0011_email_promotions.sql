-- 0011 — promotional email: consent, an unsubscribe route, and a record of sends
--
-- Adds the staff-facing "Promotions" tab requested 13 Aug 2026: compose a
-- message and send it to customers who agreed to hear from the shop.
--
-- ⚠ `marketing_opt_in` ALREADY EXISTED AND NOTHING EVER SET IT. It has been on
-- `customers` since the first schema, defaulting to false, and neither the
-- registration form nor the counter signup ever touched it — so every customer
-- in the database is opted OUT and a promotion would have gone to nobody. The
-- column was not the missing piece; the consent question was. Both signup paths
-- now ask.
--
-- ⚠ CONSENT IS A BUSINESS DECISION, NOT A TECHNICAL ONE. Saudi PDPL requires a
-- basis for direct marketing. The signup checkbox ships pre-ticked with visible
-- wording and a one-click unsubscribe in every message, which is the ordinary
-- practice for existing-customer marketing — but if the owner wants explicit
-- unticked opt-in instead, that is one attribute in the two signup forms and no
-- change here.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0011_email_promotions.sql
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------
-- Unsubscribing
-- ---------------------------------------------------------------------------
-- ⚠ A TOKEN, NOT THE CUSTOMER ID. The link goes in an email, which is copied,
-- forwarded and logged by mail servers along the way. An id in that URL would
-- let anyone holding it turn off marketing for an arbitrary customer, and worse,
-- it is the same id used everywhere else in the system. A dedicated random value
-- can be rotated and is good for exactly one thing.
--
-- gen_random_uuid() is core Postgres and 122 bits of randomness — unguessable,
-- and no collision-retry loop to get wrong.
alter table customers
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists customers_unsubscribe_token
  on customers (unsubscribe_token);

comment on column customers.unsubscribe_token is
  'Opaque value for the one-click unsubscribe link. Never the customer id: the '
  'link travels through mail servers and inboxes that are not ours.';

-- ---------------------------------------------------------------------------
-- What was sent
-- ---------------------------------------------------------------------------
create table if not exists email_campaigns (
  id           uuid primary key default gen_random_uuid(),
  -- Both languages, because customers.locale exists and defaults to 'ar'.
  -- Sending English to a customer who chose Arabic is worse than not sending.
  -- Either pair may be blank; a customer falls back to whichever is filled.
  subject_en   text,
  body_en      text,
  subject_ar   text,
  body_ar      text,
  -- Who pressed send. A mass mail to customers is an act with a name on it.
  sent_by      uuid references staff(id),
  created_at   timestamptz not null default now(),
  -- Counted at send time, not derived later: the audience changes as people
  -- unsubscribe, and "how many did this actually reach" must stay answerable.
  recipients   int not null default 0,
  delivered    int not null default 0,
  failed       int not null default 0
);

comment on table email_campaigns is
  'One row per promotional send. Kept for audit and so the staff can see what '
  'has already gone out rather than guessing and sending it twice.';

create index if not exists email_campaigns_recent on email_campaigns (created_at desc);

-- ⚠ RLS on with NO policy, as every other staff-only table here is. These rows
-- say what the shop is promoting and how large its list is. Only the portals'
-- own role, which bypasses RLS as the database owner, has any business reading
-- them. supabase/schema.test.mjs fails the build if a public table is left
-- without RLS.
alter table email_campaigns enable row level security;

-- ---------------------------------------------------------------------------
-- Turning marketing off
-- ---------------------------------------------------------------------------
-- security definer so the unsubscribe route needs no privileges of its own, and
-- so the only thing an unsubscribe link can ever do is this one update.
--
-- Returns true when a customer was found. An unknown or already-used token
-- returns false rather than raising, because the page it backs must say the
-- same reassuring thing either way — somebody clicking twice has not failed at
-- anything.
create or replace function unsubscribe_by_token(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare hit int;
begin
  update customers
     set marketing_opt_in = false
   where unsubscribe_token = p_token;
  get diagnostics hit = row_count;
  return hit > 0;
end $$;

revoke all on function unsubscribe_by_token(uuid) from public;

-- Report the audience, so applying this in a deploy log says something useful
-- rather than nothing.
do $$
declare total int; opted int; mailable int;
begin
  select count(*) into total from customers;
  select count(*) into opted from customers where marketing_opt_in;
  select count(*) into mailable from customers where marketing_opt_in and email is not null;
  raise notice 'customers: % total, % opted in, % with an email address to send to',
    total, opted, mailable;
end $$;
