-- STACKD / ستاكد — core data model
-- Target: Supabase (Postgres 15+). Money in halalas (integer) to avoid float drift.
-- Bilingual columns (_en / _ar) rather than a translations table: only two locales,
-- and every read needs both for RTL toggling anyway.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------

create table branches (
  id              uuid primary key default uuid_generate_v4(),
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
  is_active       boolean not null default true,
  accepts_pickup  boolean not null default true,
  -- Minutes from order acceptance to "ready for pickup". Drives the ETA shown.
  prep_time_mins  int not null default 15,
  created_at      timestamptz not null default now()
);

-- Opening hours, one row per weekday per branch. 0 = Sunday.
-- Separate table so Ramadan / holiday overrides can be layered on later.
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

-- Authoritative open/closed check. Handles the midnight wrap and pins the
-- comparison to Riyadh time (UTC+3, no DST) regardless of server timezone.
create or replace function is_branch_open(
  p_branch_id uuid,
  p_at        timestamptz default now()
) returns boolean
language sql stable as $$
  with l as (select (p_at at time zone 'Asia/Riyadh') as ts)
  select exists (
    select 1
    from l, branch_hours h
    where h.branch_id = p_branch_id
      and (
        -- Same-day window (e.g. 09:00–17:00)
        (h.closes_at > h.opens_at
         and extract(dow from l.ts)::int = h.weekday
         and l.ts::time >= h.opens_at
         and l.ts::time <  h.closes_at)

        -- Overnight window, evening leg: today's row, after opening
        or (h.closes_at < h.opens_at
            and extract(dow from l.ts)::int = h.weekday
            and l.ts::time >= h.opens_at)

        -- Overnight window, small-hours leg: YESTERDAY's row still running
        or (h.closes_at < h.opens_at
            and extract(dow from l.ts - interval '1 day')::int = h.weekday
            and l.ts::time < h.closes_at)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

create table categories (
  id          uuid primary key default uuid_generate_v4(),
  name_en     text not null,
  name_ar     text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

create table menu_items (
  id            uuid primary key default uuid_generate_v4(),
  category_id   uuid not null references categories(id),
  name_en       text not null,
  name_ar       text not null,
  description_en text,
  description_ar text,
  -- Base price in halalas. 3450 = 34.50 SAR.
  price         int  not null check (price >= 0),
  image_url     text,
  calories      int,
  -- Saudi menu-labelling rules require calories to be displayed; keep it nullable
  -- during data entry but flag items still missing it.
  is_active     boolean not null default true,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

-- Per-branch stock control: an item can be sold out at one branch only.
create table branch_menu_availability (
  branch_id     uuid not null references branches(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  is_available  boolean not null default true,
  primary key (branch_id, menu_item_id)
);

-- Modifiers: "Spice level" (pick 1), "Add-ons" (pick 0..n), etc.
create table modifier_groups (
  id            uuid primary key default uuid_generate_v4(),
  name_en       text not null,
  name_ar       text not null,
  min_select    int  not null default 0,
  max_select    int  not null default 1,
  check (max_select >= min_select)
);

create table modifiers (
  id            uuid primary key default uuid_generate_v4(),
  group_id      uuid not null references modifier_groups(id) on delete cascade,
  name_en       text not null,
  name_ar       text not null,
  price_delta   int  not null default 0,   -- halalas, may be 0
  is_active     boolean not null default true,
  sort_order    int  not null default 0
);

create table menu_item_modifier_groups (
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  group_id      uuid not null references modifier_groups(id) on delete cascade,
  sort_order    int  not null default 0,
  primary key (menu_item_id, group_id)
);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table customers (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text unique,          -- E.164, e.g. +9665XXXXXXXX
  email         text,
  locale        text not null default 'ar' check (locale in ('ar','en')),
  birthday      date,                 -- drives a birthday reward
  marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now()
);

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

create table orders (
  id              uuid primary key default uuid_generate_v4(),
  customer_id     uuid not null references customers(id),
  branch_id       uuid not null references branches(id),
  status          order_status not null default 'pending_payment',

  -- Short human-readable code called out at the counter. Unique per branch per day.
  pickup_code     text not null,

  -- Money, all halalas. Stored (not computed) so a menu price change never
  -- rewrites history.
  --
  -- ⚠ PRICES ARE VAT-INCLUSIVE. Saudi consumer-protection rules require the
  -- displayed price to include VAT, so a 27.00 SAR burger ALREADY contains its
  -- VAT — it is not 27.00 + 15%. Therefore:
  --
  --   grand_total = subtotal - discount_total
  --   vat_total   = the VAT component EXTRACTED from grand_total
  --                 (round(grand_total - grand_total / 1.15)), reported on the
  --                 ZATCA invoice. It is NOT added to grand_total.
  --
  -- Do not "add VAT" anywhere downstream. See packages/shared/src/money.ts
  -- (`splitVatInclusive`) for the canonical implementation, which guarantees
  -- net + vat = gross exactly so receipts never show a one-halala drift.
  subtotal        int not null,             -- sum of line totals, VAT-inclusive
  discount_total  int not null default 0,   -- from reward redemptions
  vat_total       int not null,             -- extracted 15% component
  grand_total     int not null,             -- what the customer actually pays
  constraint order_totals_reconcile
    check (grand_total = subtotal - discount_total),

  -- Loyalty outcome, snapshotted.
  points_earned   int not null default 0,
  points_redeemed int not null default 0,

  scheduled_for   timestamptz,  -- null = ASAP
  ready_at        timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create unique index orders_pickup_code_daily
  on orders (branch_id, pickup_code, (created_at::date));
create index orders_customer_recent on orders (customer_id, created_at desc);
-- Kitchen display query: open orders for one branch.
create index orders_branch_open on orders (branch_id, status)
  where status in ('paid','accepted','preparing','ready');

-- Line items snapshot name AND price. Never join to menu_items for money.
create table order_items (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid references menu_items(id),  -- nullable: item may be deleted later
  name_en       text not null,
  name_ar       text not null,
  unit_price    int  not null,
  quantity      int  not null check (quantity > 0),
  line_total    int  not null,
  notes         text
);

create table order_item_modifiers (
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_id   uuid references modifiers(id),
  name_en       text not null,
  name_ar       text not null,
  price_delta   int  not null
);

-- ---------------------------------------------------------------------------
-- Loyalty: append-only ledger. Balance is derived, never directly edited.
-- This is the part worth getting right — points are money to the customer,
-- and disputes need an auditable trail.
-- ---------------------------------------------------------------------------

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
  -- Staff member who authorised a manual adjustment.
  actor_id    uuid references auth.users(id),
  note        text,
  -- Points expire; null = never.
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index loyalty_tx_customer on loyalty_transactions (customer_id, created_at desc);

-- Cached balance for fast reads. Maintained by trigger below; the ledger stays
-- the source of truth and can always rebuild this.
create table loyalty_balances (
  customer_id     uuid primary key references customers(id) on delete cascade,
  balance         int not null default 0 check (balance >= 0),
  lifetime_earned int not null default 0,
  updated_at      timestamptz not null default now()
);

create or replace function apply_loyalty_transaction()
returns trigger language plpgsql as $$
begin
  insert into loyalty_balances (customer_id, balance, lifetime_earned)
  values (
    new.customer_id,
    new.delta,
    greatest(new.delta, 0)
  )
  on conflict (customer_id) do update set
    balance         = loyalty_balances.balance + new.delta,
    lifetime_earned = loyalty_balances.lifetime_earned + greatest(new.delta, 0),
    updated_at      = now();
  return new;
end $$;

create trigger loyalty_tx_apply
  after insert on loyalty_transactions
  for each row execute function apply_loyalty_transaction();

-- Reward catalogue: what points buy.
create table rewards (
  id              uuid primary key default uuid_generate_v4(),
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

-- ---------------------------------------------------------------------------
-- ZATCA e-invoicing (Phase 2). One row per issued tax invoice.
-- ---------------------------------------------------------------------------

create table tax_invoices (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null unique references orders(id),
  -- Sequential per branch, no gaps — ZATCA requirement.
  invoice_number text not null,
  uuid_field    uuid not null default uuid_generate_v4(),
  -- Base64 TLV payload rendered as the QR on the receipt.
  qr_payload    text not null,
  previous_hash text,          -- invoice chaining
  invoice_hash  text not null,
  cleared_at    timestamptz,   -- when ZATCA returned clearance
  zatca_status  text not null default 'pending',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table customers             enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table loyalty_transactions  enable row level security;
alter table loyalty_balances      enable row level security;

create policy "own profile" on customers
  for all using (auth.uid() = id);

create policy "own orders" on orders
  for select using (auth.uid() = customer_id);

create policy "own order items" on order_items
  for select using (
    exists (select 1 from orders o
            where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

-- Ledger is readable by its owner but writable only by service role /
-- server-side functions. No client-side point minting.
create policy "own ledger" on loyalty_transactions
  for select using (auth.uid() = customer_id);

create policy "own balance" on loyalty_balances
  for select using (auth.uid() = customer_id);

-- Menu and branches are public read.
alter table branches    enable row level security;
alter table categories  enable row level security;
alter table menu_items  enable row level security;
alter table rewards     enable row level security;

create policy "public read" on branches   for select using (is_active);
create policy "public read" on categories for select using (is_active);
create policy "public read" on menu_items for select using (is_active);
create policy "public read" on rewards    for select using (is_active);
