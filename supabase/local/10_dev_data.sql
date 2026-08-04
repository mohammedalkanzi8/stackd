-- STACKD — development fixtures. NEVER applied to production.
--
-- seed.sql is the real menu and belongs in any database that serves the app.
-- This file is the people: auth users, a cashier, a kitchen screen, and two
-- customers to exercise loyalty against. It writes to auth.users, which on a
-- real Supabase project is GoTrue's table and is not ours to populate.
--
-- Applied only by scripts/db-reset.mjs, and skipped with --no-dev-data.
--
-- Fixed UUIDs so tests can reference them without a lookup.

insert into auth.users (id, phone, email) values
  ('a0000000-0000-0000-0000-000000000001', '+966500000001', 'cashier@stackd.local'),
  ('a0000000-0000-0000-0000-000000000002', '+966500000002', 'kitchen@stackd.local'),
  ('a0000000-0000-0000-0000-000000000003', '+966500000003', 'owner@stackd.local'),
  ('c0000000-0000-0000-0000-000000000001', '+966555000001', null),
  ('c0000000-0000-0000-0000-000000000002', '+966555000002', null);

insert into staff (id, branch_id, role, full_name) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'cashier', 'Dev Cashier'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'kitchen', 'Dev Kitchen'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'owner',   'Dev Owner');

-- member_code is pinned rather than generated so the RLS and loyalty tests can
-- scan a known code.
insert into customers (id, member_code, full_name, phone, locale) values
  ('c0000000-0000-0000-0000-000000000001', 'DEV22222', 'Dev Customer One', '+966555000001', 'ar'),
  ('c0000000-0000-0000-0000-000000000002', 'DEV33333', 'Dev Customer Two', '+966555000002', 'en');
