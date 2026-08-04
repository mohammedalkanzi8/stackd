-- STACKD — local development shim. NOT part of the deployed schema.
--
-- `schema.sql` targets Supabase, which supplies an `auth` schema, an
-- `auth.uid()` function, and the three PostgREST roles out of the box. A bare
-- Postgres has none of them, so applying `schema.sql` locally fails on the
-- `customers.id -> auth.users(id)` foreign key.
--
-- Rather than keeping a stripped-down copy of the schema for local work — which
-- would drift, and drift silently — this file fakes just enough of the Supabase
-- platform that `schema.sql` applies BYTE-IDENTICAL to what a real project would
-- receive. Never edit schema.sql to accommodate local Postgres. Edit this.
--
-- Applied only by scripts/db-reset.mjs. Never ship it.

-- ---------------------------------------------------------------------------
-- Roles
--
-- PostgREST connects as `authenticator` and switches into one of these per
-- request. `service_role` carries bypassrls, which is what makes "points are
-- minted server-side only" enforceable: no policy can be talked around, and no
-- client ever holds this role.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase's real auth.users has ~30 columns of GoTrue bookkeeping. Only the
-- primary key matters to us: everything else about a person lives in
-- `public.customers`, which is ours to shape.
create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  phone         text unique,
  email         text unique,
  created_at    timestamptz not null default now()
);

-- Supabase reads the subject claim out of the request JWT. Locally there is no
-- JWT, so tests impersonate a user by setting the claim directly:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>"}';
--
-- The `true` second argument to current_setting means "return null if unset"
-- rather than raising, which is what makes anon (no claim at all) work.
--
-- The inner nullif is not decoration. Once a custom GUC has been SET LOCAL and
-- the transaction has ended, it reverts to the EMPTY STRING rather than to
-- unset — so `current_setting(..., true)` returns '' and `''::json` raises
-- "invalid input syntax for type json". The symptom is that anonymous access
-- works in a fresh session and breaks the moment any earlier transaction
-- impersonated a user.
create or replace function auth.uid()
returns uuid
language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public schema grants
--
-- Supabase grants these by default, and RLS — not the grant — is what actually
-- gates access. Without them every policy in schema.sql would be untestable
-- locally: the role would be refused at the table before any policy ran, and a
-- broken policy would look identical to a working one.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
