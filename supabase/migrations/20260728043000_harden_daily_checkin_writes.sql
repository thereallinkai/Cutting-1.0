-- Make the legacy aggregate row read-only to clients. All supported writes go
-- through security-definer RPCs that also maintain normalized meal-slot state.

revoke insert, update, delete on public.daily_checkins from authenticated;
grant select on public.daily_checkins to authenticated;

-- The shared enum includes optional snack slots for daily check-ins, while
-- onboarding preferences and generated plans intentionally remain three-meal
-- contracts.

alter table public.meal_preferences
  add constraint meal_preferences_primary_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner'));

alter table public.plan_meals
  add constraint plan_meals_primary_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner'));

-- Keep status and recorded-food presence coherent even for trusted direct SQL:
-- an item can never coexist with a skipped meal slot.

create or replace function private.reject_skipped_meal_with_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'skipped'
    and exists (
      select 1
      from public.daily_meal_items item
      where item.meal_checkin_id = new.id
        and item.user_id = new.user_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'A meal slot with recorded food items cannot be skipped.';
  end if;

  return new;
end;
$$;

create or replace function private.reject_item_for_skipped_meal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status public.meal_checkin_status;
begin
  select meal.status
  into target_status
  from public.daily_meal_checkins meal
  where meal.id = new.meal_checkin_id
    and meal.user_id = new.user_id
  for update;

  if target_status = 'skipped' then
    raise exception using
      errcode = '23514',
      message = 'A skipped meal slot cannot contain recorded food items.';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_skipped_meal_with_items()
  from public, anon, authenticated;
revoke all on function private.reject_item_for_skipped_meal()
  from public, anon, authenticated;

-- Earlier builds allowed a recorded item to be followed by a skipped status.
-- Presence is the stronger signal, so normalize any such legacy contradiction
-- before enabling the invariant.
update public.daily_meal_checkins meal
set
  status = 'completed',
  skip_reason = null
where meal.status = 'skipped'
  and exists (
    select 1
    from public.daily_meal_items item
    where item.meal_checkin_id = meal.id
      and item.user_id = meal.user_id
  );

create trigger daily_meal_checkins_reject_skipped_with_items
before insert or update on public.daily_meal_checkins
for each row execute function private.reject_skipped_meal_with_items();

create trigger daily_meal_items_reject_skipped_slot
before insert or update on public.daily_meal_items
for each row execute function private.reject_item_for_skipped_meal();

comment on function private.reject_skipped_meal_with_items() is
  'Rejects a skipped meal-slot state when recorded food items already exist.';
comment on function private.reject_item_for_skipped_meal() is
  'Locks the parent meal slot and rejects food-item writes while it is skipped.';

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
    '20260728043000_harden_daily_checkin_writes';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Health details are restricted to the trusted server boundary.';
  end if;

  if to_regclass('public.foods') is null
    or to_regclass('public.food_products') is null
    or to_regclass('public.food_label_submissions') is null
    or to_regclass('public.daily_checkins') is null
    or to_regclass('public.daily_meal_checkins') is null
    or to_regclass('public.daily_meal_items') is null
    or to_regclass('public.plans') is null
    or to_regprocedure(
      'private.reject_skipped_meal_with_items()'
    ) is null
    or to_regprocedure(
      'private.reject_item_for_skipped_meal()'
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
