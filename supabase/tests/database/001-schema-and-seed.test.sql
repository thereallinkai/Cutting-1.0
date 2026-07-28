begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'legal_acceptances', 'legal_acceptances table exists');
select has_table('public', 'onboarding_drafts', 'onboarding_drafts table exists');
select has_table('public', 'goals', 'goals table exists');
select has_table('public', 'weight_entries', 'weight_entries table exists');
select has_table('public', 'foods', 'foods table exists');
select has_table('public', 'food_categories', 'food_categories table exists');
select has_table('public', 'food_category_links', 'food_category_links table exists');
select has_table('public', 'allergens', 'allergens table exists');
select has_table(
  'public',
  'dietary_restriction_types',
  'dietary_restriction_types table exists'
);
select has_table('public', 'food_allergens', 'food_allergens table exists');
select has_table(
  'public',
  'food_dietary_restrictions',
  'food_dietary_restrictions table exists'
);
select has_table('public', 'food_nutrition', 'food_nutrition table exists');
select has_table('public', 'meal_preferences', 'meal_preferences table exists');
select has_table('public', 'onboarding_warnings', 'onboarding_warnings table exists');
select has_table('public', 'plans', 'plans table exists');
select has_table('public', 'plan_days', 'plan_days table exists');
select has_table('public', 'plan_meals', 'plan_meals table exists');
select has_table('public', 'plan_items', 'plan_items table exists');
select has_table('public', 'daily_checkins', 'daily_checkins table exists');
select has_table(
  'public',
  'ai_generation_requests',
  'ai_generation_requests table exists'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (
        array[
          'profiles',
          'legal_acceptances',
          'onboarding_drafts',
          'goals',
          'weight_entries',
          'foods',
          'food_categories',
          'food_category_links',
          'allergens',
          'dietary_restriction_types',
          'food_allergens',
          'food_dietary_restrictions',
          'food_nutrition',
          'meal_preferences',
          'onboarding_warnings',
          'plans',
          'plan_days',
          'plan_meals',
          'plan_items',
          'daily_checkins',
          'ai_generation_requests'
        ]
      )
      and not c.relrowsecurity
  ),
  'RLS is enabled on every application table'
);

select col_is_pk('public', 'profiles', 'user_id', 'profiles.user_id is the key');
select has_index(
  'public',
  'weight_entries',
  'weight_entries_user_id_local_date_key',
  'weight entries enforce one row per user and local date'
);

select is(
  (select count(*) from public.food_categories),
  7::bigint,
  'the deterministic seed contains seven food categories'
);
select is(
  (select count(*) from public.foods where ownership_type = 'catalog'),
  28::bigint,
  'the deterministic seed contains the required 28 catalog foods'
);
select is(
  (select count(*) from public.food_nutrition),
  28::bigint,
  'every seeded food has an explicit nutrition-status row'
);
select is(
  (
    select count(*)
    from public.food_nutrition
    where verification_status = 'verified'
  ),
  19::bigint,
  'nineteen generic foods have source-backed verified nutrition'
);
select ok(
  not exists (
    select 1
    from public.food_nutrition
    where verification_status in ('pending_verification', 'unavailable')
      and num_nonnulls(calories, protein_g, carbohydrate_g, fat_g) > 0
  ),
  'pending and unavailable nutrition does not contain invented macro values'
);
select ok(
  (
    select count(*) >= 2
    from public.food_category_links links
    join public.foods food on food.id = links.food_id
    where food.slug = 'milk'
  ),
  'milk demonstrates multi-category catalog membership'
);
select is(
  (select count(*) from public.allergens),
  9::bigint,
  'the seed contains the nine major allergen groups'
);
select is(
  (select count(*) from public.dietary_restriction_types),
  5::bigint,
  'the seed contains deterministic dietary restriction types'
);
select ok(
  exists (
    select 1
    from public.food_allergens food_allergen
    join public.foods food on food.id = food_allergen.food_id
    join public.allergens allergen on allergen.id = food_allergen.allergen_id
    where food.slug = 'milk'
      and allergen.slug = 'milk'
      and 'dairy' = any (allergen.aliases)
  ),
  'milk maps to the milk allergen with a dairy alias'
);
select ok(
  exists (
    select 1
    from public.food_dietary_restrictions food_restriction
    join public.foods food on food.id = food_restriction.food_id
    join public.dietary_restriction_types restriction_type
      on restriction_type.id = food_restriction.restriction_id
    where food.slug = 'whole-grain-bread'
      and restriction_type.slug = 'gluten-free'
  ),
  'whole-grain bread is excluded for the gluten-free restriction'
);

select has_function(
  'public',
  'accept_plan',
  array['uuid'],
  'the atomic plan-acceptance RPC exists'
);
select has_function(
  'public',
  'upsert_daily_checkin',
  array['date', 'boolean', 'boolean', 'boolean', 'text'],
  'the final-state check-in RPC exists'
);
select has_function(
  'public',
  'complete_onboarding',
  array[
    'profile_gender',
    'smallint',
    'numeric',
    'weight_unit',
    'text',
    'activity_level',
    'smallint',
    'text[]',
    'text[]',
    'text[]',
    'text',
    'text',
    'goal_type',
    'numeric',
    'numeric',
    'date',
    'date',
    'jsonb',
    'jsonb'
  ],
  'the atomic onboarding-completion RPC exists'
);
select has_function(
  'public',
  'save_plan_version',
  array['uuid', 'text', 'text', 'text', 'jsonb', 'jsonb', 'uuid'],
  'the normalized plan-version RPC exists'
);
select has_index(
  'public',
  'plans',
  'plans_one_accepted_per_user_idx',
  'only one accepted plan can exist per user'
);
select has_index(
  'public',
  'weight_entries',
  'weight_entries_one_baseline_per_user_idx',
  'only one onboarding baseline can exist per user'
);

select * from finish();
rollback;
