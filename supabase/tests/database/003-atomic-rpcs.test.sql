begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

create or replace function pg_temp.valid_plan_output(
  item_food_id uuid default '10000000-0000-4000-8000-000000000002',
  item_basis text default 'cooked'
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'schemaVersion', '1.0',
    'planApproach', 'standard',
    'goalAssessment', 'A general wellness plan for testing.',
    'days', jsonb_agg(
      jsonb_build_object(
        'dayIndex', day_number,
        'title', 'Day ' || day_number,
        'meals', (
          select jsonb_agg(
            jsonb_build_object(
              'mealType', meal_name,
              'items', jsonb_build_array(
                jsonb_build_object(
                  'foodId', item_food_id,
                  'quantity', 100,
                  'unit', 'g',
                  'measurementBasis', item_basis
                )
              )
            )
            order by meal_order
          )
          from (
            values
              ('breakfast', 1),
              ('lunch', 2),
              ('dinner', 3)
          ) as meal_types(meal_name, meal_order)
        )
      )
      order by day_number
    ),
    'assumptions', jsonb_build_array(),
    'majorReasons', jsonb_build_array('Uses known catalog foods.'),
    'hydrationGuidance', 'Drink according to thirst and individual needs.',
    'weeklyReviewRules', jsonb_build_array('Review complete trend periods.'),
    'safetyNotes', jsonb_build_array()
  )
  from generate_series(1, 7) as days(day_number);
$$;

create temporary table rpc_results (
  goal_id uuid not null,
  plan_id uuid
) on commit drop;
grant all on table rpc_results to authenticated;
grant all on table rpc_results to service_role;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'authenticated',
  'authenticated',
  'rpc-user@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (
  user_id,
  full_name,
  time_zone,
  onboarding_status
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'RPC User',
  'UTC',
  'in_progress'
);

insert into public.legal_acceptances (
  user_id,
  document_type,
  document_version
)
values
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'terms',
    'test-v1'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'privacy',
    'test-v1'
  );

