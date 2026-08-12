-- STACKD — menu seed data
--
-- Arabic names taken from the in-store menu board and STACKD's own launch
-- posters (both authoritative). Prices/calories from the newer digital menu (the
-- one on Google Maps), which carries two items the in-store board does not.
--
-- ⚠ CONFLICTS between the two menus are marked `-- CONFLICT:` below and need an
-- owner decision before launch. Four remain open — see docs/DISCREPANCIES.md.
--
-- This file is production data: the real menu, applied to whatever database
-- serves the app. Development fixtures — auth users, staff logins, a test
-- customer — live in supabase/local/10_dev_data.sql and never ship.
--
-- ⚠ THIS FILE IS NOW THE SOURCE OF TRUTH FOR THE WEBSITE MENU.
-- packages/shared/src/menu.ts is generated from the database by
-- `npm run sync:menu`. Edit here, re-seed, regenerate. Editing menu.ts directly
-- gets overwritten.

-- ---------------------------------------------------------------------------
-- Branch
-- ---------------------------------------------------------------------------

insert into branches (
  id, name_en, name_ar, address_en, address_ar, city_en, city_ar,
  phone, postal_code, plus_code, prep_time_mins
)
values (
  '00000000-0000-0000-0000-000000000001',
  'STACKD North Khobar',
  'ستاكد - الخبر الشمالية',
  '76X9+7P5, Al Khobar Al Shamalia',
  '76X9+7P5، الخبر الشمالية',
  'Al Khobar', 'الخبر',
  '+966500338808',   -- displayed locally as 050 033 8808
  '31311',
  '76X9+7P5',
  15
);
-- TODO: the National Address (short address, e.g. ABCD1234) is still needed.
-- ZATCA requires the seller's address on a tax invoice and a Plus Code does not
-- satisfy that. Look it up at https://splonline.com.sa
-- Also still missing, and needed on every receipt: vat_number and cr_number.

-- Opening hours: 15:00 → 03:00, every day of the week.
-- closes_at < opens_at marks an overnight window — see is_branch_open().
insert into branch_hours (branch_id, weekday, opens_at, closes_at)
select '00000000-0000-0000-0000-000000000001', d, '16:00'::time, '04:00'::time
from generate_series(0, 6) as d;

-- ---------------------------------------------------------------------------
-- Categories — order matches the in-store board reading order
--
-- show_photos is false for sauces and drinks: a 3 SAR sauce does not earn a
-- photo, and seventeen placeholder tiles read as unfinished. The printed menu
-- treats them the same way.
-- ---------------------------------------------------------------------------

insert into categories (id, slug, name_en, name_ar, show_photos, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'burgers', 'Stackd Burgers & Sandwiches', 'برجر ستاكد',   true,  1),
  ('10000000-0000-0000-0000-000000000002', 'giants',  'Giants',                      'العماليق',      true,  2),
  ('10000000-0000-0000-0000-000000000003', 'sides',   'Sides',                       'أطباق جانبية',  true,  3),
  ('10000000-0000-0000-0000-000000000004', 'sauces',  'Sauces',                      'صلصات',         false, 4),
  ('10000000-0000-0000-0000-000000000005', 'drinks',  'Drinks',                      'مشروبات',       false, 5);

-- ---------------------------------------------------------------------------
-- Burgers & sandwiches
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, slug, name_en, name_ar, description_en, description_ar,
   price, calories, image_url, photo_note, sort_order)
