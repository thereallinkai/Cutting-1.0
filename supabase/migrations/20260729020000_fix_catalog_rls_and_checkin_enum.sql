begin;

-- Catalog rows remain readable for accepted historical plans, but rejected
-- records must never be exposed through direct table reads. The original
-- policy predated catalog review states and allowed every catalog row.
drop policy if exists "foods_select_catalog_or_own" on public.foods;

create policy "foods_select_catalog_or_own"
on public.foods for select to authenticated
using ((select private.can_access_food(id)));

-- PostgreSQL resolves the multi-row CASE expressions below as text unless the
-- enum result is explicit. Keep the legacy aggregate RPC compatible with the
-- normalized meal-slot model by assigning meal_checkin_status values directly.
create or replace function public.upsert_daily_checkin(
  checkin_date date,
  desired_breakfast_completed boolean,
  desired_lunch_completed boolean,
  desired_dinner_completed boolean,
  checkin_notes text default null
)
returns public.daily_checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  user_time_zone text;
  saved_checkin public.daily_checkins;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  select profile.time_zone
  into user_time_zone
  from public.profiles profile
  where profile.user_id = current_user_id;

  if user_time_zone is null then
    raise exception using
      errcode = '23514',
      message = 'A profile with a valid time zone is required.';
  end if;

  if checkin_date > (now() at time zone user_time_zone)::date then
    raise exception using
      errcode = '23514',
      message = 'Future meal completion is not allowed.';
  end if;

  insert into public.daily_checkins (
    user_id,
    local_date,
    breakfast_completed,
    lunch_completed,
    dinner_completed,
    notes
  )
  values (
    current_user_id,
    checkin_date,
    desired_breakfast_completed,
    desired_lunch_completed,
    desired_dinner_completed,
    checkin_notes
  )
  on conflict (user_id, local_date) do update
  set
    breakfast_completed = excluded.breakfast_completed,
    lunch_completed = excluded.lunch_completed,
    dinner_completed = excluded.dinner_completed,
    notes = case
      when checkin_notes is null then public.daily_checkins.notes
      else excluded.notes
    end
  returning * into saved_checkin;

  insert into public.daily_meal_checkins (
    user_id,
    local_date,
    meal_type,
    status
  )
  values
    (
      current_user_id,
      checkin_date,
      'breakfast'::public.meal_type,
      case
        when desired_breakfast_completed
          then 'completed'::public.meal_checkin_status
        else 'not_marked'::public.meal_checkin_status
      end
    ),
    (
      current_user_id,
      checkin_date,
      'lunch'::public.meal_type,
      case
        when desired_lunch_completed
          then 'completed'::public.meal_checkin_status
        else 'not_marked'::public.meal_checkin_status
      end
    ),
    (
      current_user_id,
      checkin_date,
      'dinner'::public.meal_type,
      case
        when desired_dinner_completed
          then 'completed'::public.meal_checkin_status
        else 'not_marked'::public.meal_checkin_status
      end
    )
  on conflict (user_id, local_date, meal_type) do update
  set
    status = case
      when excluded.status = 'completed'::public.meal_checkin_status
        then 'completed'::public.meal_checkin_status
      when public.daily_meal_checkins.status =
        'skipped'::public.meal_checkin_status
        then 'skipped'::public.meal_checkin_status
      else 'not_marked'::public.meal_checkin_status
    end,
    skip_reason = case
      when excluded.status = 'not_marked'::public.meal_checkin_status
        and public.daily_meal_checkins.status =
          'skipped'::public.meal_checkin_status
        then public.daily_meal_checkins.skip_reason
      else null
    end;

  return saved_checkin;
end;
$$;

revoke all on function public.upsert_daily_checkin(
  date,
  boolean,
  boolean,
  boolean,
  text
) from public;
grant execute on function public.upsert_daily_checkin(
  date,
  boolean,
  boolean,
  boolean,
  text
) to authenticated;

comment on function public.upsert_daily_checkin(
  date,
  boolean,
  boolean,
  boolean,
  text
) is
  'Atomically stores legacy primary-meal booleans and their normalized enum-backed meal-slot states.';

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
    '20260729020000_fix_catalog_rls_and_checkin_enum';
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
