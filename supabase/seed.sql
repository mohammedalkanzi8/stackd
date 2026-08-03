-- STACKD — menu seed data
--
-- Arabic names taken verbatim from the in-store menu board (authoritative).
-- Prices/calories taken from the newer digital menu (the one on Google Maps),
-- which carries two items the in-store board does not.
--
-- ⚠ CONFLICTS between the two menus are marked `-- CONFLICT:` below and need
-- an owner decision before launch. See DISCREPANCIES.md.

-- ---------------------------------------------------------------------------
-- Branch
-- ---------------------------------------------------------------------------

insert into branches (
  id, name_en, name_ar, address_en, address_ar, city_en, city_ar,
  phone, postal_code, plus_code, prep_time_mins
)
values (
  '00000000-0000-0000-0000-000000000001',
  'STACKD — North Khobar',
  'ستاكد - الخبر الشمالية',
  '76X9+7P5, Al Khobar Al Shamalia',
  '76X9+7P5، الخبر الشمالية',
  'Al Khobar', 'الخبر',
  '+966547557666',   -- displayed locally as 054 755 7666
  '31311',
  '76X9+7P5',
  15
);
-- TODO: the National Address (short address, e.g. ABCD1234) is still needed.
-- ZATCA requires the seller's address on a tax invoice and a Plus Code does not
-- satisfy that. Look it up at https://splonline.com.sa

-- Opening hours: 15:00 → 03:00, every day of the week.
-- closes_at < opens_at marks an overnight window — see is_branch_open().
insert into branch_hours (branch_id, weekday, opens_at, closes_at)
select '00000000-0000-0000-0000-000000000001', d, '15:00'::time, '03:00'::time
from generate_series(0, 6) as d;

-- ---------------------------------------------------------------------------
-- Categories — order matches the in-store board reading order
-- ---------------------------------------------------------------------------

insert into categories (id, name_en, name_ar, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'Stackd Burgers & Sandwiches', 'برجر ستاكد',      1),
  ('10000000-0000-0000-0000-000000000002', 'Giants',                      'العماليق',        2),
  ('10000000-0000-0000-0000-000000000003', 'Sides',                       'أطباق جانبية',    3),
  ('10000000-0000-0000-0000-000000000004', 'Sauces',                      'صلصات',           4),
  ('10000000-0000-0000-0000-000000000005', 'Drinks',                      'مشروبات',         5);

-- ---------------------------------------------------------------------------
-- Burgers & sandwiches
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, name_en, name_ar, description_en, description_ar, price, calories, sort_order)
values
  ('10000000-0000-0000-0000-000000000001',
   'Classic-Stackd', 'كلاسيك - ستاكد',
   'Bun, chicken breast, coleslaw, mayo',
   'خبز برجر - صدر دجاج - سلطة كول سلو - مايونيز',
   2700, 550, 1),
   -- CONFLICT: in-store board shows 850 cal, digital menu shows 550.

  ('10000000-0000-0000-0000-000000000001',
   'Maple-Stackd', 'ميبل - ستاكد',
   'Bun, chicken breast, maple sauce, mayo',
   'خبز برجر - صدر دجاج - مايونيز - صلصة الميبل',
   2900, 685, 2),

  ('10000000-0000-0000-0000-000000000001',
   'Big-Stackd', 'بيج - ستاكد',
   'Bun, chicken breast, brisket, maple sauce, mayo',
   'خبز برجر - صدر دجاج - لحم بريسكيت - مايونيز - صلصة الميبل',
   4800, 1200, 3),

  -- Not present on the in-store board. Digital menu only.
  ('10000000-0000-0000-0000-000000000001',
   'Tortilla Strips', 'تورتيلا ستربس',
   'Tortilla bread, Stackd sauce, lettuce, crispy fresh chicken, cheese, fries',
   'خبز تورتيلا - صلصة ستاكد - خس - دجاج طازج مقرمش - جبنة - بطاطس',
   1900, 890, 4),
   -- CONFLICT: needs Arabic name confirmed by owner; this is a proposed translation.

  ('10000000-0000-0000-0000-000000000001',
   'Chicken Strips', 'ستربس دجاج',
   '4 pcs of fresh, crispy chicken strips served with fries and an irresistible dipping sauce',
   '٤ قطع من شرائح الدجاج الطازجة المقرمشة مع البطاطس وصلصة الغمس',
   2300, 950, 5);
   -- CONFLICT: needs Arabic name confirmed by owner; this is a proposed translation.

