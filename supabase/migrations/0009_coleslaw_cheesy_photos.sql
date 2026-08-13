-- 0009 — point Coleslaw and Cheesy-Cheese at the photographs that already ship
--
-- Reported from the live site 13 Aug 2026: the Sides row shows a real photo for
-- Fries and the branded placeholder for the other two.
--
-- ⚠ THE PHOTOGRAPHS WERE NEVER MISSING. `coleslaw.webp` and `cheesy-cheese.webp`
-- have been in `apps/web/public/menu` since the August shoot and are built into
-- every deploy of the site. What is missing is `menu_items.image_url` on THIS
-- database: the rows were given their paths in `seed.sql`, and seed.sql only
-- ever runs against an empty volume. Production was migrated, not reseeded, so
-- the two paths added that day never reached it.
--
-- That is the divergence the note at the top of schema.sql warns about, showing
-- up in data rather than in structure: a change made only in seed.sql is
-- invisible to every database that already exists.
--
-- ⚠ SEED AND MIGRATION BOTH, ALWAYS — the same rule the schema already states.
-- `seed.sql` is correct and stays as it is; this carries the same fact to a
-- database that is already running.
--
-- Apply with:
--   docker compose -f deploy/docker-compose.yml exec -T db \
--     psql -U stackd -d stackd -v ON_ERROR_STOP=1 -f - < supabase/migrations/0009_coleslaw_cheesy_photos.sql
--
-- Safe to run twice. Only fills a NULL, so a path deliberately cleared later is
-- left alone rather than being put back by a re-run.

update menu_items
   set image_url = '/menu/' || slug || '.webp'
 where slug in ('coleslaw', 'cheesy-cheese')
   and image_url is null;

-- Report what is still without a photo, so the result is legible in a deploy log
-- rather than assumed.
--
-- ⚠ Sauces and drinks are EXPECTED here. They are deliberately text-only cards,
-- on the printed menu as well as the site, so a non-empty list is not in itself
-- a fault — only a main dish appearing in it is.
do $$
declare missing text;
begin
  select string_agg(slug, ', ' order by slug) into missing
    from menu_items where is_active and image_url is null;
  raise notice 'active items still without a photo: %', coalesce(missing, '(none)');
end $$;