values
  ('10000000-0000-0000-0000-000000000001',
   'classic-stackd', 'Classic-Stackd', 'كلاسيك - ستاكد',
   'Bun, chicken breast, coleslaw, mayo',
   'خبز برجر - صدر دجاج - سلطة كول سلو - مايونيز',
   2700, 550,
   '/menu/classic-stackd.webp',
   'August 2026 shoot, supplied by the owner and the same frame the printed menu uses. Replaces the upscaled crop from the July launch post. Native 4:3 at 1280x960, so the card gets the whole frame with no crop.',
   1),
   -- CONFLICT: in-store board shows 850 cal, digital menu shows 550. Still open.

  ('10000000-0000-0000-0000-000000000001',
   'maple-stackd', 'Maple-Stackd', 'ميبل - ستاكد',
   'Bun, chicken breast, maple sauce, mayo',
   'خبز برجر - صدر دجاج - مايونيز - صلصة الميبل',
   2900, 685,
   '/menu/maple-stackd.webp',
   'Same provenance as classic-stackd — August 2026, matches the printed menu.',
   2),

  ('10000000-0000-0000-0000-000000000001',
   'big-stackd', 'Big-Stackd', 'بيج - ستاكد',
   'Bun, chicken breast, brisket, maple sauce, mayo',
   'خبز برجر - صدر دجاج - لحم بريسكيت - مايونيز - صلصة الميبل',
   4800, 1200,
   '/menu/big-stackd.webp',
   'Same provenance as classic-stackd — August 2026, matches the printed menu.',
   3),

  -- Not present on the in-store board. Digital menu only.
  ('10000000-0000-0000-0000-000000000001',
   'tortilla-strips', 'Tortilla Strips', 'تورتيلا الدجاج',
   'Tortilla bread, Stackd sauce, lettuce, crispy fresh chicken, cheese, fries',
   'خبز تورتيلا - صلصة ستاكد - خس - دجاج طازج مقرمش - جبنة - بطاطس',
   1900, 890,
   '/menu/tortilla-strips.webp',
   'July 2026 camera shoot, now from the full-resolution original (DSC07611, 1991x2877) rather than the earlier export. Portrait, so the 4:3 card keeps the cut face top-left and the fries bottom-right — see the crop in scripts/shoot-to-web.mjs.',
   4),
   -- RESOLVED 3 Aug 2026: the Arabic name is STACKD's own, from the launch
   -- poster. It is not a translation of the English, which is why it reads
   -- "tortilla chicken" rather than "tortilla strips".

  ('10000000-0000-0000-0000-000000000001',
   'chicken-strips', 'Chicken Strips', 'ستربس الدجاج',
   '4 pcs of fresh, crispy chicken strips with fries and dipping sauce',
   '٤ قطع من شرائح الدجاج الطازجة المقرمشة مع البطاطس وصلصة الغمس',
   2300, 950,
   '/menu/chicken-strips.webp',
   'July 2026 camera shoot. Full resolution.',
   5);
   -- RESOLVED 3 Aug 2026: Arabic name likewise from the launch poster.

-- ---------------------------------------------------------------------------
-- Giants
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, slug, name_en, name_ar, description_en, description_ar,
   price, calories, spicy, image_url, photo_note, sort_order)
values
  ('10000000-0000-0000-0000-000000000002',
   'scoopy-doo', 'Scoopy-Doo', 'سكوبي - دو',
   -- No Nashville seasoning here — that is what separates this from Fire-Attack,
   -- and marking it spicy would imply heat this dish does not have.
   'Mac n'' cheese, chicken strips, Stackd sauce, cheddar sauce, coleslaw, pickles, seasoned fries',
   'مكرونة بالجبنة - شرائح دجاج - صلصة ستاكد - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
   2500, 1100, false,
   '/menu/scoopy-doo.webp',
   'August 2026 shoot: the kraft bowl as actually served, with the coleslaw and pickle pots beside it. This REPLACES the launch-post poster the owner preferred on 3 Aug 2026 — that preference was against an older, worse bowl photo, and this frame is the one the printed menu now uses. Revert to the poster here if the owner disagrees.',
   1),
   -- CONFLICT: in-store board shows 1500 cal, digital menu shows 1100. Still open.

  ('10000000-0000-0000-0000-000000000002',
   'fire-attack', 'Fire-Attack', 'فاير - أتاك',
   'Mac n'' cheese, spicy chicken strips, Stackd sauce, Nashville seasoning, cheddar sauce, coleslaw, pickles, seasoned fries',
   'مكرونة بالجبنة - شرائح دجاج حارة - صلصة ستاكد - ناشفيل - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
   2700, 1200, true,
   '/menu/fire-attack.webp',
   'The Scoopy-Doo bowl again, because the owner confirmed on 12 Aug 2026 that the two Giants are one dish with a different sauce. THE SAME UNCROPPED FRAME as Scoopy-Doo, on the owner''s instruction — the difference between the two cards is carried entirely by the sauce, which is what separates the two dishes. The heat is a grade MASKED TO THE BOWL: the sauce and chicken go red, the bowl, table, coleslaw and pickles stay exactly as shot. Two earlier attempts were rejected — grading the whole frame read as a warm filter over a mild dish, and a tighter crop changed the framing when only the sauce should change. The drawn-in jalapenos from the 3 Aug composite are GONE; they were never in the recipe. Nothing is added to the food.',
   2);
   -- CONFLICT: in-store board shows 1600 cal, digital menu shows 1200. Still open.

