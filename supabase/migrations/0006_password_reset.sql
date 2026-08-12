-- 0006 — forgotten passwords, by emailed one-time code
--
-- Asked for on 12 Aug 2026: a customer who has forgotten their password gets a
-- one-time code by email, and setting a new password is forced before they can
-- use the portal again.
--
-- Three things go in:
--
--   1. A UNIQUE index on the customer's email. There was none — only `phone`
--      was unique — so the duplicate check in the registration form was a plain
--      SELECT before an INSERT, and two submissions racing each other could both
--      pass it. That was survivable while email was only a contact detail. It
--      stops being survivable the moment a password can be reset by email,
--      because two rows sharing an address make "which account?" unanswerable.
--
--   2. `must_change_password` on customer_credentials. Verifying a code signs
--      the customer in and sets this; the portal then refuses to show anything
--      but the set-a-password screen until it clears.
--
--   3. `customer_password_resets`, one live code per customer.
--
-- ⚠ THE CODE IS STORED AS A SCRYPT HASH, never in plain text. A six-digit code
-- is a credential: it signs somebody in. Kept as plain text it would let anyone
-- reading a database dump take any account whose owner had a reset in flight,
-- and a fast hash would fall to an offline sweep of all one million codes in
-- about a second. scrypt at 64 MB a guess makes that sweep meaningless. The
-- hashing is done in Node by packages/server/src/password.ts, the same pair of
-- functions that hash the passwords themselves.
--
-- ⚠ THIS MIGRATION WILL STOP if two customers already share an email address.
-- That is deliberate: merging two loyalty accounts means deciding which member
-- code survives and what happens to both point balances, which is a judgement
-- about somebody's money and not something a migration should make on its own.
-- The exception it raises names the addresses so they can be settled by hand.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0006_password_reset.sql
--
-- Safe to run twice.

-- An empty string is not an email address, and it is what an untouched optional
-- form field posts. Left alone they would all collide with each other under the
-- unique index below, so they become NULL first — which is what "no email"
-- already means everywhere else in this schema.
update customers set email = null where email is not null and btrim(email) = '';

-- Stored lowercase and trimmed from here on. The index is on lower(email) so a
-- mixed-case duplicate cannot slip past, but normalising the stored value too
-- keeps what the admin portal displays identical to what the customer typed at
-- registration.
update customers set email = lower(btrim(email)) where email is not null and email <> lower(btrim(email));

do $$
declare
  clashes text;
begin
  select string_agg(e || ' (' || n || ' accounts)', ', ' order by e)
    into clashes
    from (
      select lower(email) as e, count(*) as n
        from customers
       where email is not null
       group by 1
      having count(*) > 1
    ) d;

  if clashes is not null then
    raise exception
      'cannot add the unique email index: these addresses are on more than one customer — %. '
      'Merge or clear them by hand first; each one is two loyalty accounts that need a decision '
      'about which member code and which point balance survives.', clashes;
  end if;
end $$;

create unique index if not exists customers_email_unique
  on customers (lower(email)) where email is not null;

comment on index customers_email_unique is
  'One account per email address. Password reset sends a code to an address and '
  'has to be able to name exactly one customer from it.';

-- Set when a one-time code is accepted, cleared when a new password is saved.
-- On customer_credentials rather than customers because it describes the
-- credential, not the person.
alter table customer_credentials
  add column if not exists must_change_password boolean not null default false;

comment on column customer_credentials.must_change_password is
  'The portal shows nothing but the set-a-password screen while this is true. '
  'Set by verifying an emailed reset code.';

-- One live code per customer: the primary key is the customer id, so issuing a
-- new code overwrites the old one rather than leaving two ways in. Same reason
-- issue_redemption() deletes the previous token instead of keeping it.
create table if not exists customer_password_resets (
  customer_id uuid primary key references customers(id) on delete cascade,
  -- scrypt, from packages/server/src/password.ts. Never the code itself.
  code_hash   text not null,
  expires_at  timestamptz not null,
  -- Wrong guesses. The code dies at the cap, so a six-digit space cannot be
  -- walked online even while it is valid.
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);

comment on table customer_password_resets is
  'In-flight forgotten-password codes, one per customer, hashed. Rows are '
  'deleted when used; expired rows are cleared by the next request for that '
  'customer, so a read never writes.';

-- Lets the sweep below find expired rows without a full scan once this grows.
create index if not exists customer_password_resets_expires
  on customer_password_resets (expires_at);

-- RLS on with NO policy, exactly as customer_credentials is. An in-flight code
-- signs somebody in, so only the portal's server role — which bypasses RLS as
-- the database owner — has any business reading one. Without this the table
-- would be readable by `anon` through PostgREST, which is every reset code in
-- flight handed to whoever asks. supabase/schema.test.mjs asserts that every
-- public table has RLS enabled and will fail the build if this is ever dropped.
alter table customer_password_resets enable row level security;
