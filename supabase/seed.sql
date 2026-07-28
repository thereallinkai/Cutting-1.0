-- Deterministic catalog seed. This file is safe to run repeatedly.
-- It never inserts, updates, or deletes user-owned records.

begin;

select pg_advisory_xact_lock(
  hashtextextended('cutting-plan-catalog-seed-v1', 0)
);

insert into public.food_categories (id, slug, english_label)
values
  ('00000000-0000-4000-8000-000000000001', 'carbohydrate', 'Carbohydrate'),
  ('00000000-0000-4000-8000-000000000002', 'protein', 'Protein'),
  ('00000000-0000-4000-8000-000000000003', 'vegetable', 'Vegetable'),
  ('00000000-0000-4000-8000-000000000004', 'fruit', 'Fruit'),
  ('00000000-0000-4000-8000-000000000005', 'fat', 'Fat'),
  ('00000000-0000-4000-8000-000000000006', 'dairy', 'Dairy'),
  ('00000000-0000-4000-8000-000000000007', 'supplement', 'Supplement')
on conflict (id) do update
set
  slug = excluded.slug,
  english_label = excluded.english_label;

insert into public.allergens (id, slug, english_label, aliases)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'milk',
    'Milk',
    array['dairy']
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'egg',
    'Egg',
    array['eggs']
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'fish',
    'Fish',
    array[]::text[]
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'shellfish',
    'Crustacean shellfish',
    array['crustacean-shellfish', 'crustaceans']
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    'tree-nuts',
    'Tree nuts',
    array['tree-nut']
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    'peanuts',
    'Peanuts',
    array['peanut']
  ),
  (
    '30000000-0000-4000-8000-000000000007',
    'wheat',
    'Wheat',
    array['gluten']
  ),
  (
    '30000000-0000-4000-8000-000000000008',
    'soy',
    'Soybeans',
    array['soybean', 'soybeans']
  ),
  (
    '30000000-0000-4000-8000-000000000009',
    'sesame',
    'Sesame',
    array[]::text[]
  )
on conflict (id) do update
set
  slug = excluded.slug,
  english_label = excluded.english_label,
  aliases = excluded.aliases;

insert into public.dietary_restriction_types (
  id,
  slug,
  english_label,
  aliases
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'vegetarian',
    'Vegetarian',
    array[]::text[]
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'vegan',
    'Vegan',
    array['plant-based']
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'pescatarian',
    'Pescatarian',
    array[]::text[]
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'gluten-free',
    'Gluten-free',
    array['gluten-free-diet']
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    'dairy-free',
    'Dairy-free',
    array['no-dairy']
  )
on conflict (id) do update
set
  slug = excluded.slug,
  english_label = excluded.english_label,
  aliases = excluded.aliases;

insert into public.foods (
  id,
  slug,
  english_name,
  icon_ref,
  source,
  ownership_type,
  owner_user_id,
  verification_status
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'rolled-oats',
    'Rolled oats',
    'wheat',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'white-rice',
    'White rice',
    'cooking-pot',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'brown-rice',
    'Brown rice',
    'cooking-pot',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'potatoes',
    'Potatoes',
    'sprout',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'sweet-potatoes',
    'Sweet potatoes',
    'sprout',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'whole-grain-bread',
    'Whole-grain bread',
    'sandwich',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    'eggs',
    'Eggs',
    'egg',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    'milk',
    'Milk',
    'milk',
    'Catalog entry; milk type and nutrition label required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000009',
    'yogurt',
    'Yogurt',
    'cup-soda',
    'Catalog entry; product type and nutrition label required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    'lean-beef',
    'Lean beef',
    'beef',
    'Catalog entry; cut and preparation required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000011',
    'pork',
    'Pork',
    'ham',
    'Catalog entry; cut and preparation required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000012',
    'chicken-breast',
    'Chicken breast',
    'drumstick',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000013',
    'fish',
    'Fish',
    'fish',
    'Catalog entry; species and preparation required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000014',
    'shrimp',
    'Shrimp',
    'shell',
    'Catalog entry; species and preparation required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000015',
    'tofu',
    'Tofu',
    'box',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000016',
    'broccoli',
    'Broccoli',
    'trees',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000017',
    'spinach',
    'Spinach',
    'leaf',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000018',
    'water-spinach',
    'Water spinach',
    'leaf',
    'Catalog entry; nutrition source match pending',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000019',
    'lettuce',
    'Lettuce',
    'salad',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000020',
    'carrots',
    'Carrots',
    'carrot',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000021',
    'tomatoes',
    'Tomatoes',
    'circle-dot',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000022',
    'strawberries',
    'Strawberries',
    'cherry',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000023',
    'blueberries',
    'Blueberries',
    'circle',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000024',
    'bananas',
    'Bananas',
    'banana',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000025',
    'apples',
    'Apples',
    'apple',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000026',
    'olive-oil',
    'Olive oil',
    'bottle',
    'USDA FoodData Central catalog',
    'catalog',
    null,
    'verified'
  ),
  (
    '10000000-0000-4000-8000-000000000027',
    'whey-protein-isolate',
    'Whey protein isolate',
    'package',
    'Catalog entry; product-specific nutrition label required',
    'catalog',
    null,
    'pending_verification'
  ),
  (
    '10000000-0000-4000-8000-000000000028',
    'vegetable-or-vitamin-powder',
    'Vegetable or vitamin powder',
    'package',
    'Catalog entry; product-specific nutrition label required',
    'catalog',
    null,
    'pending_verification'
  )
