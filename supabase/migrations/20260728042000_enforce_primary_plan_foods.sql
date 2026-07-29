-- Keep optional snack check-ins separate from the generated three-meal plan
-- contract, and add a single trusted food-eligibility gate before normalization.

alter function public.save_plan_version(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) rename to save_plan_version_normalize_unchecked;

revoke all on function public.save_plan_version_normalize_unchecked(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) from public, anon, authenticated, service_role;

create function public.save_plan_version(
  target_user_id uuid,
  target_goal_id uuid,
  plan_provider text,
  plan_model text,
  plan_prompt_version text,
  plan_input_snapshot jsonb,
  plan_output jsonb,
  generation_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_record jsonb;
  meal_record jsonb;
  item_record jsonb;
  meal_types text[];
  item_food_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Plan persistence is restricted to the trusted server boundary.';
  end if;

  if jsonb_typeof(plan_output) is distinct from 'object'
    or jsonb_typeof(plan_output -> 'days') is distinct from 'array'
    or jsonb_array_length(plan_output -> 'days') <> 7
  then
    raise exception using
      errcode = '22023',
      message = 'The validated plan payload must contain exactly seven days.';
  end if;

  for day_record in
    select value from jsonb_array_elements(plan_output -> 'days')
  loop
    if jsonb_typeof(day_record -> 'meals') is distinct from 'array'
      or jsonb_array_length(day_record -> 'meals') <> 3
    then
      raise exception using
        errcode = '22023',
        message = 'Every plan day must contain breakfast, lunch, and dinner.';
    end if;

    select array_agg(distinct meal ->> 'mealType' order by meal ->> 'mealType')
    into meal_types
    from jsonb_array_elements(day_record -> 'meals') meal;

    if meal_types is distinct from array['breakfast', 'dinner', 'lunch']::text[]
    then
      raise exception using
        errcode = '23514',
        message = 'Every plan day must contain breakfast, lunch, and dinner exactly once.';
    end if;

    for meal_record in
      select value from jsonb_array_elements(day_record -> 'meals')
    loop
      if jsonb_typeof(meal_record -> 'items') is distinct from 'array'
        or jsonb_array_length(meal_record -> 'items') < 1
      then
        raise exception using
          errcode = '22023',
          message = 'Every primary meal must contain at least one item.';
      end if;

      for item_record in
        select value from jsonb_array_elements(meal_record -> 'items')
      loop
        begin
          item_food_id := (item_record ->> 'foodId')::uuid;
        exception
          when invalid_text_representation then
            raise exception using
              errcode = '22023',
              message = 'A plan item contains an invalid food ID.';
        end;

        if not private.food_is_plan_eligible(item_food_id, target_user_id) then
          raise exception using
            errcode = '23514',
            message = 'A plan item is not eligible for deterministic planning.';
        end if;
      end loop;
    end loop;
  end loop;

  return public.save_plan_version_normalize_unchecked(
    target_user_id,
    target_goal_id,
    plan_provider,
    plan_model,
    plan_prompt_version,
    plan_input_snapshot,
    plan_output,
    generation_request_id
  );
end;
$$;

revoke all on function public.save_plan_version(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) from public, anon, authenticated;
grant execute on function public.save_plan_version(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) to service_role;

comment on function public.save_plan_version(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) is
  'Validates exact primary meal types and central food eligibility before atomically normalizing a trusted-server plan.';

create or replace function public.application_health(
  expected_migration text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_migration constant text :=
    '20260728042000_enforce_primary_plan_foods';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Health details are restricted to the trusted server boundary.';
  end if;

  if to_regclass('public.foods') is null
    or to_regclass('public.food_products') is null
    or to_regclass('public.food_label_submissions') is null
    or to_regclass('public.daily_meal_checkins') is null
    or to_regclass('public.plans') is null
  then
    return jsonb_build_object(
      'databaseReachable',
      true,
      'migrationCompatible',
      false
    );
  end if;

  return jsonb_build_object(
    'databaseReachable',
    true,
    'migrationCompatible',
    expected_migration = current_migration
  );
end;
$$;

revoke all on function public.application_health(text) from public;
grant execute on function public.application_health(text) to service_role;