-- ---------------------------------------------------------------------------
-- Giants
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, name_en, name_ar, description_en, description_ar, price, calories, sort_order)
values
  ('10000000-0000-0000-0000-000000000002',
   'Scoopy-Doo', 'سكوبي - دو',
   'Mac n'' cheese, chicken strips, Stackd sauce, cheddar sauce, coleslaw, pickles, seasoned fries',
   'مكرونة بالجبنة - شرائح دجاج - صلصة ستاكد - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
   2500, 1100, 1),
   -- CONFLICT: in-store board shows 1500 cal, digital menu shows 1100.

  ('10000000-0000-0000-0000-000000000002',
   'Fire-Attack', 'فاير - أتاك',
   'Mac n'' cheese, spicy chicken strips, Stackd sauce, Nashville seasoning, cheddar sauce, coleslaw, pickles, seasoned fries',
   'مكرونة بالجبنة - شرائح دجاج حارة - صلصة ستاكد - ناشفيل - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
   2700, 1200, 2);
   -- CONFLICT: in-store board shows 1600 cal, digital menu shows 1200.

-- ---------------------------------------------------------------------------
-- Sides
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, name_en, name_ar, price, calories, sort_order)
values
  ('10000000-0000-0000-0000-000000000003', 'Fries',         'بطاطس مقلية',   900, 420, 1),
  ('10000000-0000-0000-0000-000000000003', 'Coleslaw',      'سلطة كول سلو',  400, 384, 2),
  ('10000000-0000-0000-0000-000000000003', 'Cheesy-Cheese', 'تشيزي - تشيز',  600, 245, 3);

-- ---------------------------------------------------------------------------
-- Sauces — all 3 SAR
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, name_en, name_ar, price, calories, sort_order)
values
  ('10000000-0000-0000-0000-000000000004', 'Stackd Sauce',  'ستاكد',       300, 67, 1),
  ('10000000-0000-0000-0000-000000000004', 'Ranch',         'رانش',        300, 62, 2),
  ('10000000-0000-0000-0000-000000000004', 'Honey Mustard', 'هني مسترد',   300, 75, 3),
  ('10000000-0000-0000-0000-000000000004', 'Nashville',     'ناشفيل',      300,  6, 4);

-- ---------------------------------------------------------------------------
-- Drinks
-- ⚠ CALORIE DATA IS WRONG ON BOTH PRINTED MENUS.
-- Both show 67 / 62 / 75 for soft drink / Kenza / water — byte-identical to the
-- sauces column above. The values were duplicated in the artwork by mistake.
-- Water is 0 kcal, definitively. Left NULL here rather than seeding known-bad
-- data, because Saudi menu-labelling rules require accurate calorie display.
-- ---------------------------------------------------------------------------

insert into menu_items
  (category_id, name_en, name_ar, price, calories, sort_order)
values
  ('10000000-0000-0000-0000-000000000005', 'Soft Drink', 'مشروبات غازية', 800, null, 1),
  ('10000000-0000-0000-0000-000000000005', 'Kenza',      'كينزا',         300, null, 2),
  ('10000000-0000-0000-0000-000000000005', 'Water',      'ماء',           200,    0, 3);
  -- RESOLVED: 2 SAR, confirmed by owner. The in-store board's 1 SAR is stale
  -- and should be corrected at the next reprint.

-- ---------------------------------------------------------------------------
-- Modifiers
-- ---------------------------------------------------------------------------

insert into modifier_groups (id, name_en, name_ar, min_select, max_select) values
  ('20000000-0000-0000-0000-000000000001', 'Spice Level',  'مستوى الحرارة', 1, 1),
  ('20000000-0000-0000-0000-000000000002', 'Extra Sauces', 'صلصات إضافية',  0, 4),
  ('20000000-0000-0000-0000-000000000003', 'Remove',       'بدون',          0, 5);

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

-- ---------------------------------------------------------------------------
-- Rewards — tuned to ~7% effective return at 1 pt/SAR
-- ---------------------------------------------------------------------------

insert into rewards (name_en, name_ar, points_cost, discount_amount) values
  ('Free Sauce',        'صلصة مجانية',        50,  300),
  ('Free Coleslaw',     'كول سلو مجاني',      90,  400),
  ('Free Fries',        'بطاطس مجانية',      130,  900),
  ('Free Chicken Strips','ستربس دجاج مجاني', 330, 2300),
  ('Free Classic-Stackd','كلاسيك ستاكد مجاني',380, 2700);
