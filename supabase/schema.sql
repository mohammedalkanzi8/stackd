-- STACKD / ستاكد — core data model
-- Target: Supabase (Postgres 15+). Money in halalas (integer) to avoid float drift.
-- Bilingual columns (_en / _ar) rather than a translations table: only two locales,
-- and every read needs both for RTL toggling anyway.
--
-- THIS FILE IS CANONICAL. Nothing has been applied to a production database yet,
-- so a single readable definition beats a migration chain with no cutover point.
-- The day it first runs against production, freeze it and start
-- `supabase/migrations/0001_*.sql` — after that, editing this file in place
-- silently diverges from what is actually deployed.
--
-- Apply locally with `npm run db:reset`, which layers supabase/local/00_shim.sql
-- underneath to stand in for the Supabase platform (auth schema, PostgREST roles).

-- gen_random_uuid() is core since Postgres 13, so no extension is required.

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------

create table branches (
  id              uuid primary key default gen_random_uuid(),
  name_en         text not null,
  name_ar         text not null,
  address_en      text not null,
  address_ar      text not null,
  city_en         text not null default 'Al Khobar',
  city_ar         text not null default 'الخبر',
  phone           text,          -- E.164
  postal_code     text,
  plus_code       text,          -- Google Plus Code, e.g. 76X9+7P5
  -- Saudi National Address short code (4 letters + 4 digits). Required on ZATCA
  -- tax invoices; a Plus Code does not satisfy the requirement.
  national_address text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  -- ZATCA requires the seller VAT number on every tax invoice.
  vat_number      text,
  cr_number       text,
  -- Prefix for this branch's tax invoice numbers, e.g. 'STK'. See next_invoice_number().
  invoice_prefix  text not null default 'STK',
  is_active       boolean not null default true,
  accepts_pickup  boolean not null default true,
  -- Minutes from order acceptance to "ready for pickup". Drives the ETA shown.
  prep_time_mins  int not null default 15,
  created_at      timestamptz not null default now()
);

-- Opening hours, one row per weekday per branch. 0 = Sunday.
-- Separate table so Ramadan / holiday overrides can be layered on (see
-- branch_closures below).
--
-- OVERNIGHT WINDOWS: STACKD trades 15:00 → 03:00, so closes_at < opens_at.
-- The convention is that a row belongs to the day the shift STARTS. Sunday's
-- row (weekday 0, 15:00–03:00) therefore covers Sunday 15:00 through Monday
-- 03:00. Never compare `now()::time between opens_at and closes_at` — that is
-- false for the entire post-midnight stretch, which is peak trade.
create table branch_hours (
  branch_id   uuid not null references branches(id) on delete cascade,
  weekday     int  not null check (weekday between 0 and 6),
  opens_at    time not null,
  closes_at   time not null,
  primary key (branch_id, weekday)
);

-- One-off closures: Eid, maintenance, a Ramadan schedule change.
--
-- `closed_on` names the day the SHIFT STARTS, matching branch_hours. Closing
-- Sunday therefore also closes Monday 00:00–03:00, because that stretch is
-- Sunday's trade. Closing the calendar day instead would leave the small hours
-- open with nobody in the kitchen.
create table branch_closures (
  branch_id   uuid not null references branches(id) on delete cascade,
  closed_on   date not null,
  reason_en   text,
  reason_ar   text,
  primary key (branch_id, closed_on)
);

-- The trading day a moment belongs to. 03:00 is the close, so anything before
-- 04:00 Riyadh counts as the previous day — used for pickup-code numbering and
-- for closure lookups.
--
-- Immutable, so it is safe in an index expression. `<timestamptz> at time zone
-- <literal>` is immutable; a bare `<timestamptz>::date` is only STABLE, because
-- it reads the session TimeZone. That distinction bites below.
create or replace function riyadh_service_date(p_at timestamptz)
returns date
language sql immutable as $$
  select ((p_at at time zone 'Asia/Riyadh') - interval '4 hours')::date
$$;

