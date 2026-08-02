begin;

-- Existing accounts retain their age-only profile. New registrations carry a
-- verified date-only value into this nullable compatibility column, where it
-- becomes the canonical source for age-dependent wellness calculations.
alter table public.profiles
  add column date_of_birth date;

comment on column public.profiles.date_of_birth is
  'Canonical date of birth. It is set once during account verification and cannot be changed afterward.';

-- Snapshot the only accounts allowed to retain an age-only profile. The table
-- is private and populated once by this migration, so accounts created later
-- cannot opt themselves into the compatibility path.
create table private.legacy_age_only_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legacy_age smallint check (legacy_age between 1 and 130),
  legacy_time_zone text not null default 'UTC',
  captured_at timestamptz not null default now()
);

insert into private.legacy_age_only_accounts (
  user_id,
  legacy_age,
  legacy_time_zone
)
select
  auth_user.id,
  case
    when profile.user_id is not null then profile.age
    when coalesce(auth_user.raw_user_meta_data ->> 'age', '')
      ~ '^[0-9]{1,3}$'
      and (auth_user.raw_user_meta_data ->> 'age')::integer between 13 and 120
      then (auth_user.raw_user_meta_data ->> 'age')::smallint
    else null
  end,
  coalesce(nullif(btrim(profile.time_zone), ''), 'UTC')
from auth.users auth_user
left join public.profiles profile on profile.user_id = auth_user.id
where auth_user.created_at < transaction_timestamp()
  and (
    profile.user_id is not null
    or (
      auth_user.email_confirmed_at is null
      and coalesce(auth_user.raw_user_meta_data ->> 'age', '')
        ~ '^[0-9]{1,3}$'
      and (auth_user.raw_user_meta_data ->> 'age')::integer between 13 and 120
    )
  );

alter table private.legacy_age_only_accounts enable row level security;
revoke all on table private.legacy_age_only_accounts
from public, anon, authenticated;

comment on table private.legacy_age_only_accounts is
  'One-time compatibility snapshot for accounts that existed before canonical DOB registration.';

create function private.is_valid_time_zone(time_zone_name text)
returns boolean
language sql
stable
strict
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = time_zone_name
  );
$$;

revoke all on function private.is_valid_time_zone(text)
from public, anon, authenticated;

create function private.profile_age_on_date(
  date_of_birth date,
  reference_date date
)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select extract(year from pg_catalog.age(reference_date, date_of_birth))::smallint;
$$;

revoke all on function private.profile_age_on_date(date, date)
from public, anon, authenticated;

create function private.enforce_profile_date_of_birth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  derived_age smallint;
  legacy_age smallint;
  registration_date date;
begin
  if tg_op = 'UPDATE'
    and old.date_of_birth is not null
    and new.date_of_birth is distinct from old.date_of_birth
  then
    raise exception using
      errcode = '23514',
      message = 'Date of birth cannot be changed after it is saved.';
  end if;

  if new.date_of_birth is not null then
    if not private.is_valid_time_zone(new.time_zone) then
      raise exception using
        errcode = '23514',
        message = 'A valid IANA time zone is required with date of birth.';
    end if;

    registration_date := (current_timestamp at time zone new.time_zone)::date;
    derived_age := private.profile_age_on_date(
      new.date_of_birth,
      registration_date
    );

    if (tg_op = 'INSERT' or old.date_of_birth is null)
      and derived_age not between 13 and 120
    then
      raise exception using
        errcode = '23514',
        message = 'Date of birth must represent an age from 13 to 120.';
    end if;

    -- The compatibility age is always derived when a canonical DOB exists;
    -- authenticated clients cannot substitute a different age.
    new.age := derived_age;
  elsif tg_op = 'INSERT' then
    select legacy.legacy_age
    into legacy_age
    from private.legacy_age_only_accounts legacy
    where legacy.user_id = new.user_id;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'Date of birth is required for new profiles.';
    end if;

    -- Never trust a mutable client age on the compatibility path.
    new.age := legacy_age;
  elsif old.date_of_birth is null
    and new.date_of_birth is null
    and new.age is distinct from old.age
  then
    raise exception using
      errcode = '23514',
      message = 'Legacy profile age cannot be changed.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_profile_date_of_birth()
from public, anon, authenticated;

create trigger profiles_enforce_date_of_birth
before insert or update on public.profiles
for each row execute function private.enforce_profile_date_of_birth();

-- Supabase Auth user metadata is only the registration transport. Keep its DOB
-- write-once too; public.profiles remains the canonical application record.
create function private.protect_auth_date_of_birth_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.raw_user_meta_data, '{}'::jsonb) ? 'date_of_birth'
    and coalesce(old.raw_user_meta_data, '{}'::jsonb) -> 'date_of_birth'
      is distinct from
      coalesce(new.raw_user_meta_data, '{}'::jsonb) -> 'date_of_birth'
  then
    raise exception using
      errcode = '23514',
      message = 'Date of birth cannot be changed after account creation.';
  end if;

  if coalesce(old.raw_user_meta_data, '{}'::jsonb) ? 'registration_time_zone'
    and coalesce(old.raw_user_meta_data, '{}'::jsonb)
      -> 'registration_time_zone'
      is distinct from
      coalesce(new.raw_user_meta_data, '{}'::jsonb)
        -> 'registration_time_zone'
  then
    raise exception using
      errcode = '23514',
      message = 'Registration time zone cannot be changed after account creation.';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_auth_date_of_birth_metadata()