select set_config(
  'request.jwt.claim.sub',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.complete_onboarding(
      'prefer_not_to_say',
      30::smallint,
      175::numeric,
      'kg',
      'UTC',
      'moderately_active',
      3::smallint,
      array[]::text[],
      array[]::text[],
      array[]::text[],
      null,
      'Test onboarding',
      'fat_loss',
      82::numeric,
      75::numeric,
      (now() at time zone 'UTC')::date,
      (now() at time zone 'UTC')::date + 84,
      jsonb_build_array(
        jsonb_build_object(
          'mealType', 'breakfast',
          'foodId', '10000000-0000-4000-8000-000000000002',
          'sortOrder', 0
        ),
        jsonb_build_object(
          'mealType', 'lunch',
          'foodId', '10000000-0000-4000-8000-000000000012',
          'sortOrder', 0
        ),
        jsonb_build_object(
          'mealType', 'dinner',
          'foodId', '10000000-0000-4000-8000-000000000015',
          'sortOrder', 0
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'warningCode', 'missing_vegetable',
          'mealType', 'lunch',
          'contextVersion', 'onboarding-v1'
        )
      )
    )
  $$,
  'complete_onboarding persists all validated sections atomically'
);
select is(
  (
    select onboarding_status::text
    from public.profiles
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  'completed',
  'onboarding completion is set after persistence succeeds'
);
select is(
  (
    select count(*)
    from public.weight_entries
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and is_onboarding_baseline
  ),
  1::bigint,
  'onboarding creates exactly one baseline weight'
);
select is(
  (
    select count(*)
    from public.goals
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and status = 'active'
  ),
  1::bigint,
  'onboarding creates exactly one active goal'
);
select is(
  (
    select count(*)
    from public.meal_preferences
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  3::bigint,
  'onboarding stores normalized meal preferences'
);
select is(
  (
    select count(*)
    from public.onboarding_warnings
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  1::bigint,
  'onboarding stores acknowledged composition warnings'
);

insert into rpc_results (goal_id)
select id
from public.goals
where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  and status = 'active';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

insert into public.ai_generation_requests (
  id,
  user_id,
  idempotency_key,
  provider,
  model,
  prompt_version,
  status
)
values (
  'c4000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'rpc-request-one',
  'mock',
  'mock-v1',
  'cutting-plan-v1',
  'processing'
);

select lives_ok(
  $$
    update rpc_results
    set plan_id = public.save_plan_version(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select goal_id from rpc_results),
      'mock',
      'mock-v1',
      'cutting-plan-v1',
      '{}'::jsonb,
      pg_temp.valid_plan_output(),
      'c4000000-0000-4000-8000-000000000001'
    )
  $$,
  'save_plan_version atomically stores a normalized plan'
);

reset role;

select is(
  (
    select count(*)
    from public.plans
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  1::bigint,
  'one plan version is created'
);
select is(
  (
    select count(*)
    from public.plan_days
    where plan_id = (select plan_id from rpc_results)
  ),
  7::bigint,
  'the plan version contains seven normalized days'
);
select is(
  (
    select count(*)
    from public.plan_meals meals
    join public.plan_days days on days.id = meals.plan_day_id
    where days.plan_id = (select plan_id from rpc_results)
  ),
  21::bigint,
  'the plan version contains three meals per day'
);
select is(
  (
    select count(*)
    from public.plan_items items
    join public.plan_meals meals on meals.id = items.plan_meal_id
    join public.plan_days days on days.id = meals.plan_day_id
    where days.plan_id = (select plan_id from rpc_results)
  ),
  21::bigint,
  'the plan version contains normalized meal items'
);
select ok(
  (
    select status = 'succeeded' and plan_id = (select plan_id from rpc_results)
    from public.ai_generation_requests
    where id = 'c4000000-0000-4000-8000-000000000001'
  ),
  'saving a plan completes and links its generation request'
);

set local role service_role;

select is(
  public.save_plan_version(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    (select goal_id from rpc_results),
    'mock',
    'mock-v1',
    'cutting-plan-v1',
    '{}'::jsonb,
    pg_temp.valid_plan_output(),
    'c4000000-0000-4000-8000-000000000001'
  ),
  (select plan_id from rpc_results),
  'retrying a succeeded generation request returns the same plan'
);

reset role;

select is(
  (
    select count(*)
    from public.plans
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  1::bigint,
  'an idempotent retry does not create another plan version'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.accept_plan((select plan_id from rpc_results)) $$,
  'a complete generated plan can be accepted atomically'
);
select is(
  (
    select status::text
    from public.plans
    where id = (select plan_id from rpc_results)
  ),
  'accepted',
  'the accepted plan is the current plan'
);
select throws_ok(
  $$
    update public.plan_items
    set quantity = 50
    where plan_meal_id in (
      select meals.id
      from public.plan_meals meals
      join public.plan_days days on days.id = meals.plan_day_id
      where days.plan_id = (select plan_id from rpc_results)
    )
  $$,
  '42501',
  'permission denied for table plan_items',
  'accepted normalized plan items cannot be silently mutated'
);
select throws_ok(
  $$
    update public.plans
    set model = 'tampered-model'
    where id = (select plan_id from rpc_results)
  $$,
  '42501',
  'permission denied for table plans',
  'accepted plan audit content is immutable'
);

update public.profiles
set allergies = array['wheat']
where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

insert into public.ai_generation_requests (
  id,
  user_id,
  idempotency_key,
  provider,
  model,
  prompt_version,
  status
)
values (
  'c4000000-0000-4000-8000-000000000003',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'rpc-request-allergen',
  'mock',
  'mock-v1',
  'cutting-plan-v1',
  'processing'
);

select throws_ok(
  $$
    select public.save_plan_version(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select goal_id from rpc_results),
      'mock',
      'mock-v1',
      'cutting-plan-v1',
      '{}'::jsonb,
      pg_temp.valid_plan_output(
        '10000000-0000-4000-8000-000000000006',
        'as_sold'
      ),
      'c4000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  'A plan item conflicts with an allergy or dietary restriction.',
  'plan persistence rechecks allergen mappings against the profile'
);

reset role;

select is(
  (
    select count(*)
    from public.plans
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  1::bigint,
  'an allergen conflict leaves no partial plan version'
);
select is(
  (
    select status::text
    from public.ai_generation_requests
    where id = 'c4000000-0000-4000-8000-000000000003'
  ),
  'processing',
  'an allergen rejection does not falsely complete the generation request'
);

set local role service_role;

insert into public.ai_generation_requests (
  id,
  user_id,
  idempotency_key,
  provider,
  model,
  prompt_version,
  status
)
values (
  'c4000000-0000-4000-8000-000000000002',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'rpc-request-two',
  'mock',
  'mock-v1',
  'cutting-plan-v1',
  'processing'
);

select throws_ok(
  $$
    select public.save_plan_version(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select goal_id from rpc_results),
      'mock',
      'mock-v1',
      'cutting-plan-v1',
      '{}'::jsonb,
      pg_temp.valid_plan_output() #- '{days,0,meals}'::text[],
      'c4000000-0000-4000-8000-000000000002'
    )
  $$,
  '22023',
  'Every plan day must contain exactly three meals.',
  'a plan day without a meals array is rejected'
);

select throws_ok(
  $$
    select public.save_plan_version(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select goal_id from rpc_results),
      'mock',
      'mock-v1',
      'cutting-plan-v1',
      '{}'::jsonb,
      pg_temp.valid_plan_output() #- '{days,0,meals,0,items}'::text[],
      'c4000000-0000-4000-8000-000000000002'
    )
  $$,
  '22023',
  'Every plan meal must contain at least one item.',
  'a plan meal without an items array is rejected'
);

select throws_ok(
  $$
    select public.save_plan_version(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select goal_id from rpc_results),
      'mock',
      'mock-v1',
      'cutting-plan-v1',
      '{}'::jsonb,
      '{}'::jsonb,
      'c4000000-0000-4000-8000-000000000002'
    )
  $$,
  '22023',
  'The validated plan payload has an unsupported structure.',
  'a plan payload without schemaVersion and days is rejected'
);

reset role;

select is(
  (
    select count(*)
    from public.plans
    where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  1::bigint,
  'a rejected plan never leaves a partial version'
);

select * from finish();
rollback;
