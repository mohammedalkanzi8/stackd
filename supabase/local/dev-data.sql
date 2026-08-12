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
  -- The owner's own admin-portal login, added 12 Aug 2026. A REAL address on a
  -- REAL domain, unlike the .local fixtures beside it, because this is the
  -- account he actually signs in with. It exists here so the portal can be
  -- worked on locally; on production it is created through Staff → Add, and the
  -- password set with `npm run admin:passwd -- mohamed.kanzi@stackd.com.sa`.
  --
  -- Note this is NOT the address customers see. The public site publishes
  -- info@stackd.com.sa — see BRANCH.email.
  ('a0000000-0000-0000-0000-000000000004', '+966500338808', 'mohamed.kanzi@stackd.com.sa'),
  ('c0000000-0000-0000-0000-000000000001', '+966555000001', null),
  ('c0000000-0000-0000-0000-000000000002', '+966555000002', null);

insert into staff (id, branch_id, role, full_name) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'cashier', 'Dev Cashier'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'kitchen', 'Dev Kitchen'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'owner',   'Dev Owner'),
  -- `owner` is the Super Admin tier: staff, voiding orders, and points.
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'owner',   'Mohamed Kanzi');

-- Admin portal logins. The password for all three is `stackd-dev`.
--
-- Safe to hard-code precisely because this file never ships: it writes to
-- auth.users, which on a real project is GoTrue's table and not ours. On a real
-- deployment, staff passwords are set with `npm run admin:passwd -- <email>`
-- and no default exists.
insert into staff_credentials (staff_id, password_hash) values
  ('a0000000-0000-0000-0000-000000000001',
   'scrypt$65536$8$1$ejMWb4Y0zKUhGku7Kz4Lkg==$zRPNrAOt8q2J9aW+h27tPMcvTU74L0B/AoMT/l1eQPY='),
  ('a0000000-0000-0000-0000-000000000002',
   'scrypt$65536$8$1$ejMWb4Y0zKUhGku7Kz4Lkg==$zRPNrAOt8q2J9aW+h27tPMcvTU74L0B/AoMT/l1eQPY='),
  ('a0000000-0000-0000-0000-000000000003',
   'scrypt$65536$8$1$ejMWb4Y0zKUhGku7Kz4Lkg==$zRPNrAOt8q2J9aW+h27tPMcvTU74L0B/AoMT/l1eQPY='),
  ('a0000000-0000-0000-0000-000000000004',
   'scrypt$65536$8$1$ejMWb4Y0zKUhGku7Kz4Lkg==$zRPNrAOt8q2J9aW+h27tPMcvTU74L0B/AoMT/l1eQPY=');

-- member_code is pinned rather than generated so the RLS and loyalty tests can
-- scan a known code.
insert into customers (id, member_code, full_name, phone, email, locale) values
  ('c0000000-0000-0000-0000-000000000001', 'DEV22222', 'Dev Customer One', '+966555000001', 'one@stackd.local',  'ar'),
  ('c0000000-0000-0000-0000-000000000002', 'DEV33333', 'Dev Customer Two', '+966555000002', 'two@stackd.local', 'en');

-- Loyalty portal logins for the two dev customers. Password `123` — shortened
-- on request 12 Aug 2026, because these two get signed in and out of constantly
-- while testing the redemption flow. The STAFF fixtures above are unchanged and
-- still `stackd-dev`.
--
-- Sign in at localhost:3002 with either the mobile number or the email.
--
-- `123` is below the 8-character minimum the portal enforces when a password is
-- SET (registration, and the staff form in the admin portal). Logging in does
-- not re-check length, it only verifies the hash, so these still work — but you
-- cannot recreate them through the registration form, only from this file.
insert into customer_credentials (customer_id, password_hash) values
  ('c0000000-0000-0000-0000-000000000001',
   'scrypt$65536$8$1$Ge/JqAJhG0lHZPRQoKt2Xw==$i3pkjtvN9rt6dRUK0zkv5NWQgTZ6YKCPHcCemvfJAOQ='),
  ('c0000000-0000-0000-0000-000000000002',
   'scrypt$65536$8$1$Ge/JqAJhG0lHZPRQoKt2Xw==$i3pkjtvN9rt6dRUK0zkv5NWQgTZ6YKCPHcCemvfJAOQ=');
