-- 0013 — the earn rate gets a basis: including VAT, or excluding it
--
-- Asked for on 26 Aug 2026: the Points page should say which figure on the bill
-- the earn rate is applied to, and let the owner change it.
--
-- Menu prices in Saudi are VAT-INCLUSIVE, so the two figures are real money
-- apart. At 15% VAT and a 10% rate, a 115.00 SAR bill earns:
--
--     including VAT (default, and what this system has always done)  1150 pts
--     excluding VAT                                                  1000 pts
--
-- That is ~13% off the cost of running the programme, paid for by the number no
-- longer being reproducible from the receipt a customer is holding.
--
-- ⚠ DEFAULT false, WHICH PRESERVES TODAY'S BEHAVIOUR EXACTLY. Nothing about an
-- existing balance changes when this migration runs.
--
-- ⚠ CHANGING THE SETTING AFTERWARDS REPRICES EVERY FUTURE ORDER. Points already
-- minted are untouched — loyalty_transactions records what happened, not a
-- formula that gets re-run — so the ledger will legitimately contain rows
-- computed on both bases.
--
-- ⚠ THE WEBSITE STATES THE BASIS IN ITS TERMS ("earned on the bill total
-- including VAT"). packages/shared/src/rewards.ts now carries both sentences
-- and `npm run sync:menu` writes which one is true. Turning the setting on
-- means republishing the site, exactly as changing the earn rate does.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0013_earn_vat_basis.sql
--
-- Safe to run twice.

alter table loyalty_settings
  add column if not exists earn_excludes_vat boolean not null default false;

comment on column loyalty_settings.earn_excludes_vat is
  'false: the earn rate applies to the total paid, VAT included, so a customer '
  'can reproduce their points from the receipt. true: it applies to the pre-VAT '
  'net. Affects future orders only.';

-- ⚠ DROPPED, NOT REPLACED. `create or replace` cannot change an argument list;
-- it would leave the old two-argument function in place beside the new one and
-- every existing two-argument call site would then fail as ambiguous, because
-- the new arguments have defaults. Dropping first is what makes this a rename
-- rather than an overload.
--
-- Nothing depends on it in the catalogue sense — the callers are SQL function
-- bodies, which Postgres stores as text — so the drop is safe and the callers
-- below are rewritten whole in the same transaction.
begin;

drop function if exists points_for_amount(int, numeric);
drop function if exists points_for_amount(int, numeric, boolean, numeric);

-- The net is derived the way splitVatInclusive() derives it — round the VAT
-- component, subtract it — so the basis is the net printed on the receipt, to
-- the halala. `p_gross / 1.15` rounded on its own drifts by one.
create function points_for_amount(
  p_gross        int,
  p_earn_percent numeric default 10.00,
  p_excl_vat     boolean default false,
  p_vat_rate     numeric default 0.15
) returns int
language sql immutable as $$
  select floor(
    case
      when p_excl_vat then p_gross - round(p_gross - p_gross / (1 + p_vat_rate))
      else p_gross
    end * p_earn_percent / 100.0
  )::int
$$;

-- Rewritten whole rather than patched: this is the canonical body and it must
-- stay identical to the one in schema.sql. vat_rate is read from the ORDER, not
-- from a constant, so a future VAT change cannot rewrite what an old ticket
-- earned.
create or replace function points_for_order(p_order_id uuid)
returns int
language sql stable as $$
  with s as (select earn_percent, earn_excludes_vat from loyalty_settings),
       -- vat_rate comes from the ORDER, not from a constant: it is stored per
       -- order precisely so a rate change cannot rewrite what an old ticket
       -- earned.
       o as (select grand_total, vat_rate from orders where id = p_order_id),
       lines as (
         select case
                  when mi.points_award is not null then mi.points_award * oi.quantity
                  else points_for_amount(oi.line_total, s.earn_percent,
                                         s.earn_excludes_vat, o.vat_rate)
                end as pts
         from order_items oi
         -- left join: menu_item_id is nullable, because an item can be deleted
         -- long after the order that sold it. Those lines earn by value.
         left join menu_items mi on mi.id = oi.menu_item_id
         cross join s
         cross join o
         where oi.order_id = p_order_id
       )
  select coalesce(
    (select sum(pts)::int from lines),
    (select points_for_amount(o.grand_total, s.earn_percent,
                              s.earn_excludes_vat, o.vat_rate) from o, s),
    0
  )
$$;

grant execute on function points_for_amount(int, numeric, boolean, numeric)
  to anon, authenticated;
grant execute on function points_for_order(uuid) to authenticated;

commit;