-- Authoritative open/closed check. Handles the midnight wrap and pins the
-- comparison to Riyadh time (UTC+3, no DST) regardless of server timezone.
create or replace function is_branch_open(
  p_branch_id uuid,
  p_at        timestamptz default now()
) returns boolean
language sql stable as $$
  with l as (select (p_at at time zone 'Asia/Riyadh') as ts)
  select exists (select 1 from branches b where b.id = p_branch_id and b.is_active)
     and exists (
    select 1
    from l, branch_hours h
    where h.branch_id = p_branch_id
      and (
        -- Same-day window (e.g. 09:00–17:00)
        (h.closes_at > h.opens_at
         and extract(dow from l.ts)::int = h.weekday
         and l.ts::time >= h.opens_at
         and l.ts::time <  h.closes_at
         and not exists (select 1 from branch_closures c
                         where c.branch_id = h.branch_id and c.closed_on = l.ts::date))

        -- Overnight window, evening leg: today's row, after opening
        or (h.closes_at < h.opens_at
            and extract(dow from l.ts)::int = h.weekday
            and l.ts::time >= h.opens_at
            and not exists (select 1 from branch_closures c
                            where c.branch_id = h.branch_id and c.closed_on = l.ts::date))

        -- Overnight window, small-hours leg: YESTERDAY's row still running
        or (h.closes_at < h.opens_at
            and extract(dow from l.ts - interval '1 day')::int = h.weekday
            and l.ts::time < h.closes_at
            and not exists (select 1 from branch_closures c
                            where c.branch_id = h.branch_id
                              and c.closed_on = (l.ts - interval '1 day')::date))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Staff
--
-- Without this there is no way to tell a cashier from a customer, and the
-- kitchen display cannot read the orders it exists to display: every policy
-- below keyed on auth.uid() would match the customer only.
-- ---------------------------------------------------------------------------

create type staff_role as enum ('cashier', 'kitchen', 'manager', 'owner');

create table staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  branch_id   uuid not null references branches(id) on delete cascade,
  role        staff_role not null,
  full_name   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index staff_branch on staff (branch_id) where is_active;

-- Staff sign-in for the admin portal.
--
-- Kept out of `staff` so that table stays about roles and branches, and so a row
-- describing who someone is can be selected without a password hash riding
-- along. It is also the piece most likely to be deleted: if staff ever move to
-- GoTrue like customers, this table drops and nothing else changes.
--
-- RLS on with no policy — only the portal's server role reads it, and it never
-- leaves the server. Hashes are scrypt, written by scripts/admin-passwd.mjs.
create table staff_credentials (
  staff_id      uuid primary key references staff(id) on delete cascade,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

-- Policy helper. This MUST be security definer: a policy on `orders` that reads
-- `staff` directly needs `staff` itself readable by the caller, and adding a
-- policy to `staff` to permit that makes it read `staff` again. That recursion
-- is a runtime error, not a plan-time one, so it surfaces as a broken kitchen
-- display rather than a failed migration.
--
-- search_path is pinned because a security definer function that resolves
-- unqualified names through the caller's search_path can be hijacked.
create or replace function is_staff_at(
  p_branch_id uuid,
  p_roles     staff_role[] default null
) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from staff s
    where s.id = auth.uid()
      and s.branch_id = p_branch_id
      and s.is_active
      and (p_roles is null or s.role = any(p_roles))
  )
$$;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

create table categories (
  id          uuid primary key default gen_random_uuid(),
  -- Stable identifier the website keys off. Renaming a category in Arabic must
  -- not change a URL or invalidate a photo path.
  slug        text not null unique,
  name_en     text not null,
  name_ar     text not null,
  -- Dishes earn a photo; a 3 SAR sauce does not. Seventeen identical
  -- placeholder tiles read as unfinished rather than deliberate, so sauces and
  -- drinks stay compact text cards — which is also how the printed menu has them.
  show_photos boolean not null default true,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

create table menu_items (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references categories(id),
  slug          text not null unique,
  name_en       text not null,
  name_ar       text not null,
  description_en text,
  description_ar text,
  -- Base price in halalas. 3450 = 34.50 SAR.
  price         int  not null check (price >= 0),
  -- Site-relative path under apps/web/public/menu/, e.g. '/menu/big-stackd.webp'.
  -- The photos are static build assets, not blobs — this is a path, not a URL to
  -- object storage.
  image_url     text,
  -- Provenance and quality caveats for the photo, carried here so they survive
  -- `npm run sync:menu` regenerating menu.ts. See STATUS.md § 4: five of these
  -- are ~3x upscaled Instagram crops and one is not a photograph of the dish.
  photo_note    text,
  calories      int,
  -- Saudi menu-labelling rules require calories to be displayed; keep it nullable
  -- during data entry but flag items still missing it. NULL means "we know the
  -- printed value is wrong" — publishing nothing beats publishing bad data.
  spicy         boolean not null default false,
  -- Set where the Arabic name is our translation rather than the owner's wording.
  arabic_needs_review boolean not null default false,
  is_active     boolean not null default true,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

-- Postgres does not index foreign keys automatically. Without this every
-- category read scans the whole item table, and deleting a category takes a
-- full scan under lock.
create index menu_items_category on menu_items (category_id);

-- Per-branch stock control: an item can be sold out at one branch only.
create table branch_menu_availability (
  branch_id     uuid not null references branches(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  is_available  boolean not null default true,
  primary key (branch_id, menu_item_id)
);

create index branch_menu_availability_item on branch_menu_availability (menu_item_id);

-- Modifiers: "Spice level" (pick 1), "Add-ons" (pick 0..n), etc.
create table modifier_groups (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name_en       text not null,
  name_ar       text not null,
  min_select    int  not null default 0,
  max_select    int  not null default 1,
  check (max_select >= min_select)
);

create table modifiers (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references modifier_groups(id) on delete cascade,
  name_en       text not null,
  name_ar       text not null,
  price_delta   int  not null default 0,   -- halalas, may be 0
  is_active     boolean not null default true,
  sort_order    int  not null default 0
);

create index modifiers_group on modifiers (group_id);

create table menu_item_modifier_groups (
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  group_id      uuid not null references modifier_groups(id) on delete cascade,
  sort_order    int  not null default 0,
  primary key (menu_item_id, group_id)
);

create index menu_item_modifier_groups_group on menu_item_modifier_groups (group_id);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

-- The code on the customer's loyalty QR. Deliberately NOT the auth uuid: that
-- identifier authenticates elsewhere in the stack and should not be printed,
-- photographed over a shoulder, or left on a receipt.
--
-- Alphabet omits 0/O/1/I/L so a cashier can key it by hand when a screen is too
-- cracked to scan. 31^8 ≈ 8.5e11 combinations; the unique constraint catches the
-- birthday-problem tail.
create or replace function generate_member_code()
returns text
language sql volatile as $$
  select string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random() * 31)::int) + 1, 1), ''
  )
  from generate_series(1, 8)
$$;

create table customers (
  id            uuid primary key references auth.users(id) on delete cascade,
  member_code   text not null unique default generate_member_code(),
  full_name     text,
  phone         text unique,          -- E.164, e.g. +9665XXXXXXXX
  email         text,
  locale        text not null default 'ar' check (locale in ('ar','en')),
  birthday      date,                 -- drives a birthday reward
  marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Cashier-facing member lookup for the scan flow.
--
-- Security definer so a cashier can resolve a scanned code WITHOUT holding read
-- access to the customer table. Returns the name only — enough to confirm out
-- loud that the right account is being credited, and nothing more. A blanket
-- staff read policy on `customers` would expose every phone number and birthday
-- in the database to every till.
create or replace function find_member(p_code text)
returns table (customer_id uuid, full_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.full_name
  from customers c
  where c.member_code = upper(trim(p_code))
    and exists (select 1 from staff s where s.id = auth.uid() and s.is_active)
$$;

-- Push notification targets. Phase 2 pushes reward milestones; Phase 3 pushes
-- "your order is ready", which is the whole point of pickup.
create table device_tokens (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  platform     text not null check (platform in ('ios','android')),
  token        text not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index device_tokens_customer on device_tokens (customer_id);

-- ---------------------------------------------------------------------------
-- Orders (pickup only for launch; delivery fields deliberately absent)
-- ---------------------------------------------------------------------------

create type order_status as enum (
  'pending_payment',  -- created, gateway not yet confirmed
  'paid',             -- money captured, kitchen not yet notified
  'accepted',         -- kitchen acknowledged
  'preparing',
  'ready',            -- customer notified for pickup
  'completed',        -- handed over
  'cancelled',
  'refunded'
);

-- Where the order came from. `pos` is a walk-in rung up at the till: it was paid
-- in cash or on the till's own card terminal, it may have no member attached,
-- and it exists in this table only so loyalty can accrue against a real ticket.
-- That flow ships in Phase 2, BEFORE app ordering exists — modelling it later
-- would mean reshaping this table after it holds data.
create type order_source as enum ('app', 'pos');

create table orders (
  id              uuid primary key default gen_random_uuid(),
  -- Nullable: a cash walk-in with no membership is still a real order.
  customer_id     uuid references customers(id),
  branch_id       uuid not null references branches(id),
  source          order_source not null default 'app',
  status          order_status not null default 'pending_payment',

  -- Short human-readable code called out at the counter. Filled by
  -- assign_pickup_code() below; never supply it by hand.
  pickup_code     text not null,
  -- The trading day the code was allocated in. Stored rather than derived —
  -- see the index note below.
  service_date    date not null,

  -- Money, all halalas. Stored (not computed) so a menu price change never
  -- rewrites history.
  --
  -- ⚠ PRICES ARE VAT-INCLUSIVE. Saudi consumer-protection rules require the
  -- displayed price to include VAT, so a 27.00 SAR burger ALREADY contains its
  -- VAT — it is not 27.00 + 15%. Therefore:
  --
  --   grand_total = subtotal - discount_total
  --   vat_total   = the VAT component EXTRACTED from grand_total,
  --                 reported on the ZATCA invoice. It is NOT added to it.
  --
  -- Do not "add VAT" anywhere downstream. See packages/shared/src/money.ts
  -- (`splitVatInclusive`) for the canonical implementation, which guarantees
  -- net + vat = gross exactly so receipts never show a one-halala drift.
  subtotal        int not null,             -- sum of line totals, VAT-inclusive
  discount_total  int not null default 0,   -- from reward redemptions
  vat_total       int not null,             -- extracted component, at vat_rate
  grand_total     int not null,             -- what the customer actually pays
  -- The rate itself, not just the amount it produced. README lists "VAT stored
  -- on the order, so rate changes don't alter history" as a settled decision,
  -- but storing only vat_total half-keeps it: after a rate change nobody can
  -- tell whether an old row was computed at 15% or at something else.
  vat_rate        numeric(4,4) not null default 0.15,

  constraint order_totals_reconcile
    check (grand_total = subtotal - discount_total),
  -- The VAT-inclusive rule, enforced by the database rather than by comment.
  -- This is the single easiest thing to get wrong downstream, and every wrong
  -- answer is a tax filing error.
  constraint order_vat_extracted_not_added
    check (vat_total = round(grand_total - grand_total / (1 + vat_rate))),

  -- App orders require an account (phone OTP); a till ticket does not.
  constraint app_orders_have_a_customer
    check (source <> 'app' or customer_id is not null),
  -- A till ticket was already paid when it was rung up.
  constraint pos_orders_are_already_paid
    check (source <> 'pos' or status <> 'pending_payment'),

  -- Loyalty outcome, snapshotted.
  points_earned   int not null default 0,
  points_redeemed int not null default 0,

  scheduled_for   timestamptz,  -- null = ASAP
  ready_at        timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  -- Realtime consumers (the app's status timeline, the kitchen display) need a
  -- change marker. Maintained by trigger.
  updated_at      timestamptz not null default now()
);

-- Pickup codes are unique per branch per TRADING day.
--
-- The obvious spelling — `(branch_id, pickup_code, (created_at::date))` — is
-- rejected outright by Postgres: casting a timestamptz to date reads the session
-- TimeZone, making it STABLE rather than IMMUTABLE, and index expressions must
-- be immutable. Storing service_date sidesteps that AND gets the semantics
-- right, since a 01:30 order belongs to the previous evening's numbering.
create unique index orders_pickup_code_daily
  on orders (branch_id, service_date, pickup_code);
create index orders_customer_recent on orders (customer_id, created_at desc);
-- Kitchen display query: open orders for one branch.
create index orders_branch_open on orders (branch_id, status)
  where status in ('paid','accepted','preparing','ready');

-- Per-branch, per-day counter behind next_pickup_code().
create table pickup_code_counters (
  branch_id    uuid not null references branches(id) on delete cascade,
  service_date date not null,
  last_number  int  not null default 0,
  primary key (branch_id, service_date)
);

-- Allocates the next counter code for a branch's trading day.
--
-- The upsert takes a row lock held to end of transaction, so concurrent orders
-- serialise here rather than colliding on the unique index. Codes wrap at 999:
-- a three-digit number is what fits on a receipt and gets shouted across a
-- counter, and no single branch-day approaches 999 tickets.
create or replace function next_pickup_code(p_branch_id uuid, p_service_date date)
returns text
language plpgsql as $$
declare n int;
begin
  insert into pickup_code_counters (branch_id, service_date, last_number)
  values (p_branch_id, p_service_date, 1)
  on conflict (branch_id, service_date)
    do update set last_number = pickup_code_counters.last_number + 1
  returning last_number into n;

  return lpad((((n - 1) % 999) + 1)::text, 3, '0');
end $$;

create or replace function assign_pickup_code()
returns trigger language plpgsql as $$
begin
  new.service_date := coalesce(new.service_date, riyadh_service_date(coalesce(new.created_at, now())));
  if new.pickup_code is null then
    new.pickup_code := next_pickup_code(new.branch_id, new.service_date);
  end if;
  return new;
end $$;

-- BEFORE INSERT, so it fills pickup_code and service_date ahead of the NOT NULL
-- checks, which run after row-level triggers.
create trigger orders_assign_pickup_code
  before insert on orders
  for each row execute function assign_pickup_code();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_touch_updated_at
  before update on orders
  for each row execute function touch_updated_at();

-- Line items snapshot name AND price. Never join to menu_items for money.
create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid references menu_items(id),  -- nullable: item may be deleted later
  name_en       text not null,
  name_ar       text not null,
  unit_price    int  not null,
  quantity      int  not null check (quantity > 0),
  line_total    int  not null,
  notes         text
);

create index order_items_order on order_items (order_id);

create table order_item_modifiers (
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_id   uuid references modifiers(id),
  name_en       text not null,
  name_ar       text not null,
  price_delta   int  not null
);

create index order_item_modifiers_item on order_item_modifiers (order_item_id);

-- ---------------------------------------------------------------------------
-- Payments
--
-- Separate from order_status, which tracks FULFILMENT. Conflating the two has
-- no room for a partial refund, no room for a retried card, and nowhere to put
-- the gateway's own identifier.
-- ---------------------------------------------------------------------------

create type payment_kind as enum ('charge', 'refund');

create type payment_status as enum (
  'initiated', 'authorized', 'captured', 'failed', 'refunded'
);

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  provider            text not null default 'moyasar',
  -- The gateway's id for this transaction.
  provider_payment_id text,
  kind                payment_kind   not null default 'charge',
  amount              int  not null check (amount > 0),
  status              payment_status not null default 'initiated',
  -- Full gateway payload, kept verbatim for reconciliation and disputes.
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payments_order on payments (order_id);

-- Webhook idempotency. Gateways retry, and Moyasar makes no promise of
-- delivering each callback exactly once — this uniqueness IS the dedupe key, so
-- a replayed callback conflicts instead of double-crediting an order.
create unique index payments_provider_unique
  on payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create trigger payments_touch_updated_at
  before update on payments
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Loyalty: append-only ledger. Balance is derived, never directly edited.
-- This is the part worth getting right — points are money to the customer,
-- and disputes need an auditable trail.
-- ---------------------------------------------------------------------------

create table rewards (
  id              uuid primary key default gen_random_uuid(),
  name_en         text not null,
  name_ar         text not null,
  description_en  text,
  description_ar  text,
  points_cost     int  not null check (points_cost > 0),
  -- Either a free item, or a flat discount. Exactly one must be set.
  free_item_id    uuid references menu_items(id),
  discount_amount int check (discount_amount > 0),
  image_url       text,
  is_active       boolean not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  constraint reward_has_exactly_one_benefit check (
    (free_item_id is not null and discount_amount is null) or
    (free_item_id is null and discount_amount is not null)
  )
);

create type loyalty_reason as enum (
  'earn_purchase',
  'redeem_reward',
  'signup_bonus',
  'birthday_bonus',
  'manual_adjust',   -- staff goodwill; requires actor_id
  'expiry',
  'order_refund'     -- claws back points from a refunded order
);

create table loyalty_transactions (
  id          bigserial primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  -- Positive = credit, negative = debit. Never zero.
  delta       int  not null check (delta <> 0),
  reason      loyalty_reason not null,
  order_id    uuid references orders(id),
  -- Which reward a redemption bought. Without it a 'redeem_reward' row records
  -- that points left but not what the customer got for them, which is exactly
  -- the question a dispute asks.
  reward_id   uuid references rewards(id),
  -- Staff member who authorised a manual adjustment.
  actor_id    uuid references auth.users(id),
  note        text,
  created_at  timestamptz not null default now(),

  constraint manual_adjust_needs_an_actor
    check (reason <> 'manual_adjust' or actor_id is not null),
  constraint redemptions_name_a_reward
    check (reason <> 'redeem_reward' or reward_id is not null)
);

create index loyalty_tx_customer on loyalty_transactions (customer_id, created_at desc);
create index loyalty_tx_order on loyalty_transactions (order_id);

-- An order mints points exactly once, and claws back exactly once. Enforced
-- here rather than in application code because the retry that double-credits is
-- always the one nobody wrote a test for. NULL order_ids don't collide.
create unique index loyalty_tx_one_earn_per_order
  on loyalty_transactions (order_id) where reason = 'earn_purchase';
create unique index loyalty_tx_one_clawback_per_order
  on loyalty_transactions (order_id) where reason = 'order_refund';

-- Cached balance for fast reads. Maintained by trigger below; the ledger stays
-- the source of truth and can always rebuild this.
create table loyalty_balances (
  customer_id      uuid primary key references customers(id) on delete cascade,
  balance          int not null default 0 check (balance >= 0),
  lifetime_earned  int not null default 0,
  -- Drives rolling expiry. See expire_stale_points().
  last_activity_at timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ⚠ DO NOT "simplify" THIS BACK INTO AN UPSERT.
--
-- The obvious spelling is one `insert ... on conflict (customer_id) do update`,
-- and it is broken for every debit. Postgres evaluates CHECK constraints on the
-- PROPOSED row before it detects the conflict, and the proposed row carries the
-- raw delta — so redeeming 50 points builds a speculative row with balance = -50,
-- trips `balance >= 0`, and raises before the DO UPDATE branch is ever
-- considered. It fails even when the balance row plainly exists with enough
-- points in it.
--
-- Splitting it means the arithmetic lands in an UPDATE, whose check runs against
-- the final row (100 - 50 = 50, fine), and the INSERT only ever proposes a
-- default zero row. `on conflict do nothing` on that insert covers two
-- concurrent first-transactions for the same customer.
--
-- This was inherited from the first revision of the schema and had never run.
create or replace function apply_loyalty_transaction()
returns trigger language plpgsql as $$
begin
  insert into loyalty_balances (customer_id)
  values (new.customer_id)
  on conflict (customer_id) do nothing;

  update loyalty_balances set
    balance          = balance + new.delta,
    lifetime_earned  = lifetime_earned + greatest(new.delta, 0),
    -- Expiry is not activity. Counting it would reset the clock it just fired
    -- on, and the same points would never lapse twice.
    last_activity_at = case when new.reason = 'expiry' then last_activity_at else now() end,
    updated_at       = now()
  where customer_id = new.customer_id;

  return new;
end $$;

create trigger loyalty_tx_apply
  after insert on loyalty_transactions
  for each row execute function apply_loyalty_transaction();

-- Points earned for a VAT-inclusive gross, on the pre-VAT net, floor-rounded.
--
-- ⚠ This duplicates splitVatInclusive + pointsForOrder from
-- packages/shared/src/money.ts, in a second language. The duplication is
-- deliberate — the app shows a projected balance before the server confirms it,
-- and a mismatch there is a support ticket every time. supabase/schema.test.mjs
-- asserts the two agree for every price on the menu; if you change one, that
-- test is what tells you about the other.
create or replace function points_for_amount(
  p_gross          int,
  p_vat_rate       numeric default 0.15,
  p_points_per_riyal int default 1
) returns int
language sql immutable as $$
  select floor(
    ((p_gross - round(p_gross - p_gross / (1 + p_vat_rate))) / 100.0) * p_points_per_riyal
  )::int
$$;

-- Mints the purchase points for an order. The ONLY sanctioned way points come
-- into existence from a sale.
--
-- Revoked from anon and authenticated below: "points are minted server-side
-- only" was a comment in the previous revision, which is not a control. Now the
-- grant is the control, and the partial unique index makes a double-call a
-- constraint violation rather than free money.
create or replace function mint_loyalty_points(p_order_id uuid)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o       orders%rowtype;
  pts     int;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if o.customer_id is null then
    -- A walk-in that never scanned a member code. Nothing to credit.
    return 0;
  end if;
  if o.status in ('pending_payment', 'cancelled', 'refunded') then
    raise exception 'order % is %, not eligible to earn', p_order_id, o.status;
  end if;

  pts := points_for_amount(o.grand_total, o.vat_rate);
  if pts <= 0 then
    return 0;
  end if;

  insert into loyalty_transactions (customer_id, delta, reason, order_id)
  values (o.customer_id, pts, 'earn_purchase', o.id);

  update orders set points_earned = pts where id = o.id;
  return pts;
end $$;

-- Spends points on a reward. Checks the balance up front so an over-redemption
-- returns a message a cashier can read out, rather than the raw check-constraint
-- violation from loyalty_balances.
create or replace function redeem_reward(p_customer_id uuid, p_reward_id uuid)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r   rewards%rowtype;
  bal int;
  tx  bigint;
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
    raise exception 'insufficient points: have %, need %',
      coalesce(bal, 0), r.points_cost;
  end if;

  insert into loyalty_transactions (customer_id, delta, reason, reward_id)
  values (p_customer_id, -r.points_cost, 'redeem_reward', p_reward_id)
  returning id into tx;

  return tx;
end $$;

-- Rolling expiry: points lapse after a period of inactivity, not on a per-point
-- clock.
--
-- The alternative — expiring each earned lot on its own anniversary — needs FIFO
-- lot-consumption tracking, a second table, and a redemption path that walks it.
-- Rolling activity is one query, is the common F&B model, and is far easier to
-- explain to a customer at the counter, which is where it actually gets argued.
--
-- Run from a scheduled job. Returns the number of customers zeroed.
create or replace function expire_stale_points(p_months int default 12)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  with stale as (
    select customer_id, balance
    from loyalty_balances
    where balance > 0
      and last_activity_at < now() - make_interval(months => p_months)
  ), inserted as (
    insert into loyalty_transactions (customer_id, delta, reason, note)
    select customer_id, -balance, 'expiry',
           format('%s months without activity', p_months)
    from stale
    returning 1
  )
  select count(*) into n from inserted;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- ZATCA e-invoicing (Phase 2). One row per issued tax invoice.
-- ---------------------------------------------------------------------------

-- Sequential per branch, no gaps — a ZATCA requirement, and the reason this is
-- a counter table and not a sequence. Sequences deliberately do NOT roll back:
-- a failed insert burns its number and leaves a gap, which is precisely what is
-- not allowed here. A locked counter row rolls back with the transaction.
create table invoice_counters (
  branch_id   uuid not null references branches(id) on delete cascade,
  year        int  not null,
  last_number int  not null default 0,
  primary key (branch_id, year)
);

create or replace function next_invoice_number(p_branch_id uuid, p_at timestamptz default now())
returns text
language plpgsql as $$
declare
  y      int;
  n      int;
  prefix text;
begin
  y := extract(year from (p_at at time zone 'Asia/Riyadh'))::int;

  insert into invoice_counters (branch_id, year, last_number)
  values (p_branch_id, y, 1)
  on conflict (branch_id, year)
    do update set last_number = invoice_counters.last_number + 1
  returning last_number into n;

  select b.invoice_prefix into prefix from branches b where b.id = p_branch_id;

  return format('%s-%s-%s', coalesce(prefix, 'STK'), y, lpad(n::text, 6, '0'));
end $$;

create table tax_invoices (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references orders(id),
  -- Denormalised from the order so the per-branch sequence is checkable without
  -- a join, and so a numbering audit cannot be fooled by an order moving branch.
  branch_id     uuid not null references branches(id),
  invoice_number text not null,
  uuid_field    uuid not null default gen_random_uuid(),
  -- Base64 TLV payload rendered as the QR on the receipt.
  qr_payload    text not null,
  previous_hash text,          -- invoice chaining
  invoice_hash  text not null,
  cleared_at    timestamptz,   -- when ZATCA returned clearance
  zatca_status  text not null default 'pending',
  created_at    timestamptz not null default now()
);

create unique index tax_invoices_number_per_branch
  on tax_invoices (branch_id, invoice_number);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- ⚠ EVERY table in this schema gets RLS enabled, without exception, including
-- the ones nothing should ever read. Behind PostgREST a table with RLS off is
-- not merely public — it is world-WRITABLE with the anon key, which anyone can
-- read out of the app bundle. A previous revision left seven tables off this
-- list, tax_invoices and its hash chain among them.
--
-- RLS enabled with no policy means "deny all except bypassrls", which is the
-- correct posture for anything only the server should touch. That is a
-- deliberate state here, not an oversight — supabase/schema.test.mjs asserts
-- relrowsecurity across the whole schema so the next table added cannot quietly
-- miss it.
-- ---------------------------------------------------------------------------

alter table branches                  enable row level security;
alter table branch_hours              enable row level security;
alter table branch_closures           enable row level security;
alter table staff                     enable row level security;
alter table staff_credentials         enable row level security;
alter table categories                enable row level security;
alter table menu_items                enable row level security;
alter table branch_menu_availability  enable row level security;
alter table modifier_groups           enable row level security;
alter table modifiers                 enable row level security;
alter table menu_item_modifier_groups enable row level security;
alter table customers                 enable row level security;
alter table device_tokens             enable row level security;
alter table orders                    enable row level security;
alter table order_items               enable row level security;
alter table order_item_modifiers      enable row level security;
alter table payments                  enable row level security;
alter table pickup_code_counters      enable row level security;
alter table rewards                   enable row level security;
alter table loyalty_transactions      enable row level security;
alter table loyalty_balances          enable row level security;
alter table invoice_counters          enable row level security;
alter table tax_invoices              enable row level security;

-- --- Public read: the menu, and where to find the place -----------------------

create policy "public read" on branches   for select using (is_active);
create policy "public read" on branch_hours for select using (true);
create policy "public read" on branch_closures for select using (true);
create policy "public read" on categories for select using (is_active);
create policy "public read" on modifier_groups for select using (true);
create policy "public read" on modifiers  for select using (is_active);
create policy "public read" on menu_item_modifier_groups for select using (true);
create policy "public read" on branch_menu_availability for select using (true);
create policy "public read" on rewards    for select using (is_active);

-- An item is public only if its category is too. Checking is_active alone lets a
-- deactivated category keep serving its items to anyone who asks for them by id.
create policy "public read" on menu_items for select using (
  is_active and exists (
    select 1 from categories c where c.id = menu_items.category_id and c.is_active
  )
);

-- --- Customers ----------------------------------------------------------------

create policy "own profile" on customers
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own devices" on device_tokens
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

-- --- Orders -------------------------------------------------------------------
--
-- No client INSERT policy anywhere here: orders are created server-side, where
-- prices are recomputed from menu_items rather than trusted from the request.

create policy "own orders" on orders
  for select using (auth.uid() = customer_id);

create policy "own order items" on order_items
  for select using (
    exists (select 1 from orders o
            where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

create policy "own order item modifiers" on order_item_modifiers
  for select using (
    exists (select 1 from order_items oi
            join orders o on o.id = oi.order_id
            where oi.id = order_item_modifiers.order_item_id
              and o.customer_id = auth.uid())
  );

-- Staff see, and advance, the orders at their own branch. This is the kitchen
-- display's entire query.
create policy "branch staff read orders" on orders
  for select using (is_staff_at(branch_id));

create policy "branch staff advance orders" on orders
  for update using (is_staff_at(branch_id)) with check (is_staff_at(branch_id));

create policy "branch staff read order items" on order_items
  for select using (
    exists (select 1 from orders o
            where o.id = order_items.order_id and is_staff_at(o.branch_id))
  );

create policy "branch staff read order item modifiers" on order_item_modifiers
  for select using (
    exists (select 1 from order_items oi
            join orders o on o.id = oi.order_id
            where oi.id = order_item_modifiers.order_item_id
              and is_staff_at(o.branch_id))
  );

-- --- Staff --------------------------------------------------------------------

create policy "own staff record" on staff
  for select using (auth.uid() = id);

-- --- Loyalty ------------------------------------------------------------------
--
-- Readable by its owner, writable by nobody. Every credit and debit goes through
-- mint_loyalty_points / redeem_reward / expire_stale_points, which run as
-- security definer. There is deliberately no insert or update policy.

create policy "own ledger" on loyalty_transactions
  for select using (auth.uid() = customer_id);

create policy "own balance" on loyalty_balances
  for select using (auth.uid() = customer_id);

-- --- Server-only: payments, invoices, counters --------------------------------
--
-- RLS on, zero policies. Only service_role (bypassrls) reaches these. A customer
-- reads their payment state through the order, not from the gateway records.

-- ---------------------------------------------------------------------------
-- Function privileges
--
-- The grant is the enforcement. A security definer function left executable by
-- `public` hands every anonymous visitor the privileges it was defined with,
-- which for mint_loyalty_points means minting points at will.
-- ---------------------------------------------------------------------------

revoke all on function mint_loyalty_points(uuid)          from public;
revoke all on function expire_stale_points(int)           from public;
revoke all on function redeem_reward(uuid, uuid)          from public;
revoke all on function next_invoice_number(uuid, timestamptz) from public;
revoke all on function next_pickup_code(uuid, date)       from public;

grant execute on function mint_loyalty_points(uuid)          to service_role;
grant execute on function expire_stale_points(int)           to service_role;
grant execute on function redeem_reward(uuid, uuid)          to service_role;
grant execute on function next_invoice_number(uuid, timestamptz) to service_role;
grant execute on function next_pickup_code(uuid, date)       to service_role;

-- generate_member_code is deliberately NOT revoked. It is the DEFAULT on
-- customers.member_code, and a column default executes as the INSERTING role —
-- revoking it would make a customer creating their own profile row fail with
-- "permission denied for function", from a default they never referenced. It
-- confers nothing: no security definer, no table access, just a random string.

-- Safe for clients: read-only, and they can already see the branch.
grant execute on function is_branch_open(uuid, timestamptz) to anon, authenticated;
grant execute on function riyadh_service_date(timestamptz)  to anon, authenticated;
grant execute on function points_for_amount(int, numeric, int) to anon, authenticated;

-- Staff-facing, and gated internally on the caller being active staff.
grant execute on function find_member(text) to authenticated;
grant execute on function is_staff_at(uuid, staff_role[]) to authenticated;
