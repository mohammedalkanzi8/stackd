-- GO-LIVE RESET — deletes all trading and membership data. Keeps configuration.
--
-- ⚠⚠ THIS IS IRREVERSIBLE AND THERE IS NO UNDO. TAKE A VERIFIED BACKUP FIRST. ⚠⚠
--
-- Written for 12 Aug 2026: staff have been trained, the shop opens tomorrow, and
-- everything in the database is test and demonstration data that must not be
-- mistaken for real trade on day one.
--
-- Run with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -v confirm=WIPE \
--     -f - < supabase/go-live-reset.sql
--
-- Without `-v confirm=WIPE` it refuses and changes nothing. That guard exists
-- because the obvious way to run a file is without reading it first.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETED                                 KEPT
--   customers + their auth.users            branches, branch_hours, closures
--   customer_credentials                    categories, menu_items, modifiers
--   customer_password_resets                menu_item_modifier_groups
--   loyalty_balances                        branch_menu_availability
--   loyalty_transactions (the whole ledger) rewards
--   redemption_tokens                       loyalty_settings (10% / 500 / 100)
--   device_tokens                           staff + staff_credentials
--   orders, order_items,
--   order_item_modifiers, payments
--   tax_invoices, order_claims
--   invoice_counters, pickup_code_counters
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⚠ ORDER OF DELETION IS LOAD-BEARING. Three foreign keys into orders and
-- customers are ON DELETE NO ACTION rather than CASCADE — `orders.customer_id`,
-- `loyalty_transactions.order_id` and `tax_invoices.order_id`. Deleting
-- customers first fails; deleting orders before the ledger fails. The sequence
-- below is the one that works, and it is explicit rather than relying on cascade
-- so that a table added later shows up as an error instead of quietly surviving.
--
-- ⚠ THE COUNTERS ARE THE POINT OF THIS, NOT AN AFTERTHOUGHT. ZATCA requires tax
-- invoice numbers to be sequential per branch with no gaps. Opening a real shop
-- on invoice 8 because seven demo tickets were rung up would put a permanent
-- unexplained hole at the start of the books. Resetting them here means the
-- first real sale tomorrow is invoice 1 and pickup code 1.

\if :{?confirm}
\else
\echo ''
\echo '  REFUSING: this deletes every customer, order and loyalty row.'
\echo '  Re-run with  -v confirm=WIPE  once a verified backup exists.'
\echo ''
\quit
\endif

\echo '=== BEFORE ==='
select
  (select count(*) from customers)            as customers,
  (select count(*) from orders)               as orders,
  (select count(*) from loyalty_transactions) as ledger,
  (select count(*) from staff)                as staff,
  (select count(*) from menu_items)           as menu_items,
  (select count(*) from rewards)              as rewards;

begin;

-- 1. Everything hanging off a customer that is not the customer.
delete from customer_password_resets;
delete from redemption_tokens;
delete from device_tokens;

-- 2. The ledger, before orders — loyalty_transactions.order_id is NO ACTION.
delete from loyalty_transactions;
delete from loyalty_balances;

-- 3. Everything hanging off an order, then the orders.
delete from order_claims;
delete from order_item_modifiers;
delete from order_items;
delete from payments;
delete from tax_invoices;
delete from orders;

-- 4. The customers themselves, then their identities. Staff share auth.users, so
--    this is scoped by "is not a staff member" rather than truncating the table.
delete from customer_credentials;
delete from customers;
delete from auth.users u
 where not exists (select 1 from staff s where s.id = u.id);

-- 5. Numbering starts again at one. See the note above about ZATCA.
delete from invoice_counters;
delete from pickup_code_counters;

-- 6. The owner's display name. The email is the login and does not change.
update staff set full_name = 'Stackd Owner'
 where id in (select id from auth.users where email = 'info@stackd.com.sa');

commit;

\echo ''
\echo '=== AFTER — every count on the left must be 0 ==='
select
  (select count(*) from customers)            as customers,
  (select count(*) from orders)               as orders,
  (select count(*) from loyalty_transactions) as ledger,
  (select count(*) from loyalty_balances)     as balances,
  (select count(*) from redemption_tokens)    as tokens,
  (select count(*) from tax_invoices)         as invoices,
  (select count(*) from invoice_counters)     as inv_counters,
  (select count(*) from pickup_code_counters) as pickup_counters;

\echo ''
\echo '=== KEPT — configuration and staff ==='
select
  (select count(*) from staff)           as staff,
  (select count(*) from staff_credentials) as staff_logins,
  (select count(*) from menu_items)      as menu_items,
  (select count(*) from categories)      as categories,
  (select count(*) from rewards)         as rewards,
  (select count(*) from branches)        as branches,
  (select count(*) from branch_hours)    as branch_hours,
  (select count(*) from loyalty_settings) as settings;

\echo ''
\echo '=== staff, with the renamed owner ==='
select s.role, s.full_name, u.email, s.is_active
  from staff s join auth.users u on u.id = s.id
 order by s.role;

\echo ''
\echo '=== no orphaned auth.users left behind ==='
select count(*) as orphan_users
  from auth.users u
 where not exists (select 1 from staff s where s.id = u.id);
