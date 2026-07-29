begin;

-- Keep the original migration history immutable while replacing the last
-- user-facing fallback that was installed by the legacy project name.
create or replace function private.initialize_verified_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  metadata_age smallint;
  metadata_gender public.profile_gender;
  terms_version text;
  privacy_version text;
begin
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;

  if coalesce(metadata ->> 'age', '') ~ '^[0-9]{1,3}$'
    and (metadata ->> 'age')::integer between 13 and 120
  then
    metadata_age := (metadata ->> 'age')::smallint;
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
    'kg',
    'UTC',
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
  'Creates the verified Let''s Go Green! profile and records accepted legal document versions.';

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
    '20260729000000_finalize_lets_go_green_brand';
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
    or to_regprocedure('private.initialize_verified_user()') is null
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

commit;
