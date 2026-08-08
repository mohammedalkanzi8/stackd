-- 0003 — trading hours move to 16:00–04:00
--
-- The branch traded 15:00 → 03:00. It now opens an hour later and closes an
-- hour later: 4 PM to 4 AM, every day.
--
-- Two things change, and the second one is the one that is easy to miss.
--
--   1. `branch_hours`, which is what `is_branch_open()` reads. That function
--      takes the times from the table and handles the overnight wrap itself, so
--      it needs no edit.
--
--   2. `riyadh_service_date()`, the trading-day boundary. It subtracted four
--      hours, which was the old close plus one. Left alone against an 04:00
--      close it would put every ticket finalised after the kitchen shuts onto
--      the NEXT trading day — restarting pickup-code numbering mid-clean-down
--      and splitting one night's takings across two days' reports. It now
--      subtracts five, preserving exactly the one-hour cushion the old value
--      had.
--
-- ⚠ The website carries its own copy of the hours, because it is a static
-- export with no database: packages/shared/src/hours.ts (STACKD_HOURS), which
-- also feeds the schema.org opening hours Google reads. Applying this file
-- without deploying the site leaves the two disagreeing, and the one customers
-- see is the stale one.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0003_hours_16_to_04.sql
--
-- Safe to run twice.

begin;

-- Every day the same, which is how the branch actually trades. Written as an
-- update rather than a delete-and-insert so a branch with its own row for one
-- weekday is not silently flattened.
update branch_hours
   set opens_at = '16:00'::time,
       closes_at = '04:00'::time
 where branch_id = '00000000-0000-0000-0000-000000000001';

-- See the comment on this function in schema.sql: the offset is the closing
-- time plus an hour, deliberately.
create or replace function riyadh_service_date(p_at timestamptz)
returns date
language sql immutable as $$
  select ((p_at at time zone 'Asia/Riyadh') - interval '5 hours')::date
$$;

commit;

-- ---------------------------------------------------------------------------
-- Check it took.
-- ---------------------------------------------------------------------------
--
-- `open_at_0330` and `open_at_1600` must both be true, and `closed_at_0400`
-- true as well — the branch shuts AT four, it does not trade through it.
--
-- ⚠ `orders.service_date` is a STORED column, so nothing already banked moves.
-- Only tickets rung up from now on use the new boundary. That is the intended
-- behaviour: history stays exactly as it was reported at the time.
select (select count(*) from branch_hours
         where opens_at = '16:00' and closes_at = '04:00')            as rows_updated,
       is_branch_open('00000000-0000-0000-0000-000000000001',
                      timestamptz '2026-08-10 03:30:00+03')           as open_at_0330,
       is_branch_open('00000000-0000-0000-0000-000000000001',
                      timestamptz '2026-08-10 16:00:00+03')           as open_at_1600,
       not is_branch_open('00000000-0000-0000-0000-000000000001',
                          timestamptz '2026-08-10 04:00:00+03')       as closed_at_0400,
       riyadh_service_date(timestamptz '2026-08-10 04:20:00+03')
         = date '2026-08-09'                                          as late_ticket_is_last_night;