-- ---------------------------------------------------------------------------
-- Sides
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, slug, name_en, name_ar, price, calories, image_url, photo_note, sort_order)
values
  ('10000000-0000-0000-0000-000000000003', 'fries', 'Fries', 'بطاطس مقلية', 900, 420,
   '/menu/fries.webp',
   'August 2026 packshot in the branded scoop, chosen by the owner on 12 Aug over the July camera shot. RE-PLATED: lifted off its pale blue studio sweep and stood on a table built from the Scoopy-Doo frame, so the Sides row matches the rest of the menu. ⚠ These read as seasoned, where the July frame was deliberately plain because the owner confirmed the side is plain. The owner picked this one knowing that; the description and 420 kcal still describe plain fries.',
   1),
  ('10000000-0000-0000-0000-000000000003', 'coleslaw', 'Coleslaw', 'سلطة كول سلو', 400, 384,
   '/menu/coleslaw.webp',
   'August 2026 packshot. RE-PLATED onto the menu''s own table — the concrete it was shot on could not be graded to match, because the concrete and the tub are the same neutral grey at the same brightness and nothing separates them by colour. The tub is a circle, so its own shape is the mask. First photograph this item has ever had.',
   2),
  ('10000000-0000-0000-0000-000000000003', 'cheesy-cheese', 'Cheesy-Cheese', 'تشيزي - تشيز', 600, 245,
   '/menu/cheesy-cheese.webp',
   'Cheese fries, supplied by the owner on 12 Aug 2026, replacing the composite that stood a cheese pot beside the fries scoop. ⚠⚠ NOT STACKD''S OWN PHOTOGRAPHY. No branded packaging, a metal tray and a marble surface — none of it matches the shoot or how the side is served. If it came from a stock or recipe site, CHECK THE LICENCE BEFORE THIS GOES LIVE. It also keeps its bright ground while Fries and Coleslaw were moved onto the dark table, so it is now the odd card in the Sides row.',
   3);
   -- Both of these were placeholder cards until 12 Aug 2026.

-- ---------------------------------------------------------------------------
-- Sauces — all 3 SAR
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, slug, name_en, name_ar, price, calories, spicy, sort_order)
values
  ('10000000-0000-0000-0000-000000000004', 'stackd-sauce',  'Stackd Sauce',  'ستاكد',      300, 67, false, 1),
  ('10000000-0000-0000-0000-000000000004', 'ranch',         'Ranch',         'رانش',       300, 62, false, 2),
  ('10000000-0000-0000-0000-000000000004', 'honey-mustard', 'Honey Mustard', 'هني مسترد',  300, 75, false, 3),
  ('10000000-0000-0000-0000-000000000004', 'nashville',     'Nashville',     'ناشفيل',     300,  6, true,  4);

-- ---------------------------------------------------------------------------
-- Drinks
-- ⚠ CALORIE DATA IS WRONG ON BOTH PRINTED MENUS.
-- Both show 67 / 62 / 75 for soft drink / Kenza / water — byte-identical to the
-- sauces column above. The values were duplicated in the artwork by mistake.
-- Water is 0 kcal, definitively. The other two are left NULL rather than seeding
-- known-bad data, because Saudi menu-labelling rules require accurate calorie
-- display. The website omits the figure rather than printing a wrong one.
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, slug, name_en, name_ar, price, calories, sort_order)
values
  ('10000000-0000-0000-0000-000000000005', 'soft-drink', 'Soft Drink', 'مشروبات غازية', 800, null, 1),
  ('10000000-0000-0000-0000-000000000005', 'kenza',      'Kenza',      'كينزا',         300, null, 2),
  ('10000000-0000-0000-0000-000000000005', 'water',      'Water',      'ماء',           200,    0, 3);
  -- RESOLVED: water is 2 SAR, confirmed by owner. The in-store board's 1 SAR is
  -- stale and should be corrected at the next reprint.

