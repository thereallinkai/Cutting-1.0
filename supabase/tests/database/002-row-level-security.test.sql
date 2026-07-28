begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

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
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'user-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'user-b@example.test',
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
  onboarding_status,
  onboarding_completed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'User A',
    'UTC',
    'completed',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'User B',
    'UTC',
    'completed',
    now()
  );

insert into public.goals (
  id,
  user_id,
  goal_type,
  target_weight_kg,
  plan_start_date,
  target_date,
  status
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'fat_loss',
    75,
    current_date,
    current_date + 84,
    'active'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'maintenance',
    80,
    current_date,
    current_date + 84,
    'active'
  );

insert into public.weight_entries (
  user_id,
  local_date,
  weight_kg,
  source_display_unit,
  is_onboarding_baseline
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    current_date,
    82,
    'kg',
    true
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    current_date,
    80,
    'kg',
    true
  );

insert into public.foods (
  id,
  slug,
  english_name,
  source,
  ownership_type,
  owner_user_id,
  verification_status
)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'user-a-label-food',
    'User A label food',
    'User-entered nutrition label',
    'private',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'user_label'
  ),
  (
    'b2000000-0000-4000-8000-000000000001',
    'user-b-label-food',
    'User B label food',
    'User-entered nutrition label',
    'private',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'user_label'
  );

insert into public.food_allergens (food_id, allergen_id)
values (
  'b2000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);

insert into public.daily_checkins (
  user_id,
  local_date,
  breakfast_completed,
  notes
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  current_date,
  true,
  'User B note'
);

insert into public.plans (
  id,
  user_id,
  goal_id,
  version,
  provider,
  model,
  prompt_version,
  input_snapshot,
  validated_output_snapshot
)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'a1000000-0000-4000-8000-000000000001',
    1,
    'mock',
    'mock-v1',
    'cutting-plan-v1',
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    'b3000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'b1000000-0000-4000-8000-000000000001',
    1,
    'mock',
    'mock-v1',
    'cutting-plan-v1',
    '{}'::jsonb,
    '{}'::jsonb
  );

select set_config(
  'request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'User A sees only one profile'
);
select is(
  (
    select count(*)
    from public.profiles
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0::bigint,
  'User A cannot read User B profile'
);
select is(
  (select count(*) from public.weight_entries),
  1::bigint,
  'User A sees only their own weight entries'
);
select is(
  (
    select count(*)
    from public.weight_entries
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0::bigint,
  'User A cannot read User B weight entries'
);
select is(
  (select count(*) from public.foods where ownership_type = 'catalog'),
  28::bigint,
  'an authenticated user can read the public catalog'
);
select is(
  (select count(*) from public.allergens),
  9::bigint,
  'an authenticated user can read allergen taxonomy'
);
select is(
  (select count(*) from public.dietary_restriction_types),
  5::bigint,
  'an authenticated user can read dietary restriction taxonomy'
);
select is(
  (
    select count(*)
    from public.foods
    where id = 'a2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'User A can read their own private food'
);
select is(
  (
    select count(*)
    from public.foods
    where id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'User A cannot read User B private food'
);
select is(
  (
    select count(*)
    from public.food_allergens
    where food_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'User A cannot read User B private-food allergen mappings'
);
select is(
  (
    select count(*)
    from public.plans
    where id = 'b3000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'User A cannot read User B plan'
);
select is(
  (
    select count(*)
    from public.daily_checkins
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0::bigint,
  'User A cannot read User B check-in'
);
select results_eq(
  $$
    update public.daily_checkins
    set notes = 'tampered'
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    returning id
  $$,
  $$ select null::uuid where false $$,
  'User A cannot update User B check-in'
);
select throws_ok(
  $$
    update public.plans
    set status = 'archived'
    where id = 'b3000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table plans',
  'User A cannot alter User B plan'
);
select results_eq(
  $$
    update public.foods
    set english_name = 'tampered'
    where id = 'b2000000-0000-4000-8000-000000000001'
    returning id
  $$,
  $$ select null::uuid where false $$,
  'User A cannot alter User B private food'
);
select throws_ok(
  $$ select public.accept_plan('b3000000-0000-4000-8000-000000000001') $$,
  '42501',
  'The requested plan is not available to this user.',
  'User A cannot accept or replace User B plan'
);
select lives_ok(
  $$
    select public.upsert_daily_checkin(
      (now() at time zone 'UTC')::date,
      true,
      false,
      true,
      'User A note'
    )
  $$,
  'User A can atomically save their desired check-in state'
);
select is(
  (
    select count(*)
    from public.daily_checkins
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  1::bigint,
  'the check-in RPC creates exactly one user-date row'
);
select ok(
  (
    select breakfast_completed and not lunch_completed and dinner_completed
    from public.daily_checkins
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'the check-in RPC stores desired final booleans without toggling'
);

reset role;
select is(
  (
    select notes
    from public.daily_checkins
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  'User B note',
  'User B check-in remained unchanged'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select is(
  (select count(*) from public.profiles),
  0::bigint,
  'an unauthenticated request cannot read profiles'
);
select is(
  (select count(*) from public.foods),
  0::bigint,
  'an unauthenticated request cannot read the catalog or private foods'
);
select is(
  (select count(*) from public.allergens),
  0::bigint,
  'an unauthenticated request cannot read allergen taxonomy'
);
select is(
  (select count(*) from public.dietary_restriction_types),
  0::bigint,
  'an unauthenticated request cannot read restriction taxonomy'
);
select is(
  (select count(*) from public.weight_entries),
  0::bigint,
  'an unauthenticated request cannot read weights'
);
select is(
  (select count(*) from public.plans),
  0::bigint,
  'an unauthenticated request cannot read plans'
);

select * from finish();
rollback;
