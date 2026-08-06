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
-- Apply with `npm run db:reset` locally, or via the database container's init
-- scripts in production. supabase/01_platform_shim.sql must go FIRST in both:
-- it supplies the auth schema and PostgREST roles that this file references and
-- that a plain Postgres does not have. See docs/deploy/SERVER.md.

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
  -- Fixed points this item is worth, overriding the per-riyal rate.
  --
  -- NULL means "use the rate", which is the default and keeps a 27 SAR burger
  -- worth roughly 23 points. Setting it makes the item worth exactly this many
  -- points per unit however it is priced — the lever for pushing a specific dish
  -- without discounting it. See points_for_order().
  points_award  int check (points_award is null or points_award >= 0),
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

-- Customer sign-in for the loyalty portal.
--
-- Same shape and reasoning as staff_credentials: kept out of `customers` so a
-- row describing a person can be read without a password hash riding along, and
-- so it drops cleanly the day customers move to phone OTP, which is what
-- PLAN.md specifies for the mobile app. Passwords are the interim because a web
-- portal with no SMS provider has nothing else to authenticate with.
--
-- RLS on, no policy: only the portal's server role reads it.
create table customer_credentials (
  customer_id   uuid primary key references customers(id) on delete cascade,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

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

-- Programme-wide dials, editable from the admin portal.
--
-- A single row, pinned by a check constraint rather than by convention — a
-- second row would silently double the earn rate for whichever one a query
-- happened to read first.
create table loyalty_settings (
  id                 boolean primary key default true check (id),
  -- ONE POINT IS ONE HALALA. 100 points buy 1.00 SAR off a bill.
  --
  -- That equivalence is the whole design: a reward's cost in points is simply
  -- its price in halalas, and a customer can check the maths on their own
  -- receipt without being told an exchange rate.
  --
  -- Earning is this percentage of the total PAID, VAT included, because that is
  -- the figure printed on the receipt. At 10.00 a 115.00 SAR bill earns 1150
  -- points, worth 11.50 SAR — a true 10% back.
  earn_percent       numeric(5,2) not null default 10.00
                       check (earn_percent >= 0 and earn_percent <= 100),
  -- How long a redemption QR stays valid. Short on purpose: it is a bearer
  -- token for real money, shown on a screen at a counter.
  redeem_window_secs int not null default 180 check (redeem_window_secs between 30 and 3600),
  -- Months of inactivity before a balance lapses. See expire_stale_points().
  expiry_months      int not null default 12 check (expiry_months > 0),
  -- How long a bill QR stays claimable. Long enough to find the receipt in a
  -- pocket, short enough that the liability does not sit open forever.
  claim_window_days  int not null default 30 check (claim_window_days > 0),
  signup_bonus       int not null default 0 check (signup_bonus >= 0),
  updated_at         timestamptz not null default now()
);

insert into loyalty_settings (id) values (true);

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
/**
 * Points earned on a gross amount, in halalas.
 *
 * A straight percentage of what the customer paid. VAT is deliberately NOT
 * extracted first: the earn basis is the total on the receipt, so the customer
 * can reproduce the figure themselves. Extracting VAT would be marginally
 * cheaper and would make the number unverifiable at the counter, which is a bad
 * trade for a few halalas.
 *
 * Floored, so the shop never owes a fraction of a point.
 */
create or replace function points_for_amount(
  p_gross        int,
  p_earn_percent numeric default 10.00
) returns int
language sql immutable as $$
  select floor(p_gross * p_earn_percent / 100.0)::int
$$;

-- What an order earns, line by line.
--
-- Each line earns either its item's fixed `points_award` (times the quantity) or
-- the per-riyal rate on that line's total. Mixing the two is the point: most of
-- the menu earns by value, while a dish being pushed can be worth a flat number
-- regardless of what it costs.
--
-- An order with NO line items falls back to its grand total. A till that sends
-- only a ticket total — which is every POS integration until one is written —
-- still earns correctly.
--
-- Reward discounts are deliberately NOT deducted before earning. The customer
-- already paid for that discount in points; charging them a second time by
-- shrinking what the visit earns would be taking the same points twice.
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
         -- left join: menu_item_id is nullable, because an item can be deleted
         -- long after the order that sold it. Those lines earn by value.
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

  pts := points_for_order(o.id);
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
create or replace function expire_stale_points(p_months int default null)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  -- Null means "whatever the portal is set to". Passing a number overrides it,
  -- which is how the tests exercise expiry without editing the settings.
  p_months := coalesce(p_months, (select expiry_months from loyalty_settings));
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
-- Redemption QR: spending points at the counter
--
-- The customer chooses an amount in the portal and gets a QR. The cashier scans
-- it, the points come off, and the till takes that much off the bill.
--
-- This is a bearer token for REAL MONEY, displayed on a screen in a public
-- place, so it is deliberately short-lived and single-use. Three minutes is
-- long enough to reach the front of a queue and short enough that a photograph
-- of someone's screen is worthless by the time it is used.
--
-- The points are NOT deducted when the token is issued. Deducting up front
-- means an abandoned redemption silently costs the customer their balance, and
-- there is no moment at which anyone would notice. They come off when the
-- cashier scans, and only then.
-- ---------------------------------------------------------------------------

create table redemption_tokens (
  -- 10 characters from the same unambiguous alphabet as everything else here,
  -- so it can be read aloud when a scanner will not cooperate.
  token       text primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  points      int  not null check (points > 0),
  expires_at  timestamptz not null,
  redeemed_at timestamptz,
  -- Which staff member scanned it. Points are money; a dispute needs a name.
  redeemed_by uuid references staff(id),
  created_at  timestamptz not null default now(),

  constraint redemption_is_whole
    check ((redeemed_at is null) = (redeemed_by is null))
);

create index redemption_tokens_customer on redemption_tokens (customer_id, created_at desc);
-- Only one live token per customer at a time. Generating a second must invalidate
-- the first, or a customer could stack several screenshots and spend the same
-- points repeatedly.
create unique index redemption_one_live_per_customer
  on redemption_tokens (customer_id)
  where redeemed_at is null;

/**
 * Issues a redemption QR for a customer.
 *
 * Any earlier unredeemed token for that customer is deleted first, so exactly
 * one code is ever live. Balance is checked here for a clean error, and again
 * at redemption because the balance can move in between.
 */
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

/**
 * Spends a redemption token. Called by the cashier's scanner.
 *
 * Locks the token, so two tills scanning the same screen at once means the
 * second one waits and then finds it spent. Returns the amount so the till can
 * be told what to take off.
 */
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
  values (t.customer_id, -t.points, 'manual_adjust', p_staff_id,
          format('Redeemed %s points at the counter', t.points));

  return query
    select t.points, t.customer_id, c.full_name, c.member_code
    from customers c where c.id = t.customer_id;
end $$;

-- ---------------------------------------------------------------------------
-- Bill QR: claiming points after the fact
--
-- The counterpart to the cashier scanning a member's code. When nobody was
-- identified at the till — which is most walk-ins — the receipt carries a QR
-- instead. The customer scans it whenever they get round to it and the points
-- land in their account.
--
-- It is a bearer token: whoever holds the receipt can claim it, exactly like a
-- paper voucher, and it can only be claimed once. That is the intended
-- trade-off. The alternative is a claim that requires proving you were the one
-- who bought it, which nobody can do for a cash sale.
-- ---------------------------------------------------------------------------

create table order_claims (
  -- Short, unambiguous, and printed on a receipt that may be creased or faded:
  -- the alphabet omits 0/O/1/I/L so the code can be typed if the scan fails.
  token       text primary key,
  order_id    uuid not null unique references orders(id) on delete cascade,
  points      int  not null check (points > 0),
  expires_at  timestamptz not null,
  claimed_at  timestamptz,
  claimed_by  uuid references customers(id),
  created_at  timestamptz not null default now(),

  constraint claim_is_whole
    check ((claimed_at is null) = (claimed_by is null))
);

create index order_claims_unclaimed on order_claims (expires_at)
  where claimed_at is null;

create or replace function generate_claim_token()
returns text
language sql volatile as $$
  select string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random() * 31)::int) + 1, 1), ''
  )
  from generate_series(1, 10)