-- Everything is available at the only branch there is.
insert into branch_menu_availability (branch_id, menu_item_id, is_available)
select '00000000-0000-0000-0000-000000000001', id, true from menu_items;

-- ---------------------------------------------------------------------------
-- Modifiers
-- ---------------------------------------------------------------------------

insert into modifier_groups (id, slug, name_en, name_ar, min_select, max_select) values
  ('20000000-0000-0000-0000-000000000001', 'spice-level',  'Spice Level',  'مستوى الحرارة', 1, 1),
  ('20000000-0000-0000-0000-000000000002', 'extra-sauces', 'Extra Sauces', 'صلصات إضافية',  0, 4),
  ('20000000-0000-0000-0000-000000000003', 'remove',       'Remove',       'بدون',          0, 5);

insert into modifiers (group_id, name_en, name_ar, price_delta, sort_order) values
  ('20000000-0000-0000-0000-000000000001', 'Regular',        'عادي',         0, 1),
  ('20000000-0000-0000-0000-000000000001', 'Spicy',          'حار',          0, 2),
  ('20000000-0000-0000-0000-000000000001', 'Nashville Hot',  'ناشفيل حار',   0, 3),

  ('20000000-0000-0000-0000-000000000002', 'Stackd Sauce',   'صلصة ستاكد',  300, 1),
  ('20000000-0000-0000-0000-000000000002', 'Ranch',          'رانش',        300, 2),
  ('20000000-0000-0000-0000-000000000002', 'Honey Mustard',  'هني مسترد',   300, 3),
  ('20000000-0000-0000-0000-000000000002', 'Nashville',      'ناشفيل',      300, 4),

  ('20000000-0000-0000-0000-000000000003', 'No Coleslaw',    'بدون كول سلو',  0, 1),
  ('20000000-0000-0000-0000-000000000003', 'No Mayo',        'بدون مايونيز',  0, 2),
  ('20000000-0000-0000-0000-000000000003', 'No Pickles',     'بدون مخلل',     0, 3);

-- Spice level and removals apply to the chicken dishes; extra sauces to anything
-- in burgers, giants and sides.
insert into menu_item_modifier_groups (menu_item_id, group_id, sort_order)
select mi.id, '20000000-0000-0000-0000-000000000001', 1
from menu_items mi join categories c on c.id = mi.category_id
where c.slug in ('burgers', 'giants');

insert into menu_item_modifier_groups (menu_item_id, group_id, sort_order)
select mi.id, '20000000-0000-0000-0000-000000000002', 2
from menu_items mi join categories c on c.id = mi.category_id
where c.slug in ('burgers', 'giants', 'sides');

insert into menu_item_modifier_groups (menu_item_id, group_id, sort_order)
select mi.id, '20000000-0000-0000-0000-000000000003', 3
from menu_items mi join categories c on c.id = mi.category_id
where c.slug in ('burgers', 'giants');

-- ---------------------------------------------------------------------------
-- Rewards
--
-- ONE POINT IS ONE HALALA, so a reward costs exactly what the item costs. Free
-- Fries is 9.00 SAR, therefore 900 points. Nothing to tune and nothing to
-- explain: a customer who can read the menu can read the reward price.
--
-- These exist alongside spending points directly off a bill. They are the
-- shortcut for the obvious things, not the only way to spend.
-- ---------------------------------------------------------------------------

insert into rewards (name_en, name_ar, points_cost, discount_amount) values
  ('Free Sauce',          'صلصة مجانية',        300,  300),
  ('Free Coleslaw',       'كول سلو مجاني',      400,  400),
  ('Free Fries',          'بطاطس مجانية',       900,  900),
  ('Free Chicken Strips', 'ستربس دجاج مجاني',  2300, 2300),
  ('Free Classic-Stackd', 'كلاسيك ستاكد مجاني',2700, 2700);