from public, anon, authenticated;

create trigger protect_auth_date_of_birth_metadata
before update of raw_user_meta_data on auth.users
for each row execute function private.protect_auth_date_of_birth_metadata();

-- Replace the verification hook installed by the previous immutable migration.
-- Pending age-only registrations remain compatible, while every new app
-- registration uses the canonical date_of_birth metadata field.
create or replace function private.initialize_verified_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  metadata_age smallint;
  metadata_date_of_birth date;
  metadata_date_of_birth_text text := btrim(
    coalesce(new.raw_user_meta_data ->> 'date_of_birth', '')
  );
  metadata_time_zone text := btrim(
    coalesce(new.raw_user_meta_data ->> 'registration_time_zone', '')
  );
  metadata_gender public.profile_gender;
  legacy_account boolean;
  legacy_age smallint;
  legacy_time_zone text;
  registration_date date;
  terms_version text;
  privacy_version text;
begin
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;

  select
    legacy.legacy_age,
    legacy.legacy_time_zone
  into
    legacy_age,
    legacy_time_zone
  from private.legacy_age_only_accounts legacy
  where legacy.user_id = new.id;
  legacy_account := found;

  if metadata_date_of_birth_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      metadata_date_of_birth := metadata_date_of_birth_text::date;
      if pg_catalog.to_char(metadata_date_of_birth, 'YYYY-MM-DD')
        <> metadata_date_of_birth_text
      then
        metadata_date_of_birth := null;
      end if;
    exception
      when datetime_field_overflow or invalid_datetime_format then
        metadata_date_of_birth := null;
    end;
  end if;

  if metadata_date_of_birth is not null then
    if not private.is_valid_time_zone(metadata_time_zone) then
      metadata_date_of_birth := null;
    else
      registration_date := (
        current_timestamp at time zone metadata_time_zone
      )::date;
      metadata_age := private.profile_age_on_date(
        metadata_date_of_birth,
        registration_date
      );
      if metadata_age not between 13 and 120 then
        metadata_date_of_birth := null;
        metadata_age := null;
      end if;
    end if;
  end if;

  if metadata_date_of_birth is null then
    if not legacy_account then
      raise exception using
        errcode = '23514',
        message = 'A valid date of birth and registration time zone are required.';
    end if;

    -- Pending users captured before this migration retain only the immutable
    -- age snapshot. Later Auth metadata edits cannot replace that value.
    metadata_age := legacy_age;
    metadata_time_zone := case
      when private.is_valid_time_zone(legacy_time_zone)
        then legacy_time_zone
      else 'UTC'
    end;
  end if;

  metadata_gender := case
    when metadata ->> 'gender' in (
      'male',
      'female',
      'another_identity',
      'prefer_not_to_say'
    )
      then (metadata ->> 'gender')::public.profile_gender
    else 'prefer_not_to_say'::public.profile_gender
  end;

  insert into public.profiles (
    user_id,
    full_name,
    gender,
    age,
    date_of_birth,
    preferred_weight_unit,
    time_zone,
    onboarding_status
  )
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(metadata ->> 'full_name'), ''),
        'Let''s Go Green! member'
      ),
      120
    ),
    metadata_gender,
    metadata_age,
    metadata_date_of_birth,
    'kg',
    metadata_time_zone,
    'in_progress'
  )
  on conflict (user_id) do nothing;

  terms_version := left(btrim(coalesce(metadata ->> 'terms_version', '')), 80);
  privacy_version := left(
    btrim(coalesce(metadata ->> 'privacy_version', '')),
    80
  );

  if terms_version <> '' then
    insert into public.legal_acceptances (
      user_id,
      document_type,
      document_version
    )
    values (new.id, 'terms', terms_version)
    on conflict (user_id, document_type, document_version) do nothing;
  end if;

  if privacy_version <> '' then
    insert into public.legal_acceptances (
      user_id,
      document_type,
      document_version
    )
    values (new.id, 'privacy', privacy_version)
    on conflict (user_id, document_type, document_version) do nothing;
  end if;

  return new;
end;
$$;

comment on function private.initialize_verified_user() is
  'Creates the verified profile, derives age from an immutable date of birth, and records legal acceptances.';

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
    '20260802000000_add_immutable_date_of_birth';
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
    or to_regclass('private.legacy_age_only_accounts') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'date_of_birth'
        and data_type = 'date'
    )
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
    or to_regprocedure('private.profile_age_on_date(date,date)') is null
    or to_regprocedure('private.is_valid_time_zone(text)') is null
    or to_regprocedure('private.enforce_profile_date_of_birth()') is null
    or to_regprocedure(
      'private.protect_auth_date_of_birth_metadata()'
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
