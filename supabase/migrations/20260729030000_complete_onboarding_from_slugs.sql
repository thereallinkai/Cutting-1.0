begin;

-- Complete onboarding from the stable food slugs stored in the browser draft.
-- Resolving, eligibility-checking, and persisting the preferences in one
-- transaction removes the API's previous read/check/write race and reduces the
-- final step from several PostgREST round trips to one.
create function public.complete_onboarding_from_slugs(
  profile_height_cm numeric,
  profile_weight_unit public.weight_unit,
  profile_time_zone text,
  profile_activity_level public.activity_level,
  profile_training_days smallint,
  profile_dietary_restrictions text[],
  profile_allergies text[],
  profile_disliked_foods text[],
  profile_safety_context text,
  profile_notes text,
  selected_goal_type public.goal_type,
  current_weight_kg numeric,
  target_weight_kg numeric,
  plan_start_date date,
  target_date date,
  preference_slugs jsonb,
  acknowledged_warnings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  stored_gender public.profile_gender;
  stored_age smallint;
  preference record;
  resolved_food_id uuid;
  eligible_match_count integer;
  resolved_preferences jsonb := '[]'::jsonb;
  seen_preference_keys text[] := '{}';
  seen_sort_keys text[] := '{}';
  preference_key text;
  sort_key text;
  breakfast_count integer := 0;
  lunch_count integer := 0;
  dinner_count integer := 0;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if jsonb_typeof(preference_slugs) is distinct from 'array'
    or jsonb_typeof(acknowledged_warnings) is distinct from 'array'
  then
    raise exception using
      errcode = '22023',
      message = 'Onboarding preference and warning payloads must be arrays.';
  end if;

  if jsonb_array_length(preference_slugs) > 150 then
    raise exception using
      errcode = '22023',
      message = 'Onboarding supports no more than 50 foods per primary meal.';
  end if;

  if jsonb_array_length(acknowledged_warnings) > 30 then
    raise exception using
      errcode = '22023',
      message = 'Onboarding contains too many acknowledged warnings.';
  end if;
  if jsonb_array_length(acknowledged_warnings) > 8 then
    raise exception using
      errcode = '22023',
      message = 'Onboarding supports no more than eight acknowledged meal warnings.';
  end if;

  select profile.gender, profile.age
  into stored_gender, stored_age
  from public.profiles profile
  where profile.user_id = current_user_id;

  if not found or stored_gender is null or stored_age is null then
    raise exception using
      errcode = '23514',
      message = 'A complete account profile is required before onboarding.';
  end if;

  for preference in
    select value, ordinality
    from jsonb_array_elements(preference_slugs) with ordinality
  loop
    if jsonb_typeof(preference.value) <> 'object'
      or preference.value ->> 'mealType' not in (
        'breakfast',
        'lunch',
        'dinner'
      )
      or coalesce(preference.value ->> 'foodSlug', '') !~
        '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or char_length(preference.value ->> 'foodSlug') > 120
      or coalesce(preference.value ->> 'sortOrder', '') !~
        '^([0-9]|[1-4][0-9])$'
    then
      raise exception using
        errcode = '22023',
        message = 'Onboarding meal preferences have an unsupported structure.';
    end if;

    preference_key := concat(
      preference.value ->> 'mealType',
      ':',
      preference.value ->> 'foodSlug'
    );
    if preference_key = any(seen_preference_keys) then
      raise exception using
        errcode = '23505',
        message = 'A food was selected more than once for the same meal.';
    end if;
    seen_preference_keys := array_append(seen_preference_keys, preference_key);

    sort_key := concat(
      preference.value ->> 'mealType',
      ':',
      preference.value ->> 'sortOrder'
    );
    if sort_key = any(seen_sort_keys) then
      raise exception using
        errcode = '22023',
        message = 'Each selected food needs a unique order within its meal.';
    end if;
    seen_sort_keys := array_append(seen_sort_keys, sort_key);

    case preference.value ->> 'mealType'
      when 'breakfast' then breakfast_count := breakfast_count + 1;
      when 'lunch' then lunch_count := lunch_count + 1;
      when 'dinner' then dinner_count := dinner_count + 1;
    end case;

    select
      count(*),
      (array_agg(food.id order by food.id))[1]
    into eligible_match_count, resolved_food_id
    from public.foods food
    where food.slug = preference.value ->> 'foodSlug'
      and private.can_access_food(food.id)
      and private.food_is_plan_eligible(food.id, current_user_id);

    if eligible_match_count = 0 then
      raise exception using
        errcode = '23514',
        message = 'One or more selected foods are unavailable or not eligible for generated plans.';
    end if;

    if eligible_match_count > 1 then
      raise exception using
        errcode = '23514',
        message = 'One or more selected food names are ambiguous. Review the meal selections and try again.';
    end if;

    resolved_preferences := resolved_preferences || jsonb_build_array(
      jsonb_build_object(
        'mealType', preference.value ->> 'mealType',
        'foodId', resolved_food_id,
        'sortOrder', (preference.value ->> 'sortOrder')::integer
      )
    );
  end loop;

  if breakfast_count = 0 or lunch_count = 0 or dinner_count = 0 then
    raise exception using
      errcode = '23514',
      message = 'Breakfast, lunch, and dinner must each contain at least one selected food.';
  end if;

  return public.complete_onboarding(
    stored_gender,
    stored_age,
    profile_height_cm,
    profile_weight_unit,
    profile_time_zone,
    profile_activity_level,
    profile_training_days,
    profile_dietary_restrictions,
    profile_allergies,
    profile_disliked_foods,
    profile_safety_context,
    profile_notes,
    selected_goal_type,
    current_weight_kg,
    target_weight_kg,
    plan_start_date,
    target_date,
    resolved_preferences,
    acknowledged_warnings
  );
end;
$$;

revoke all on function public.complete_onboarding_from_slugs(
  numeric,
  public.weight_unit,
  text,
  public.activity_level,
  smallint,
  text[],
  text[],
  text[],
  text,
  text,
  public.goal_type,
  numeric,
  numeric,
  date,
  date,
  jsonb,
  jsonb
) from public, anon;

grant execute on function public.complete_onboarding_from_slugs(
  numeric,
  public.weight_unit,
  text,
  public.activity_level,
  smallint,
  text[],
  text[],
  text[],
  text,
  text,
  public.goal_type,
  numeric,
  numeric,
  date,
  date,
  jsonb,
  jsonb
) to authenticated;

comment on function public.complete_onboarding_from_slugs(
  numeric,
  public.weight_unit,
  text,
  public.activity_level,
  smallint,
  text[],
  text[],
  text[],
  text,
  text,
  public.goal_type,
  numeric,
  numeric,
  date,
  date,
  jsonb,
  jsonb
) is
  'Atomically resolves eligible draft food slugs and completes onboarding using the verified stored account profile.';

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
    '20260729030000_complete_onboarding_from_slugs';
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
    or to_regclass('public.daily_meal_items') is null
    or to_regclass('public.plans') is null
    or to_regprocedure(
      'public.complete_onboarding_from_slugs(numeric,public.weight_unit,text,public.activity_level,smallint,text[],text[],text[],text,text,public.goal_type,numeric,numeric,date,date,jsonb,jsonb)'
    ) is null
    or to_regprocedure(
      'public.upsert_daily_checkin(date,boolean,boolean,boolean,text)'
    ) is null
    or to_regprocedure(
      'public.reserve_plan_generation(uuid,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.reserve_food_label_upload(uuid,uuid,public.food_label_image_kind)'
    ) is null
    or to_regprocedure(
      'private.food_basis_is_plan_eligible(uuid,uuid,public.measurement_basis)'
    ) is null
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

commit;