on conflict (id) do update
set
  slug = excluded.slug,
  english_name = excluded.english_name,
  icon_ref = excluded.icon_ref,
  source = excluded.source,
  ownership_type = excluded.ownership_type,
  owner_user_id = excluded.owner_user_id,
  verification_status = excluded.verification_status,
  updated_at = now();

delete from public.food_category_links links
using public.foods food
where links.food_id = food.id
  and food.ownership_type = 'catalog'
  and food.id::text like '10000000-0000-4000-8000-%';

insert into public.food_category_links (food_id, category_id)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000006'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000006'),
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000027', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000027', '00000000-0000-4000-8000-000000000007'),
  ('10000000-0000-4000-8000-000000000028', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000028', '00000000-0000-4000-8000-000000000007')
on conflict (food_id, category_id) do nothing;

delete from public.food_allergens links
using public.foods food
where links.food_id = food.id
  and food.ownership_type = 'catalog'
  and food.id::text like '10000000-0000-4000-8000-%';

insert into public.food_allergens (food_id, allergen_id)
values
  ('10000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000007'),
  ('10000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000008'),
  ('10000000-0000-4000-8000-000000000027', '30000000-0000-4000-8000-000000000001')
on conflict (food_id, allergen_id) do nothing;

delete from public.food_dietary_restrictions links
using public.foods food
where links.food_id = food.id
  and food.ownership_type = 'catalog'
  and food.id::text like '10000000-0000-4000-8000-%';

insert into public.food_dietary_restrictions (food_id, restriction_id)
values
  -- Vegetarian exclusions.
  ('10000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000014', '40000000-0000-4000-8000-000000000001'),
  -- Vegan exclusions.
  ('10000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000014', '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000027', '40000000-0000-4000-8000-000000000002'),
  -- Pescatarian exclusions.
  ('10000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000003'),
  -- Gluten-free and dairy-free exclusions.
  ('10000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000027', '40000000-0000-4000-8000-000000000005')
on conflict (food_id, restriction_id) do nothing;

insert into public.food_nutrition (
  id,
  food_id,
  measurement_basis,
  reference_quantity,
  reference_unit,
  serving_weight_grams,
  calories,
  protein_g,
  carbohydrate_g,
  fat_g,
  fiber_g,
  sodium_mg,
  source_name,
  source_reference,
  verification_status,
  source_version,
  verified_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'dry', 100, 'g', null,
    379, 13.15, 67.70, 6.52, 10.10, 6,
    'USDA FoodData Central',
    'USDA FDC ID 173904: cereals, oats, regular and quick, not fortified, dry',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'cooked', 100, 'g', null,
    130, 2.69, 28.17, 0.28, 0.40, 1,
    'USDA FoodData Central',
    'USDA FDC ID 168878: white long-grain rice, enriched, cooked',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'cooked', 100, 'g', null,
    123, 2.74, 25.58, 0.97, 1.60, 4,
    'USDA FoodData Central',
    'USDA FDC ID 169704: brown long-grain rice, cooked',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    'raw', 100, 'g', null,
    77, 2.05, 17.49, 0.09, 2.10, 6,
    'USDA FoodData Central',
    'USDA FDC ID 170026: potatoes, flesh and skin, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000005',
    'raw', 100, 'g', null,
    86, 1.57, 20.12, 0.05, 3.00, 55,
    'USDA FoodData Central',
    'USDA FDC ID 168482: sweet potato, raw, unprepared',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000006',
    'as_sold', 100, 'g', null,
    252, 12.45, 42.71, 3.50, 6.00, 455,
    'USDA FoodData Central',
    'USDA FDC ID 172688: whole-wheat bread, commercially prepared',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000007',
    'raw', 100, 'g', null,
    143, 12.56, 0.72, 9.51, 0.00, 142,
    'USDA FoodData Central',
    'USDA FDC ID 171287: egg, whole, raw, fresh',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000008',
    'as_sold', 100, 'g', null,
    null, null, null, null, null, null,
    'Product-specific nutrition label required',
    'Milk type, fat percentage, and label are unspecified.',
    'unavailable',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000009',
    'as_sold', 100, 'g', null,
    null, null, null, null, null, null,
    'Product-specific nutrition label required',
    'Yogurt type, flavor, and label are unspecified.',
    'unavailable',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000010',
    'raw', 100, 'g', null,
    null, null, null, null, null, null,
    'Specific USDA FoodData Central match required',
    'Lean beef cut and preparation are unspecified.',
    'unavailable',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000011',
    'raw', 100, 'g', null,
    null, null, null, null, null, null,
    'Specific USDA FoodData Central match required',
    'Pork cut and preparation are unspecified.',
    'unavailable',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000012',
    'cooked', 100, 'g', null,
    165, 31.02, 0.00, 3.57, 0.00, 74,
    'USDA FoodData Central',
    'USDA FDC ID 171477: chicken breast, meat only, cooked, roasted',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000013',
    'raw', 100, 'g', null,
    null, null, null, null, null, null,
    'Specific USDA FoodData Central match required',
    'Fish species and preparation are unspecified.',
    'unavailable',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000014',
    '10000000-0000-4000-8000-000000000014',
    'cooked', 100, 'g', null,
    null, null, null, null, null, null,
    'Specific USDA FoodData Central match required',
    'Shrimp species, additives, and preparation are unspecified.',
    'pending_verification',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000015',
    '10000000-0000-4000-8000-000000000015',
    'raw', 100, 'g', null,
    144, 17.27, 2.78, 8.72, 2.30, 14,
    'USDA FoodData Central',
    'USDA FDC ID 172475: firm tofu prepared with calcium sulfate, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000016',
    '10000000-0000-4000-8000-000000000016',
    'raw', 100, 'g', null,
    34, 2.82, 6.64, 0.37, 2.60, 33,
    'USDA FoodData Central',
    'USDA FDC ID 170379: broccoli, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000017',
    '10000000-0000-4000-8000-000000000017',
    'raw', 100, 'g', null,
    23, 2.86, 3.63, 0.39, 2.20, 79,
    'USDA FoodData Central',
    'USDA FDC ID 168462: spinach, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000018',
    '10000000-0000-4000-8000-000000000018',
    'raw', 100, 'g', null,
    null, null, null, null, null, null,
    'USDA FoodData Central match pending',
    'A matching source record has not yet been verified.',
    'pending_verification',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000019',
    '10000000-0000-4000-8000-000000000019',
    'raw', 100, 'g', null,
    17, 1.23, 3.29, 0.30, 2.10, 8,
    'USDA FoodData Central',
    'USDA FDC ID 169247: cos or romaine lettuce, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000020',
    'raw', 100, 'g', null,
    41, 0.93, 9.58, 0.24, 2.80, 69,
    'USDA FoodData Central',
    'USDA FDC ID 170393: carrots, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000021',
    '10000000-0000-4000-8000-000000000021',
    'raw', 100, 'g', null,
    18, 0.88, 3.89, 0.20, 1.20, 5,
    'USDA FoodData Central',
    'USDA FDC ID 170457: red ripe tomatoes, raw, year-round average',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000022',
    '10000000-0000-4000-8000-000000000022',
    'raw', 100, 'g', null,
    32, 0.67, 7.68, 0.30, 2.00, 1,
    'USDA FoodData Central',
    'USDA FDC ID 167762: strawberries, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000023',
    '10000000-0000-4000-8000-000000000023',
    'raw', 100, 'g', null,
    57, 0.74, 14.49, 0.33, 2.40, 1,
    'USDA FoodData Central',
    'USDA FDC ID 171711: blueberries, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000024',
    '10000000-0000-4000-8000-000000000024',
    'raw', 100, 'g', null,
    89, 1.09, 22.84, 0.33, 2.60, 1,
    'USDA FoodData Central',
    'USDA FDC ID 173944: bananas, raw',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000025',
    '10000000-0000-4000-8000-000000000025',
    'raw', 100, 'g', null,
    52, 0.26, 13.81, 0.17, 2.40, 1,
    'USDA FoodData Central',
    'USDA FDC ID 171688: apples, raw, with skin',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000026',
    '10000000-0000-4000-8000-000000000026',
    'as_sold', 100, 'g', null,
    884, 0.00, 0.00, 100.00, 0.00, 2,
    'USDA FoodData Central',
    'USDA FDC ID 171413: olive oil, salad or cooking',
    'verified',
    'SR Legacy final release (April 2018)',
    '2019-04-01'
  ),
  (
    '20000000-0000-4000-8000-000000000027',
    '10000000-0000-4000-8000-000000000027',
    'as_sold', 100, 'g', null,
    null, null, null, null, null, null,
    'Product-specific nutrition label required',
    'Whey flavor, formulation, serving size, and label are unspecified.',
    'unavailable',
    null,
    null
  ),
  (
    '20000000-0000-4000-8000-000000000028',
    '10000000-0000-4000-8000-000000000028',
    'as_sold', 100, 'g', null,
    null, null, null, null, null, null,
    'Product-specific nutrition label required',
    'Powder ingredients, serving size, and label are unspecified.',
    'unavailable',
    null,
    null
  )
on conflict (id) do update
set
  food_id = excluded.food_id,
  measurement_basis = excluded.measurement_basis,
  reference_quantity = excluded.reference_quantity,
  reference_unit = excluded.reference_unit,
  serving_weight_grams = excluded.serving_weight_grams,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbohydrate_g = excluded.carbohydrate_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  sodium_mg = excluded.sodium_mg,
  source_name = excluded.source_name,
  source_reference = excluded.source_reference,
  verification_status = excluded.verification_status,
  source_version = excluded.source_version,
  verified_at = excluded.verified_at,
  updated_at = now();

commit;
