-- Store each meal or optional snack as an explicit desired state while keeping
-- the original daily_checkins columns compatible with older application builds.

create type public.meal_checkin_status as enum (
  'not_marked',
  'completed',
  'skipped'
);

create table public.daily_meal_checkins (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  meal_type public.meal_type not null,
  status public.meal_checkin_status not null default 'not_marked',
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date, meal_type),
  unique (id, user_id),
  foreign key (user_id, local_date)
    references public.daily_checkins (user_id, local_date)
    on delete cascade,
  check (
    skip_reason is null
    or (
      status = 'skipped'
      and char_length(btrim(skip_reason)) between 1 and 500
    )
  )
);

create index daily_meal_checkins_user_date_idx
  on public.daily_meal_checkins (user_id, local_date desc, meal_type);

create table public.daily_meal_items (
  id uuid primary key default extensions.gen_random_uuid(),
  meal_checkin_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete restrict,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  foreign key (meal_checkin_id, user_id)
    references public.daily_meal_checkins (id, user_id)
    on delete cascade,
  unique (meal_checkin_id, food_id)
);

create index daily_meal_items_checkin_sort_idx
  on public.daily_meal_items (meal_checkin_id, sort_order, id);
create index daily_meal_items_food_id_idx
  on public.daily_meal_items (food_id);

create trigger daily_meal_checkins_set_updated_at
before update on public.daily_meal_checkins
for each row execute function private.set_updated_at();

insert into public.daily_meal_checkins (
  user_id,
  local_date,
  meal_type,
  status
)
select
  user_id,
  local_date,
  meal_type::public.meal_type,
  case
    when completed then 'completed'::public.meal_checkin_status
    else 'not_marked'::public.meal_checkin_status
  end
from public.daily_checkins
cross join lateral (
  values
    ('breakfast', breakfast_completed),
    ('lunch', lunch_completed),
    ('dinner', dinner_completed)
) as legacy_meals(meal_type, completed)
on conflict (user_id, local_date, meal_type) do nothing;

create or replace function public.set_daily_meal_checkin(
  checkin_date date,
  target_meal_type public.meal_type,
  desired_status public.meal_checkin_status,
  desired_skip_reason text default null
)
returns public.daily_meal_checkins
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  user_time_zone text;
  normalized_reason text := nullif(btrim(desired_skip_reason), '');
  saved_meal public.daily_meal_checkins;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if checkin_date is null
    or target_meal_type is null
    or desired_status is null
  then
    raise exception using
      errcode = '22023',
      message = 'A date, meal type, and desired status are required.';
  end if;

  if desired_status <> 'skipped' and normalized_reason is not null then
    raise exception using
      errcode = '23514',
      message = 'A skip reason may only be stored for a skipped meal.';
  end if;

  if normalized_reason is not null and char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22001',
      message = 'A skip reason must be 500 characters or fewer.';
  end if;

  select time_zone
  into user_time_zone
  from public.profiles
  where user_id = current_user_id;

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

  insert into public.daily_checkins (user_id, local_date)
  values (current_user_id, checkin_date)
  on conflict (user_id, local_date) do nothing;

  insert into public.daily_meal_checkins (
    user_id,
    local_date,
    meal_type,
    status,
    skip_reason
  )
  values (
    current_user_id,
    checkin_date,
    target_meal_type,
    desired_status,
    case when desired_status = 'skipped' then normalized_reason else null end
  )
  on conflict (user_id, local_date, meal_type) do update
  set
    status = excluded.status,
    skip_reason = excluded.skip_reason
  returning * into saved_meal;

  update public.daily_checkins
  set
    breakfast_completed = case
      when target_meal_type = 'breakfast'
        then desired_status = 'completed'
      else breakfast_completed
    end,
    lunch_completed = case
      when target_meal_type = 'lunch'
        then desired_status = 'completed'
      else lunch_completed
    end,
    dinner_completed = case
      when target_meal_type = 'dinner'
        then desired_status = 'completed'
      else dinner_completed
    end
  where user_id = current_user_id
    and local_date = checkin_date;

  return saved_meal;
end;
$$;

