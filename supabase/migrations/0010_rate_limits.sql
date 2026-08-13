-- 0010 — a place to count attempts, so brute force and scrypt flooding stop
--
-- Found in the pre-launch security review, 13 Aug 2026: there was no rate
-- limiting anywhere in the application. Both sign-in forms and the
-- forgotten-password form accepted unlimited attempts from any address on the
-- internet, with the staff portal's allowlist still open to 0.0.0.0/0.
--
-- ⚠ THE DENIAL-OF-SERVICE MATTERS MORE THAN THE GUESSING. Every attempt —
-- including failures against accounts that do not exist, because the login
-- deliberately verifies a dummy hash so it cannot leak which addresses are real
-- — costs about 64 MB and 100 ms of scrypt. This box has TWO CORES and also runs
-- Postgres, both portals and the till. A few dozen concurrent requests take the
-- counter offline mid-service, and no credential is needed to send them.
--
-- ⚠ COUNTED IN POSTGRES, NOT IN MEMORY. The portals are separate processes and
-- every deploy restarts them, so an in-memory counter is per-process AND erased
-- on restart: an attacker gets a fresh budget from each process and a clean
-- slate from every deploy.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0010_rate_limits.sql
--
-- Safe to run twice.

create table if not exists rate_limits (
  -- What is being limited: 'login', 'login_id', 'reset'. Namespaces the key so
  -- an email used for one does not consume another's budget.
  action       text not null,
  -- The caller: an IP, or an account identifier. Both are counted separately,
  -- so a botnet spread across addresses still trips the per-account limit and a
  -- single address still trips the per-IP one.
  key          text not null,
  attempts     int  not null default 0,
  window_start timestamptz not null default now(),
  primary key (action, key)
);

comment on table rate_limits is
  'Attempt counters for unauthenticated endpoints. Rows are disposable: losing '
  'the table costs one window of protection, never correctness, so it is '
  'deliberately not in any backup-critical path.';

-- Lets the sweep below find stale rows without a full scan once this grows.
create index if not exists rate_limits_window on rate_limits (window_start);

-- ⚠ RLS on with NO policy, exactly as the credential tables are. These rows say
-- which addresses and which accounts are under attack, which is reconnaissance
-- in itself. Only the portals' own role, which bypasses RLS as the database
-- owner, has any business reading them. supabase/schema.test.mjs fails the build
-- if a public table is ever left without RLS.
alter table rate_limits enable row level security;

-- Old windows are dead weight. Nothing schedules this yet; it is here so the
-- next person does not have to work out the predicate.
create or replace function prune_rate_limits(p_older_than interval default '1 day')
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from rate_limits where window_start < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function prune_rate_limits(interval) from public;
