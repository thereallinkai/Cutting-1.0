-- Reject malformed plan payloads deterministically before normalization.
-- IS DISTINCT FROM makes missing keys and JSON/SQL null values fail closed.

create or replace function public.save_plan_version(
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
  current_user_id uuid := target_user_id;
  new_plan_id uuid;
  next_version integer;
  request_record public.ai_generation_requests;
  day_record record;
  meal_record record;
  item_record record;
  new_plan_day_id uuid;
  new_plan_meal_id uuid;
  item_food_id uuid;
  item_measurement_basis public.measurement_basis;
  trusted_verification_status public.verification_status;
  profile_restrictions text[];
  profile_allergy_codes text[];
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Plan persistence is restricted to the trusted server boundary.';
  end if;

  if current_user_id is null or generation_request_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select dietary_restrictions, allergies
  into profile_restrictions, profile_allergy_codes
  from public.profiles
  where user_id = current_user_id
    and onboarding_status = 'completed'
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Completed onboarding is required before plan generation.';
  end if;

  if not exists (
    select 1
    from public.goals
    where id = target_goal_id
      and user_id = current_user_id
      and status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'The active goal is not available to this user.';
  end if;

  select *
  into request_record
  from public.ai_generation_requests
  where id = generation_request_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'The generation request is not available to this user.';
  end if;

  if request_record.status = 'succeeded' and request_record.plan_id is not null then
    return request_record.plan_id;
  end if;

  if request_record.status is distinct from 'processing'
    or request_record.provider is distinct from plan_provider
    or request_record.model is distinct from plan_model
    or request_record.prompt_version is distinct from plan_prompt_version
  then
    raise exception using
      errcode = '23514',
      message = 'The generation request metadata does not match this plan.';
  end if;

  if jsonb_typeof(plan_input_snapshot) is distinct from 'object'
    or jsonb_typeof(plan_output) is distinct from 'object'
    or (plan_output ->> 'schemaVersion') is distinct from '1.0'
  then
    raise exception using
      errcode = '22023',
      message = 'The validated plan payload has an unsupported structure.';
  end if;

  if jsonb_typeof(plan_output -> 'days') is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'The validated plan payload has an unsupported structure.';
  end if;

  if jsonb_array_length(plan_output -> 'days') <> 7 then
    raise exception using
      errcode = '22023',
      message = 'The validated plan payload has an unsupported structure.';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.plans
  where user_id = current_user_id;

  insert into public.plans (
    user_id,
    goal_id,
    version,
    status,
    provider,
    model,
    prompt_version,
    input_snapshot,
    validated_output_snapshot
  )
  values (
    current_user_id,
    target_goal_id,
    next_version,
    'generated',
    plan_provider,
    plan_model,
    plan_prompt_version,
    plan_input_snapshot,
    plan_output
  )
  returning id into new_plan_id;

  for day_record in
    select value, ordinality
    from jsonb_array_elements(plan_output -> 'days') with ordinality
  loop
    if jsonb_typeof(day_record.value -> 'meals') is distinct from 'array' then
      raise exception using
        errcode = '22023',
        message = 'Every plan day must contain exactly three meals.';
    end if;

    if jsonb_array_length(day_record.value -> 'meals') <> 3 then
      raise exception using
        errcode = '22023',
        message = 'Every plan day must contain exactly three meals.';
    end if;

    insert into public.plan_days (plan_id, day_index, title)
    values (
      new_plan_id,
      (day_record.value ->> 'dayIndex')::smallint,
      nullif(day_record.value ->> 'title', '')
    )
    returning id into new_plan_day_id;

    for meal_record in
      select value, ordinality
      from jsonb_array_elements(day_record.value -> 'meals') with ordinality
    loop
      if jsonb_typeof(meal_record.value -> 'items') is distinct from 'array' then
        raise exception using
          errcode = '22023',
          message = 'Every plan meal must contain at least one item.';
      end if;

      if jsonb_array_length(meal_record.value -> 'items') < 1 then
        raise exception using
          errcode = '22023',
          message = 'Every plan meal must contain at least one item.';
      end if;

      insert into public.plan_meals (
        plan_day_id,
        meal_type,
        sort_order
      )
      values (
        new_plan_day_id,
        (meal_record.value ->> 'mealType')::public.meal_type,
        meal_record.ordinality::smallint - 1
      )
      returning id into new_plan_meal_id;

      for item_record in
        select value, ordinality
        from jsonb_array_elements(meal_record.value -> 'items') with ordinality
      loop
        item_food_id := (item_record.value ->> 'foodId')::uuid;
        item_measurement_basis :=
          (item_record.value ->> 'measurementBasis')::public.measurement_basis;

        if exists (
          select 1
          from public.food_allergens food_allergen
          join public.allergens allergen
            on allergen.id = food_allergen.allergen_id
          where food_allergen.food_id = item_food_id
            and exists (
              select 1
              from unnest(coalesce(profile_allergy_codes, '{}')) as entry(value)
              where trim(
                both '-' from regexp_replace(
                  lower(btrim(entry.value)),
                  '[^a-z0-9]+',
                  '-',
                  'g'
                )
              ) = allergen.slug
              or trim(
                both '-' from regexp_replace(
                  lower(btrim(entry.value)),
                  '[^a-z0-9]+',
                  '-',
                  'g'
                )
              ) = any (allergen.aliases)
            )
        ) or exists (
          select 1
          from public.food_dietary_restrictions food_restriction
          join public.dietary_restriction_types restriction_type
            on restriction_type.id = food_restriction.restriction_id
          where food_restriction.food_id = item_food_id
            and exists (
              select 1
              from unnest(coalesce(profile_restrictions, '{}')) as entry(value)
              where trim(
                both '-' from regexp_replace(
                  lower(btrim(entry.value)),
                  '[^a-z0-9]+',
                  '-',
                  'g'
                )
              ) = restriction_type.slug
              or trim(
                both '-' from regexp_replace(
                  lower(btrim(entry.value)),
                  '[^a-z0-9]+',
                  '-',
                  'g'
                )
              ) = any (restriction_type.aliases)
            )
        ) then
          raise exception using
            errcode = '23514',
            message = 'A plan item conflicts with an allergy or dietary restriction.';
        end if;

        select n.verification_status
        into trusted_verification_status
        from public.food_nutrition n
        join public.foods f on f.id = n.food_id
        where n.food_id = item_food_id
          and n.measurement_basis = item_measurement_basis
          and (
            f.ownership_type = 'catalog'
            or (
              f.ownership_type = 'private'
              and f.owner_user_id = current_user_id
            )
          );

        if trusted_verification_status is null then
          raise exception using
            errcode = '23514',
            message = 'A plan item references unavailable food nutrition.';
        end if;

        insert into public.plan_items (
          plan_meal_id,
          food_id,
          quantity,
          unit,
          measurement_basis,
          sort_order,
          preparation_note,
          substitution_group,
          verification_status
        )
        values (
          new_plan_meal_id,
          item_food_id,
          (item_record.value ->> 'quantity')::numeric,
          (item_record.value ->> 'unit')::public.portion_unit,
          item_measurement_basis,
          item_record.ordinality::integer - 1,
          nullif(item_record.value ->> 'preparationNote', ''),
          nullif(item_record.value ->> 'substitutionGroup', ''),
          trusted_verification_status
        );
      end loop;
    end loop;
  end loop;

  if not private.plan_is_complete(new_plan_id) then
    raise exception using
      errcode = '23514',
      message = 'The normalized plan is incomplete.';
  end if;

  update public.ai_generation_requests
  set
    status = 'succeeded',
    plan_id = new_plan_id,
    completed_at = now(),
    sanitized_error_code = null
  where id = generation_request_id
    and user_id = current_user_id;

  return new_plan_id;
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
) from public;
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
  'Atomically normalizes a trusted-server-validated plan and completes its generation request.';

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
    '20260728010000_validate_plan_payload_structure';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Health details are restricted to the trusted server boundary.';
  end if;

  if to_regclass('public.foods') is null
    or to_regclass('public.profiles') is null
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
