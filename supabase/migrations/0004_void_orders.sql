-- 0004 — voiding an order, Super Admin only
--
-- The portal had no way to undo a ticket at all. The owner asked for one on
-- 12 Aug 2026, phrased as "delete or modify orders".
--
-- ⚠ IT DOES NOT DELETE. `invoice_counters` issues tax invoice numbers that are
-- sequential per branch with NO GAPS, which is a ZATCA requirement, not a
-- preference. Deleting an invoiced order punches a hole in that sequence and
-- there is no legitimate way to fill it. So a voided order stays exactly where
-- it is, keeps its number, and is marked.
--
-- Three columns rather than a new `order_status` value, deliberately, and for
-- the same reason `payments` is a separate table from `status`: `order_status`
-- tracks FULFILMENT — where the food is. Voiding is an accounting act. A ticket
-- can be `completed` (the customer ate) and still be voided (it was rung up
-- twice), and one enum cannot hold both facts.
--
--   voided_at     when. NULL means not voided, and that is the whole test.
--   voided_by     who. Points at staff, never deleted, so the name survives.
--   void_reason   why. Required — a void with no reason is indistinguishable
--                 from a mistake six months later.
--
-- ⚠ ANYTHING THAT SUMS MONEY MUST EXCLUDE `voided_at IS NOT NULL`. At the time
-- of writing that is the reports page and the counter; grep for `grand_total`
-- before adding another.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0004_void_orders.sql
--
-- Safe to run twice.

alter table orders add column if not exists voided_at   timestamptz;
alter table orders add column if not exists voided_by   uuid references staff(id);
alter table orders add column if not exists void_reason text;

-- All three travel together or none of them do. Without this a void can be
-- recorded with nobody's name against it, which defeats the point of the column.
alter table orders drop constraint if exists orders_void_complete;
alter table orders add constraint orders_void_complete check (
  (voided_at is null and voided_by is null and void_reason is null)
  or
  (voided_at is not null and voided_by is not null
   and void_reason is not null and length(btrim(void_reason)) > 0)
);

-- Partial: voids are rare, and every money query filters on the NULL side, so
-- indexing only the voided rows keeps it small and still answers "which tickets
-- were voided this month".
create index if not exists orders_voided on orders (branch_id, voided_at)
  where voided_at is not null;

comment on column orders.voided_at is
  'Set when a Super Admin voids the ticket. The row and its invoice number stay '
  '— ZATCA requires a gapless sequence. Every sum of money must exclude these.';
