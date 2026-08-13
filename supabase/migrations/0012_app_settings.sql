-- 0012 — settings the owner can change without an SSH session
--
-- Requested 13 Aug 2026, and the request behind the request was a question:
-- "where do I configure the SMTP?" The answer was `deploy/.env` on the VM plus a
-- container restart, which is not something the owner of a burger shop can do
-- from a phone at the counter.
--
-- ⚠ THIS MOVES A CREDENTIAL FROM A FILE ON THE VM INTO THE DATABASE, and that is
-- a real trade, not a free improvement. An admin account is now closer to the
-- mail password than it was. The password is encrypted at rest with a key
-- derived from STACKD_ADMIN_SECRET (see packages/server/src/secrets.ts), which
-- does NOT stop the portal reading it — the portal must be able to — but does
-- close the cheap paths: a database dump, a backup, a `select *`, a screenshot.
-- Those are how credentials actually leak.
--
-- ⚠ ENV REMAINS THE FALLBACK, NOT A LEGACY PATH. Every value here is nullable
-- and the resolver prefers the database only when a row actually has one. That
-- is what makes this migration safe to apply to a running system: nothing
-- changes until somebody fills the form in, and clearing a field returns that
-- setting to the environment rather than breaking mail.
--
-- ⚠ WHAT IS DELIBERATELY *NOT* HERE:
--   STACKD_PORTAL_URL   — encoded into every printed QR code and poster. A typo
--                         in a web form would silently invalidate paper already
--                         on the wall. It stays somewhere that requires
--                         deliberate effort.
--   wallet certificates — PEM files and passphrases, not form-shaped.
--   ADMIN_ALLOW_CIDR    — enforced by Caddy, before the app is reached at all.
--                         A setting the app could edit would not be a control.
--   loyalty settings    — already have a home on the Points page, next to the
--                         menu items they price. Moving them there would make
--                         both screens worse.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0012_app_settings.sql
--
-- Safe to run twice.

create table if not exists app_settings (
  -- The same singleton trick loyalty_settings uses: one row, enforced by the
  -- type of the key rather than by anybody remembering.
  id                  boolean primary key default true check (id),

  -- SMTP. Split into fields rather than stored as one URL because a URL forces
  -- whoever edits it to percent-encode the @ in a mailbox username, which is
  -- exactly the mistake that makes authentication fail in a way nobody can read.
  smtp_host           text,
  smtp_port           int check (smtp_port is null or (smtp_port > 0 and smtp_port < 65536)),
  -- true = implicit TLS (465), false = STARTTLS (587). Getting this backwards
  -- is the other classic failure: it hangs rather than erroring.
  smtp_secure         boolean not null default true,
  smtp_user           text,
  -- ⚠ CIPHERTEXT, never plaintext. `v1:<iv>:<tag>:<ct>`, AES-256-GCM.
  smtp_password_enc   text,

  -- ⚠ TWO SENDERS, ON PURPOSE. A password reset is transactional and must reach
  -- the inbox; a promotion is marketing and is the thing most likely to be
  -- reported as spam. Sending both from one address means a customer marking an
  -- offer as junk can bury the reset code that customer will need later. Kept
  -- separate so the reputations can be separated too.
  mail_from_reset     text,
  mail_from_promo     text,

  updated_at          timestamptz not null default now(),
  updated_by          uuid references staff(id)
);

comment on table app_settings is
  'Operational settings the owner can change from the admin portal. One row. '
  'Every column is nullable and falls back to the environment when empty.';

comment on column app_settings.smtp_password_enc is
  'AES-256-GCM ciphertext keyed from STACKD_ADMIN_SECRET. Rotating that secret '
  'makes this unreadable, at which point mail falls back to SMTP_URL from the '
  'environment rather than failing.';

-- The singleton row, so the page never has to handle "no settings yet".
insert into app_settings (id) values (true) on conflict (id) do nothing;

-- ⚠ RLS on with NO policy, exactly as the credential tables are. This row holds
-- an encrypted mail password and the shop's sending identity. Only the portals'
-- own role, which bypasses RLS as the database owner, has any business reading
-- it. supabase/schema.test.mjs fails the build if a public table is ever left
-- without RLS.
alter table app_settings enable row level security;

do $$
declare has_smtp boolean;
begin
  select smtp_host is not null into has_smtp from app_settings;
  raise notice 'app_settings ready. SMTP configured in the database: %  (falls back to SMTP_URL when not)',
    coalesce(has_smtp, false);
end $$;