create or replace function public.set_daily_checkin_note(
  checkin_date date,
  desired_note text
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
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select time_zone
  into user_time_zone
  from public.profiles
  where user_id = current_user_id;

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

  if desired_note is not null and char_length(desired_note) > 2000 then
    raise exception using
      errcode = '22001',
      message = 'A check-in note must be 2,000 characters or fewer.';
  end if;

  insert into public.daily_checkins (
    user_id,
    local_date,
    notes
  )
  values (
    current_user_id,
    checkin_date,
    nullif(btrim(desired_note), '')
  )
  on conflict (user_id, local_date) do update
  set notes = excluded.notes
  returning * into saved_checkin;

  return saved_checkin;
end;
$$;

create or replace function public.add_daily_meal_item(
  checkin_date date,
  target_meal_type public.meal_type,
  target_food_id uuid
)
returns public.daily_meal_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_checkin_id uuid;
  saved_item public.daily_meal_items;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.foods
    where id = target_food_id
      and (
        ownership_type = 'catalog'
        or (
          ownership_type = 'private'
          and owner_user_id = current_user_id
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'The selected food is not available to this user.';
  end if;

  perform public.set_daily_meal_checkin(
    checkin_date,
    target_meal_type,
    'completed',
    null
  );

  select id
  into target_checkin_id
  from public.daily_meal_checkins
  where user_id = current_user_id
    and local_date = checkin_date
    and meal_type = target_meal_type
  for update;

  insert into public.daily_meal_items (
    meal_checkin_id,
    user_id,
    food_id,
    sort_order
  )
  values (
    target_checkin_id,
    current_user_id,
    target_food_id,
    (
      select coalesce(max(sort_order), -1) + 1
      from public.daily_meal_items
      where meal_checkin_id = target_checkin_id
    )
  )
  on conflict (meal_checkin_id, food_id) do update
  set food_id = excluded.food_id
  returning * into saved_item;

  return saved_item;
end;
$$;

create or replace function public.delete_daily_meal_item(
  target_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  deleted_item_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  delete from public.daily_meal_items
  where id = target_item_id
    and user_id = current_user_id
  returning id into deleted_item_id;

  return deleted_item_id;
end;
$$;

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
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select time_zone
  into user_time_zone
  from public.profiles
  where user_id = current_user_id;

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
      'breakfast',
      case
        when desired_breakfast_completed then 'completed'
        else 'not_marked'
      end
    ),
    (
      current_user_id,
      checkin_date,
      'lunch',
      case
        when desired_lunch_completed then 'completed'
        else 'not_marked'
      end
    ),
    (
      current_user_id,
      checkin_date,
      'dinner',
      case
        when desired_dinner_completed then 'completed'
        else 'not_marked'
      end
    )
  on conflict (user_id, local_date, meal_type) do update
  set
    status = case
      when excluded.status = 'completed' then 'completed'
      when public.daily_meal_checkins.status = 'skipped' then 'skipped'
      else 'not_marked'
    end,
    skip_reason = case
      when excluded.status = 'not_marked'
        and public.daily_meal_checkins.status = 'skipped'
        then public.daily_meal_checkins.skip_reason
      else null
    end;

  return saved_checkin;
end;
$$;

revoke all on function public.set_daily_meal_checkin(
  date,
  public.meal_type,
  public.meal_checkin_status,
  text
) from public;
grant execute on function public.set_daily_meal_checkin(
  date,
  public.meal_type,
  public.meal_checkin_status,
  text
) to authenticated;

revoke all on function public.set_daily_checkin_note(date, text) from public;
grant execute on function public.set_daily_checkin_note(date, text) to authenticated;

revoke all on function public.add_daily_meal_item(
  date,
  public.meal_type,
  uuid
) from public;
grant execute on function public.add_daily_meal_item(
  date,
  public.meal_type,
  uuid
) to authenticated;

revoke all on function public.delete_daily_meal_item(uuid) from public;
grant execute on function public.delete_daily_meal_item(uuid) to authenticated;

alter table public.daily_meal_checkins enable row level security;
alter table public.daily_meal_items enable row level security;

create policy "daily_meal_checkins_select_own"
on public.daily_meal_checkins for select to authenticated
using ((select auth.uid()) = user_id);

create policy "daily_meal_items_select_own"
on public.daily_meal_items for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.daily_meal_checkins from anon;
revoke all on public.daily_meal_checkins from authenticated;
grant select on public.daily_meal_checkins to authenticated;

revoke all on public.daily_meal_items from anon;
revoke all on public.daily_meal_items from authenticated;
grant select on public.daily_meal_items to authenticated;

comment on table public.daily_meal_checkins is
  'Private desired-state meal and optional-snack check-ins. Skipped is distinct from not marked.';
comment on table public.daily_meal_items is
  'Private food-presence records for a meal slot. Portions are intentionally not inferred.';
comment on function public.set_daily_meal_checkin(
  date,
  public.meal_type,
  public.meal_checkin_status,
  text
) is
  'Atomically stores one authenticated user meal-slot final state without changing the day note.';
comment on function public.set_daily_checkin_note(date, text) is
  'Atomically stores one authenticated user local-day note without changing meal-slot states.';
comment on function public.add_daily_meal_item(
  date,
  public.meal_type,
  uuid
) is
  'Adds one accessible food to a local-day meal slot and marks that slot completed.';
comment on function public.delete_daily_meal_item(uuid) is
  'Deletes one authenticated user meal item without changing the slot status.';

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
    '20260728041000_normalize_daily_meal_checkins';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Health details are restricted to the trusted server boundary.';
  end if;

  if to_regclass('public.foods') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.plans') is null
    or to_regclass('public.daily_meal_checkins') is null
    or to_regclass('public.daily_meal_items') is null
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