$$;

-- Issues the claim for an order, or returns the existing one.
--
-- Idempotent by the unique constraint on order_id: reprinting a receipt must
-- reprint the SAME code, not mint a second claim on the same sale.
create or replace function issue_order_claim(p_order_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o      orders%rowtype;
  pts    int;
  window_days int;
  tok    text;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  select token into tok from order_claims where order_id = p_order_id;
  if found then
    return tok;
  end if;

  -- An order that already credited a member has nothing left to give away.
  if exists (select 1 from loyalty_transactions
              where order_id = p_order_id and reason = 'earn_purchase') then
    raise exception 'order % already earned points for a member', p_order_id;
  end if;

  pts := points_for_order(p_order_id);
  if pts <= 0 then
    return null;
  end if;

  select claim_window_days into window_days from loyalty_settings;

  loop
    tok := generate_claim_token();
    begin
      insert into order_claims (token, order_id, points, expires_at)
      values (tok, p_order_id, pts, now() + make_interval(days => window_days));
      return tok;
    exception when unique_violation then
      -- A token collision, not an order collision. Try again.
      if exists (select 1 from order_claims where order_id = p_order_id) then
        raise;
      end if;
    end;
  end loop;
end $$;

-- Redeems a bill QR into a member's account.
--
-- Everything happens in one statement-level transaction: the claim is locked,
-- checked, marked, and the ledger row written. Two phones scanning the same code
-- at once means the second waits and then finds it claimed.
create or replace function claim_order_points(p_token text, p_customer_id uuid)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare c order_claims%rowtype;
begin
  select * into c from order_claims
   where token = upper(trim(p_token)) for update;

  if not found then
    raise exception 'that code is not one of ours';
  end if;
  if c.claimed_at is not null then
    raise exception 'those points have already been claimed';
  end if;
  if c.expires_at < now() then
    raise exception 'that code expired on %', to_char(c.expires_at, 'DD Mon YYYY');
  end if;
  if not exists (select 1 from customers where id = p_customer_id) then
    raise exception 'no such member';
  end if;

  update order_claims
     set claimed_at = now(), claimed_by = p_customer_id
   where token = c.token;

  insert into loyalty_transactions (customer_id, delta, reason, order_id)
  values (p_customer_id, c.points, 'earn_purchase', c.order_id);

  -- Attach the sale to the member now that we know who they are. The order was
  -- anonymous when it was rung up; this is the only moment that link exists.
  update orders
     set customer_id = coalesce(customer_id, p_customer_id),
         points_earned = c.points
   where id = c.order_id;

  return c.points;
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
alter table customer_credentials      enable row level security;
alter table device_tokens             enable row level security;
alter table orders                    enable row level security;
alter table order_items               enable row level security;
alter table order_item_modifiers      enable row level security;
alter table payments                  enable row level security;
alter table pickup_code_counters      enable row level security;
alter table rewards                   enable row level security;
alter table loyalty_settings          enable row level security;
alter table order_claims              enable row level security;
alter table redemption_tokens         enable row level security;
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
-- The earn rate is printed on the menu and told to customers at the counter.
-- There is nothing to hide, and the app needs it to show a projected balance.
create policy "public read" on loyalty_settings for select using (true);

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
revoke all on function issue_redemption(uuid, int)         from public;
revoke all on function redeem_points_token(text, uuid)     from public;
revoke all on function issue_order_claim(uuid)            from public;
revoke all on function claim_order_points(text, uuid)     from public;

grant execute on function mint_loyalty_points(uuid)          to service_role;
grant execute on function expire_stale_points(int)           to service_role;
grant execute on function redeem_reward(uuid, uuid)          to service_role;
grant execute on function next_invoice_number(uuid, timestamptz) to service_role;
grant execute on function next_pickup_code(uuid, date)       to service_role;
grant execute on function issue_redemption(uuid, int)         to service_role;
grant execute on function redeem_points_token(text, uuid)     to service_role;
grant execute on function issue_order_claim(uuid)            to service_role;
grant execute on function claim_order_points(text, uuid)     to service_role;

-- generate_member_code is deliberately NOT revoked. It is the DEFAULT on
-- customers.member_code, and a column default executes as the INSERTING role —
-- revoking it would make a customer creating their own profile row fail with
-- "permission denied for function", from a default they never referenced. It
-- confers nothing: no security definer, no table access, just a random string.

-- Safe for clients: read-only, and they can already see the branch.
grant execute on function is_branch_open(uuid, timestamptz) to anon, authenticated;
grant execute on function riyadh_service_date(timestamptz)  to anon, authenticated;
grant execute on function points_for_amount(int, numeric)    to anon, authenticated;
grant execute on function points_for_order(uuid)            to authenticated;

-- Staff-facing, and gated internally on the caller being active staff.
grant execute on function find_member(text) to authenticated;
grant execute on function is_staff_at(uuid, staff_role[]) to authenticated;
