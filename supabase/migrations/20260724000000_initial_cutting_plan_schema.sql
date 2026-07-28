-- Cutting Plan initial schema.
-- All weights are stored canonically in kilograms, local calendar dates use
-- PostgreSQL DATE, and timestamps use TIMESTAMPTZ (UTC instants).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create type public.profile_gender as enum (
  'male',
  'female',
  'another_identity',
  'prefer_not_to_say'
);

create type public.weight_unit as enum ('kg', 'lb');

create type public.activity_level as enum (
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extremely_active'
);

create type public.onboarding_status as enum (
  'not_started',
  'in_progress',
  'completed'
);

create type public.legal_document_type as enum ('terms', 'privacy');

create type public.goal_type as enum (
  'fat_loss',
  'muscle_gain',
  'maintenance',
  'body_recomposition'
);

create type public.goal_status as enum (
  'draft',
  'active',
  'completed',
  'cancelled',
  'archived'
);

create type public.food_ownership_type as enum ('catalog', 'private');

create type public.verification_status as enum (
  'verified',
  'user_label',
  'pending_verification',
  'unavailable'
);

create type public.measurement_basis as enum (
  'raw',
  'dry',
  'cooked',
  'as_sold',
  'label_serving'
);

create type public.nutrition_reference_unit as enum ('g', 'serving');

create type public.meal_type as enum ('breakfast', 'lunch', 'dinner');

create type public.warning_context_type as enum ('onboarding', 'plan');

create type public.plan_status as enum (
  'generated',
  'accepted',
  'superseded',
  'archived'
);

create type public.portion_unit as enum ('g', 'ml', 'serving', 'piece');

create type public.ai_request_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed'
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.onboarding_draft_is_safe(payload jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  item record;
  normalized_key text;
begin
  if jsonb_typeof(payload) = 'object' then
    for item in select key, value from jsonb_each(payload)
    loop
      normalized_key := regexp_replace(lower(item.key), '[^a-z0-9]+', '_', 'g');
      if normalized_key = any (
        array[
          'password',
          'password_confirmation',
          'confirm_password',
          'otp',
          'otp_code',
          'raw_otp',
          'verification_code',
          'access_token',
          'refresh_token'
        ]
      ) then
        return false;
      end if;

      if not private.onboarding_draft_is_safe(item.value) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for item in select value from jsonb_array_elements(payload)
    loop
      if not private.onboarding_draft_is_safe(item.value) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 1 and 120),
  gender public.profile_gender,
  age smallint check (age between 1 and 130),
  height_cm numeric(6, 2) check (height_cm between 50 and 300),
  preferred_weight_unit public.weight_unit not null default 'lb',
  time_zone text not null default 'UTC'
    check (char_length(btrim(time_zone)) between 1 and 100),
  activity_level public.activity_level,
  training_days_per_week smallint
    check (training_days_per_week between 0 and 7),
  dietary_restrictions text[] not null default '{}'
    check (cardinality(dietary_restrictions) <= 50),
  allergies text[] not null default '{}'
    check (cardinality(allergies) <= 50),
  disliked_foods text[] not null default '{}'
    check (cardinality(disliked_foods) <= 100),
  safety_context text check (char_length(safety_context) <= 4000),
  notes text check (char_length(notes) <= 4000),
  onboarding_status public.onboarding_status not null default 'not_started',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (onboarding_status = 'completed' and onboarding_completed_at is not null)
    or onboarding_status <> 'completed'
  )
);

create table public.legal_acceptances (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type public.legal_document_type not null,
  document_version text not null
    check (char_length(btrim(document_version)) between 1 and 80),
  accepted_at timestamptz not null default now(),
  unique (user_id, document_type, document_version)
);

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
      coalesce(nullif(btrim(metadata ->> 'full_name'), ''), 'Cutting Plan user'),
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

create trigger initialize_verified_user
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function private.initialize_verified_user();

create table public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_step smallint not null default 1 check (current_step between 1 and 6),
  validated_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(validated_data) = 'object')
    check (private.onboarding_draft_is_safe(validated_data)),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type public.goal_type not null,
  target_weight_kg numeric(7, 3) not null
    check (target_weight_kg between 20 and 500),
  plan_start_date date not null,
  target_date date not null,
  status public.goal_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (target_date >= plan_start_date)
);

create unique index goals_one_active_per_user_idx
  on public.goals (user_id)
  where status = 'active';

create table public.weight_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  weight_kg numeric(7, 3) not null check (weight_kg between 20 and 500),
  source_display_unit public.weight_unit not null,
  is_onboarding_baseline boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create unique index weight_entries_one_baseline_per_user_idx
  on public.weight_entries (user_id)
  where is_onboarding_baseline;

create table public.foods (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 100
    ),
  english_name text not null
    check (char_length(btrim(english_name)) between 1 and 160),
  icon_ref text check (char_length(icon_ref) <= 160),
  source text not null check (char_length(btrim(source)) between 1 and 240),
  ownership_type public.food_ownership_type not null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  verification_status public.verification_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (ownership_type = 'catalog' and owner_user_id is null)
    or (
      ownership_type = 'private'
      and owner_user_id is not null
      and verification_status in (
        'user_label',
        'pending_verification',
        'unavailable'
      )
    )
  )
);

create unique index foods_catalog_slug_idx
  on public.foods (slug)
  where ownership_type = 'catalog';

create unique index foods_private_owner_slug_idx
  on public.foods (owner_user_id, slug)
  where ownership_type = 'private';

create index foods_owner_user_id_idx
  on public.foods (owner_user_id)
  where owner_user_id is not null;

create index foods_english_name_search_idx
  on public.foods using gin (to_tsvector('english', english_name));

create table public.food_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 60
    ),
  english_label text not null unique
    check (char_length(btrim(english_label)) between 1 and 80)
);

create table public.food_category_links (
  food_id uuid not null references public.foods(id) on delete cascade,
  category_id uuid not null references public.food_categories(id) on delete cascade,
  primary key (food_id, category_id)
);

create index food_category_links_category_id_idx
  on public.food_category_links (category_id);

create table public.allergens (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 80
  ),
  english_label text not null unique
    check (char_length(btrim(english_label)) between 1 and 100),
  aliases text[] not null default '{}'
    check (cardinality(aliases) <= 20)
);

create table public.dietary_restriction_types (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 80
  ),
  english_label text not null unique
    check (char_length(btrim(english_label)) between 1 and 100),
  aliases text[] not null default '{}'
    check (cardinality(aliases) <= 20)
);

create table public.food_allergens (
  food_id uuid not null references public.foods(id) on delete cascade,
  allergen_id uuid not null references public.allergens(id) on delete cascade,
  primary key (food_id, allergen_id)
);

create index food_allergens_allergen_id_idx
  on public.food_allergens (allergen_id);

create table public.food_dietary_restrictions (
  food_id uuid not null references public.foods(id) on delete cascade,
  restriction_id uuid not null
    references public.dietary_restriction_types(id)
    on delete cascade,
  primary key (food_id, restriction_id)
);

create index food_dietary_restrictions_restriction_id_idx
  on public.food_dietary_restrictions (restriction_id);

create table public.food_nutrition (
  id uuid primary key default extensions.gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  measurement_basis public.measurement_basis not null,
  reference_quantity numeric(9, 3) not null check (reference_quantity > 0),
  reference_unit public.nutrition_reference_unit not null,
  serving_weight_grams numeric(9, 3)
    check (serving_weight_grams > 0),
  calories numeric(10, 3) check (calories between 0 and 10000),
  protein_g numeric(10, 3) check (protein_g between 0 and 10000),
  carbohydrate_g numeric(10, 3) check (carbohydrate_g between 0 and 10000),
  fat_g numeric(10, 3) check (fat_g between 0 and 10000),
  fiber_g numeric(10, 3) check (fiber_g between 0 and 10000),
  sodium_mg numeric(12, 3) check (sodium_mg between 0 and 1000000),
  source_name text check (char_length(source_name) <= 240),
  source_reference text check (char_length(source_reference) <= 1000),
  verification_status public.verification_status not null,
  source_version text check (char_length(source_version) <= 160),
  verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id, measurement_basis),
  check (
    (
      measurement_basis = 'label_serving'
      and reference_unit = 'serving'
      and serving_weight_grams is not null
    )
    or (
      measurement_basis <> 'label_serving'
      and reference_unit = 'g'
      and reference_quantity = 100
      and serving_weight_grams is null
    )
  ),
  check (
    num_nonnulls(calories, protein_g, carbohydrate_g, fat_g) in (0, 4)
  ),
  check (
    (
      verification_status in ('verified', 'user_label')
      and num_nonnulls(calories, protein_g, carbohydrate_g, fat_g) = 4
    )
    or (
      verification_status in ('pending_verification', 'unavailable')
      and num_nonnulls(calories, protein_g, carbohydrate_g, fat_g) = 0
      and fiber_g is null
      and sodium_mg is null
    )
  ),
  check (
    verification_status <> 'verified'
    or (
      source_name is not null
      and source_reference is not null
      and (verified_at is not null or source_version is not null)
    )
  ),
  check (
    verification_status <> 'user_label'
    or (
      measurement_basis = 'label_serving'
      and source_name is not null
      and source_reference is not null
    )
  )
);

create table public.meal_preferences (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_type public.meal_type not null,
  food_id uuid not null references public.foods(id) on delete restrict,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, meal_type, food_id)
);

create index meal_preferences_user_meal_sort_idx
  on public.meal_preferences (user_id, meal_type, sort_order, id);

create table public.onboarding_warnings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  warning_code text not null
    check (char_length(btrim(warning_code)) between 1 and 120),
  meal_type public.meal_type not null,
  context_type public.warning_context_type not null,
  context_version text not null
    check (char_length(btrim(context_version)) between 1 and 120),
  acknowledged_at timestamptz not null default now(),
  unique (
    user_id,
    warning_code,
    meal_type,
    context_type,
    context_version
  )
);

create table public.plans (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  version integer not null check (version > 0),
  status public.plan_status not null default 'generated',
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  prompt_version text not null
    check (char_length(btrim(prompt_version)) between 1 and 80),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  validated_output_snapshot jsonb not null
    check (jsonb_typeof(validated_output_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (id, user_id),
  unique (user_id, version),
  foreign key (goal_id, user_id)
    references public.goals (id, user_id)
    on delete restrict,
  check (status <> 'accepted' or accepted_at is not null)
);

create unique index plans_one_accepted_per_user_idx
  on public.plans (user_id)
  where status = 'accepted';

create index plans_user_created_at_idx
  on public.plans (user_id, created_at desc);

create table public.plan_days (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  day_index smallint not null check (day_index between 1 and 7),
  title text check (char_length(title) <= 120),
  unique (plan_id, day_index)
);

create table public.plan_meals (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days(id) on delete cascade,
  meal_type public.meal_type not null,
  sort_order smallint not null check (sort_order >= 0),
  unique (plan_day_id, meal_type),
  unique (plan_day_id, sort_order)
);

create table public.plan_items (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_meal_id uuid not null references public.plan_meals(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0 and quantity <= 10000),
  unit public.portion_unit not null,
  measurement_basis public.measurement_basis not null,
  sort_order integer not null check (sort_order >= 0),
  preparation_note text check (char_length(preparation_note) <= 500),
  substitution_group text check (char_length(substitution_group) <= 120),
  verification_status public.verification_status not null,
  unique (plan_meal_id, sort_order),
  unique (plan_meal_id, food_id, measurement_basis),
  foreign key (food_id, measurement_basis)
    references public.food_nutrition (food_id, measurement_basis)
    on delete restrict
);

create index plan_items_food_id_idx on public.plan_items (food_id);

create table public.daily_checkins (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  breakfast_completed boolean not null default false,
  lunch_completed boolean not null default false,
  dinner_completed boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table public.ai_generation_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null
    check (char_length(btrim(idempotency_key)) between 8 and 200),
  status public.ai_request_status not null default 'pending',
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 160),
  prompt_version text not null
    check (char_length(btrim(prompt_version)) between 1 and 80),
  plan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  sanitized_error_code text check (char_length(sanitized_error_code) <= 120),
  unique (user_id, idempotency_key),
  foreign key (plan_id, user_id)
    references public.plans (id, user_id)
    on delete restrict,
  check (
    (status in ('succeeded', 'failed') and completed_at is not null)
    or (status in ('pending', 'processing') and completed_at is null)
  ),
  check (status <> 'succeeded' or plan_id is not null),
  check (status <> 'failed' or sanitized_error_code is not null)
);

create index legal_acceptances_user_id_idx
  on public.legal_acceptances (user_id);
create index goals_user_id_idx on public.goals (user_id);
create index weight_entries_user_date_idx
  on public.weight_entries (user_id, local_date desc);
create index food_nutrition_food_id_idx on public.food_nutrition (food_id);
create index onboarding_warnings_user_id_idx
  on public.onboarding_warnings (user_id);
create index plan_days_plan_id_idx on public.plan_days (plan_id);
create index plan_meals_plan_day_id_idx on public.plan_meals (plan_day_id);
create index daily_checkins_user_date_idx
  on public.daily_checkins (user_id, local_date desc);
create index ai_generation_requests_user_created_idx
  on public.ai_generation_requests (user_id, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger onboarding_drafts_set_updated_at
before update on public.onboarding_drafts
for each row execute function private.set_updated_at();

create trigger goals_set_updated_at
before update on public.goals
for each row execute function private.set_updated_at();

create trigger weight_entries_set_updated_at
before update on public.weight_entries
for each row execute function private.set_updated_at();

create trigger foods_set_updated_at
before update on public.foods
for each row execute function private.set_updated_at();

create trigger food_nutrition_set_updated_at
before update on public.food_nutrition
for each row execute function private.set_updated_at();

create trigger plans_set_updated_at
before update on public.plans
for each row execute function private.set_updated_at();

create trigger daily_checkins_set_updated_at
before update on public.daily_checkins
for each row execute function private.set_updated_at();

create trigger ai_generation_requests_set_updated_at
before update on public.ai_generation_requests
for each row execute function private.set_updated_at();

create or replace function private.can_access_food(target_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.foods
      where id = target_food_id
        and (
          ownership_type = 'catalog'
          or (
            ownership_type = 'private'
            and owner_user_id = (select auth.uid())
          )
        )
    );
$$;

create or replace function private.owns_private_food(target_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.foods
      where id = target_food_id
        and ownership_type = 'private'
        and owner_user_id = (select auth.uid())
    );
$$;

create or replace function private.is_plan_owner(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.plans
      where id = target_plan_id
        and user_id = (select auth.uid())
    );
$$;

create or replace function private.is_mutable_plan_owner(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.plans
      where id = target_plan_id
        and user_id = (select auth.uid())
        and status = 'generated'
        and accepted_at is null
    );
$$;

create or replace function private.is_plan_day_owner(target_plan_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.plan_days d
      join public.plans p on p.id = d.plan_id
      where d.id = target_plan_day_id
        and p.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_mutable_plan_day_owner(
  target_plan_day_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.plan_days d
      join public.plans p on p.id = d.plan_id
      where d.id = target_plan_day_id
        and p.user_id = (select auth.uid())
        and p.status = 'generated'
        and p.accepted_at is null
    );
$$;

create or replace function private.is_plan_meal_owner(target_plan_meal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.plan_meals m
      join public.plan_days d on d.id = m.plan_day_id
      join public.plans p on p.id = d.plan_id
      where m.id = target_plan_meal_id
        and p.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_mutable_plan_meal_owner(
  target_plan_meal_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.plan_meals m
      join public.plan_days d on d.id = m.plan_day_id
      join public.plans p on p.id = d.plan_id
      where m.id = target_plan_meal_id
        and p.user_id = (select auth.uid())
        and p.status = 'generated'
        and p.accepted_at is null
    );
$$;

create or replace function private.plan_is_complete(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) = 7
      from public.plan_days
      where plan_id = target_plan_id)
    and
    (select count(*) = 21
      from public.plan_meals m
      join public.plan_days d on d.id = m.plan_day_id
      where d.plan_id = target_plan_id)
    and not exists (
      select 1
      from public.plan_meals m
      join public.plan_days d on d.id = m.plan_day_id
      where d.plan_id = target_plan_id
        and not exists (
          select 1
          from public.plan_items i
          where i.plan_meal_id = m.id
        )
    );
$$;

create or replace function private.guard_plan_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.accepted_at is not null then
    if new.user_id is distinct from old.user_id
      or new.goal_id is distinct from old.goal_id
      or new.version is distinct from old.version
      or new.provider is distinct from old.provider
      or new.model is distinct from old.model
      or new.prompt_version is distinct from old.prompt_version
      or new.input_snapshot is distinct from old.input_snapshot
      or new.validated_output_snapshot is distinct from old.validated_output_snapshot
      or new.created_at is distinct from old.created_at
      or new.accepted_at is distinct from old.accepted_at
    then
      raise exception using
        errcode = '23514',
        message = 'Accepted plan content is immutable.';
    end if;
  end if;

  if new.status = 'accepted' then
    if not private.plan_is_complete(new.id) then
      raise exception using
        errcode = '23514',
        message = 'A plan must contain seven complete days before acceptance.';
    end if;
    new.accepted_at = coalesce(old.accepted_at, now());
  end if;

  return new;
end;
$$;

create trigger plans_guard_history
before update on public.plans
for each row execute function private.guard_plan_history();

create or replace function private.ensure_meal_preference_food_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.foods f
    where f.id = new.food_id
      and (
        f.ownership_type = 'catalog'
        or (
          f.ownership_type = 'private'
          and f.owner_user_id = new.user_id
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Meal preferences may only reference catalog or user-owned foods.';
  end if;

  return new;
end;
$$;

create trigger meal_preferences_check_food_ownership
before insert or update on public.meal_preferences
for each row execute function private.ensure_meal_preference_food_ownership();

create or replace function private.ensure_plan_item_food_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_user_id uuid;
begin
  select p.user_id
  into plan_user_id
  from public.plan_meals m
  join public.plan_days d on d.id = m.plan_day_id
  join public.plans p on p.id = d.plan_id
  where m.id = new.plan_meal_id;

  if plan_user_id is null or not exists (
    select 1
    from public.foods f
    where f.id = new.food_id
      and (
        f.ownership_type = 'catalog'
        or (
          f.ownership_type = 'private'
          and f.owner_user_id = plan_user_id
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Plan items may only reference catalog or plan-owner foods.';
  end if;

  return new;
end;
$$;

create trigger plan_items_check_food_ownership
before insert or update on public.plan_items
for each row execute function private.ensure_plan_item_food_ownership();

create or replace function public.accept_plan(target_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  perform 1
  from public.profiles
  where user_id = current_user_id
  for update;

  if not exists (
    select 1
    from public.plans
    where id = target_plan_id
      and user_id = current_user_id
      and status in ('generated', 'accepted', 'superseded')
  ) then
    raise exception using
      errcode = '42501',
      message = 'The requested plan is not available to this user.';
  end if;

  update public.plans
  set status = 'superseded'
  where user_id = current_user_id
    and status = 'accepted'
    and id <> target_plan_id;

  update public.plans
  set status = 'accepted'
  where id = target_plan_id
    and user_id = current_user_id;

  return target_plan_id;
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
    notes = excluded.notes
  returning * into saved_checkin;

  return saved_checkin;
end;
$$;

create or replace function public.complete_onboarding(
  profile_gender_value public.profile_gender,
  profile_age smallint,
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
  preferences jsonb,
  acknowledged_warnings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_goal_id uuid;
  selected_target_weight_kg numeric := target_weight_kg;
  selected_plan_start_date date := plan_start_date;
  selected_target_date date := target_date;
  preference record;
  warning record;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  perform 1
  from auth.users
  where id = current_user_id
    and email_confirmed_at is not null
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Email verification is required before completing onboarding.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = current_user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'A profile is required before completing onboarding.';
  end if;

  if not exists (
    select 1
    from public.legal_acceptances
    where user_id = current_user_id
      and document_type = 'terms'
  ) or not exists (
    select 1
    from public.legal_acceptances
    where user_id = current_user_id
      and document_type = 'privacy'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Terms and privacy acceptance are required.';
  end if;

  if jsonb_typeof(preferences) <> 'array'
    or jsonb_typeof(acknowledged_warnings) <> 'array'
  then
    raise exception using
      errcode = '22023',
      message = 'Onboarding preference and warning payloads must be arrays.';
  end if;

  update public.profiles
  set
    gender = profile_gender_value,
    age = profile_age,
    height_cm = profile_height_cm,
    preferred_weight_unit = profile_weight_unit,
    time_zone = profile_time_zone,
    activity_level = profile_activity_level,
    training_days_per_week = profile_training_days,
    dietary_restrictions = coalesce(profile_dietary_restrictions, '{}'),
    allergies = coalesce(profile_allergies, '{}'),
    disliked_foods = coalesce(profile_disliked_foods, '{}'),
    safety_context = profile_safety_context,
    notes = profile_notes,
    onboarding_status = 'in_progress'
  where user_id = current_user_id;

  select id
  into selected_goal_id
  from public.goals
  where user_id = current_user_id
    and status in ('active', 'draft')
  order by
    case when status = 'active' then 0 else 1 end,
    created_at desc
  limit 1
  for update;

  if selected_goal_id is null then
    insert into public.goals (
      user_id,
      goal_type,
      target_weight_kg,
      plan_start_date,
      target_date,
      status
    )
    values (
      current_user_id,
      selected_goal_type,
      target_weight_kg,
      plan_start_date,
      target_date,
      'active'
    )
    returning id into selected_goal_id;
  else
    update public.goals
    set
      goal_type = selected_goal_type,
      target_weight_kg = selected_target_weight_kg,
      plan_start_date = selected_plan_start_date,
      target_date = selected_target_date,
      status = 'active'
    where id = selected_goal_id
      and user_id = current_user_id;
  end if;

  update public.weight_entries
  set is_onboarding_baseline = false
  where user_id = current_user_id
    and is_onboarding_baseline
    and local_date <> plan_start_date;

  insert into public.weight_entries (
    user_id,
    local_date,
    weight_kg,
    source_display_unit,
    is_onboarding_baseline
  )
  values (
    current_user_id,
    plan_start_date,
    current_weight_kg,
    profile_weight_unit,
    true
  )
  on conflict (user_id, local_date) do update
  set
    weight_kg = excluded.weight_kg,
    source_display_unit = excluded.source_display_unit,
    is_onboarding_baseline = true;

  delete from public.meal_preferences
  where user_id = current_user_id;

  for preference in
    select value, ordinality
    from jsonb_array_elements(preferences) with ordinality
  loop
    insert into public.meal_preferences (
      user_id,
      meal_type,
      food_id,
      sort_order
    )
    values (
      current_user_id,
      (preference.value ->> 'mealType')::public.meal_type,
      (preference.value ->> 'foodId')::uuid,
      coalesce(
        (preference.value ->> 'sortOrder')::integer,
        preference.ordinality::integer - 1
      )
    );
  end loop;

  for warning in
    select value
    from jsonb_array_elements(acknowledged_warnings)
  loop
    insert into public.onboarding_warnings (
      user_id,
      warning_code,
      meal_type,
      context_type,
      context_version
    )
    values (
      current_user_id,
      warning.value ->> 'warningCode',
      (warning.value ->> 'mealType')::public.meal_type,
      'onboarding',
      warning.value ->> 'contextVersion'
    )
    on conflict (
      user_id,
      warning_code,
      meal_type,
      context_type,
      context_version
    ) do nothing;
  end loop;

  delete from public.onboarding_drafts
  where user_id = current_user_id;

  update public.profiles
  set
    onboarding_status = 'completed',
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where user_id = current_user_id;

  return selected_goal_id;
end;
$$;

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
  if (select auth.role()) <> 'service_role' then
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

  if request_record.status <> 'processing'
    or request_record.provider <> plan_provider
    or request_record.model <> plan_model
    or request_record.prompt_version <> plan_prompt_version
  then
    raise exception using
      errcode = '23514',
      message = 'The generation request metadata does not match this plan.';
  end if;

  if jsonb_typeof(plan_input_snapshot) <> 'object'
    or jsonb_typeof(plan_output) <> 'object'
    or plan_output ->> 'schemaVersion' <> '1.0'
    or jsonb_typeof(plan_output -> 'days') <> 'array'
    or jsonb_array_length(plan_output -> 'days') <> 7
  then
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
    if jsonb_typeof(day_record.value -> 'meals') <> 'array'
      or jsonb_array_length(day_record.value -> 'meals') <> 3
    then
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
      if jsonb_typeof(meal_record.value -> 'items') <> 'array'
        or jsonb_array_length(meal_record.value -> 'items') < 1
      then
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
    '20260724000000_initial_cutting_plan_schema';
begin
  if (select auth.role()) <> 'service_role' then
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

revoke all on function public.accept_plan(uuid) from public;
grant execute on function public.accept_plan(uuid) to authenticated;
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
revoke all on function public.complete_onboarding(
  public.profile_gender,
  smallint,
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
) from public;
grant execute on function public.complete_onboarding(
  public.profile_gender,
  smallint,
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
revoke all on function public.application_health(text) from public;
grant execute on function public.application_health(text) to service_role;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.onboarding_draft_is_safe(jsonb) to authenticated;
grant execute on function private.can_access_food(uuid) to authenticated;
grant execute on function private.owns_private_food(uuid) to authenticated;
grant execute on function private.is_plan_owner(uuid) to authenticated;
grant execute on function private.is_mutable_plan_owner(uuid) to authenticated;
grant execute on function private.is_plan_day_owner(uuid) to authenticated;
grant execute on function private.is_mutable_plan_day_owner(uuid) to authenticated;
grant execute on function private.is_plan_meal_owner(uuid) to authenticated;
grant execute on function private.is_mutable_plan_meal_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.onboarding_drafts enable row level security;
alter table public.goals enable row level security;
alter table public.weight_entries enable row level security;
alter table public.foods enable row level security;
alter table public.food_categories enable row level security;
alter table public.food_category_links enable row level security;
alter table public.allergens enable row level security;
alter table public.dietary_restriction_types enable row level security;
alter table public.food_allergens enable row level security;
alter table public.food_dietary_restrictions enable row level security;
alter table public.food_nutrition enable row level security;
alter table public.meal_preferences enable row level security;
alter table public.onboarding_warnings enable row level security;
alter table public.plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_meals enable row level security;
alter table public.plan_items enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.ai_generation_requests enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "legal_acceptances_select_own"
on public.legal_acceptances for select to authenticated
using ((select auth.uid()) = user_id);

create policy "legal_acceptances_insert_own"
on public.legal_acceptances for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "onboarding_drafts_select_own"
on public.onboarding_drafts for select to authenticated
using ((select auth.uid()) = user_id);

create policy "onboarding_drafts_insert_own"
on public.onboarding_drafts for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "onboarding_drafts_update_own"
on public.onboarding_drafts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "onboarding_drafts_delete_own"
on public.onboarding_drafts for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "goals_select_own"
on public.goals for select to authenticated
using ((select auth.uid()) = user_id);

create policy "goals_insert_own"
on public.goals for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "goals_update_own"
on public.goals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "goals_delete_own_non_active"
on public.goals for delete to authenticated
using ((select auth.uid()) = user_id and status <> 'active');

create policy "weight_entries_select_own"
on public.weight_entries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "weight_entries_insert_own"
on public.weight_entries for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "weight_entries_update_own"
on public.weight_entries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "weight_entries_delete_own"
on public.weight_entries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "foods_select_catalog_or_own"
on public.foods for select to authenticated
using (
  ownership_type = 'catalog'
  or (
    ownership_type = 'private'
    and owner_user_id = (select auth.uid())
  )
);

create policy "foods_insert_private_own"
on public.foods for insert to authenticated
with check (
  ownership_type = 'private'
  and owner_user_id = (select auth.uid())
);

create policy "foods_update_private_own"
on public.foods for update to authenticated
using (
  ownership_type = 'private'
  and owner_user_id = (select auth.uid())
)
with check (
  ownership_type = 'private'
  and owner_user_id = (select auth.uid())
);

create policy "foods_delete_private_own"
on public.foods for delete to authenticated
using (
  ownership_type = 'private'
  and owner_user_id = (select auth.uid())
);

create policy "food_categories_select_authenticated"
on public.food_categories for select to authenticated
using (true);

create policy "food_category_links_select_accessible"
on public.food_category_links for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_category_links_insert_private_own"
on public.food_category_links for insert to authenticated
with check ((select private.owns_private_food(food_id)));

create policy "food_category_links_delete_private_own"
on public.food_category_links for delete to authenticated
using ((select private.owns_private_food(food_id)));

create policy "allergens_select_authenticated"
on public.allergens for select to authenticated
using (true);

create policy "dietary_restriction_types_select_authenticated"
on public.dietary_restriction_types for select to authenticated
using (true);

create policy "food_allergens_select_accessible"
on public.food_allergens for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_allergens_insert_private_own"
on public.food_allergens for insert to authenticated
with check ((select private.owns_private_food(food_id)));

create policy "food_allergens_delete_private_own"
on public.food_allergens for delete to authenticated
using ((select private.owns_private_food(food_id)));

create policy "food_dietary_restrictions_select_accessible"
on public.food_dietary_restrictions for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_dietary_restrictions_insert_private_own"
on public.food_dietary_restrictions for insert to authenticated
with check ((select private.owns_private_food(food_id)));

create policy "food_dietary_restrictions_delete_private_own"
on public.food_dietary_restrictions for delete to authenticated
using ((select private.owns_private_food(food_id)));

create policy "food_nutrition_select_accessible"
on public.food_nutrition for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_nutrition_insert_private_own"
on public.food_nutrition for insert to authenticated
with check ((select private.owns_private_food(food_id)));

create policy "food_nutrition_update_private_own"
on public.food_nutrition for update to authenticated
using ((select private.owns_private_food(food_id)))
with check ((select private.owns_private_food(food_id)));

create policy "food_nutrition_delete_private_own"
on public.food_nutrition for delete to authenticated
using ((select private.owns_private_food(food_id)));

create policy "meal_preferences_select_own"
on public.meal_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy "meal_preferences_insert_own"
on public.meal_preferences for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.can_access_food(food_id))
);

create policy "meal_preferences_update_own"
on public.meal_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (select private.can_access_food(food_id))
);

create policy "meal_preferences_delete_own"
on public.meal_preferences for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "onboarding_warnings_select_own"
on public.onboarding_warnings for select to authenticated
using ((select auth.uid()) = user_id);

create policy "onboarding_warnings_insert_own"
on public.onboarding_warnings for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "plans_select_own"
on public.plans for select to authenticated
using ((select auth.uid()) = user_id);

create policy "plans_insert_own"
on public.plans for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'generated'
  and accepted_at is null
);

create policy "plans_update_own"
on public.plans for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "plans_delete_unaccepted_own"
on public.plans for delete to authenticated
using (
  (select auth.uid()) = user_id
  and status = 'generated'
  and accepted_at is null
);

create policy "plan_days_select_own"
on public.plan_days for select to authenticated
using ((select private.is_plan_owner(plan_id)));

create policy "plan_days_insert_mutable_own"
on public.plan_days for insert to authenticated
with check ((select private.is_mutable_plan_owner(plan_id)));

create policy "plan_days_update_mutable_own"
on public.plan_days for update to authenticated
using ((select private.is_mutable_plan_owner(plan_id)))
with check ((select private.is_mutable_plan_owner(plan_id)));

create policy "plan_days_delete_mutable_own"
on public.plan_days for delete to authenticated
using ((select private.is_mutable_plan_owner(plan_id)));

create policy "plan_meals_select_own"
on public.plan_meals for select to authenticated
using ((select private.is_plan_day_owner(plan_day_id)));

create policy "plan_meals_insert_mutable_own"
on public.plan_meals for insert to authenticated
with check ((select private.is_mutable_plan_day_owner(plan_day_id)));

create policy "plan_meals_update_mutable_own"
on public.plan_meals for update to authenticated
using ((select private.is_mutable_plan_day_owner(plan_day_id)))
with check ((select private.is_mutable_plan_day_owner(plan_day_id)));

create policy "plan_meals_delete_mutable_own"
on public.plan_meals for delete to authenticated
using ((select private.is_mutable_plan_day_owner(plan_day_id)));

create policy "plan_items_select_own"
on public.plan_items for select to authenticated
using ((select private.is_plan_meal_owner(plan_meal_id)));

create policy "plan_items_insert_mutable_own"
on public.plan_items for insert to authenticated
with check (
  (select private.is_mutable_plan_meal_owner(plan_meal_id))
  and (select private.can_access_food(food_id))
);

create policy "plan_items_update_mutable_own"
on public.plan_items for update to authenticated
using ((select private.is_mutable_plan_meal_owner(plan_meal_id)))
with check (
  (select private.is_mutable_plan_meal_owner(plan_meal_id))
  and (select private.can_access_food(food_id))
);

create policy "plan_items_delete_mutable_own"
on public.plan_items for delete to authenticated
using ((select private.is_mutable_plan_meal_owner(plan_meal_id)));

create policy "daily_checkins_select_own"
on public.daily_checkins for select to authenticated
using ((select auth.uid()) = user_id);

create policy "daily_checkins_insert_own"
on public.daily_checkins for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "daily_checkins_update_own"
on public.daily_checkins for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "daily_checkins_delete_own"
on public.daily_checkins for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_generation_requests_select_own"
on public.ai_generation_requests for select to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_generation_requests_insert_own"
on public.ai_generation_requests for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (plan_id is null or (select private.is_plan_owner(plan_id)))
);

create policy "ai_generation_requests_update_own"
on public.ai_generation_requests for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (plan_id is null or (select private.is_plan_owner(plan_id)))
);

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.legal_acceptances to authenticated;
grant select, insert, update, delete on public.onboarding_drafts to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.weight_entries to authenticated;
grant select, insert, update, delete on public.foods to authenticated;
grant select on public.food_categories to authenticated;
grant select, insert, delete on public.food_category_links to authenticated;
grant select on public.allergens to authenticated;
grant select on public.dietary_restriction_types to authenticated;
grant select, insert, delete on public.food_allergens to authenticated;
grant select, insert, delete on public.food_dietary_restrictions to authenticated;
grant select, insert, update, delete on public.food_nutrition to authenticated;
grant select, insert, update, delete on public.meal_preferences to authenticated;
grant select, insert on public.onboarding_warnings to authenticated;
grant select on public.plans to authenticated;
grant select on public.plan_days to authenticated;
grant select on public.plan_meals to authenticated;
grant select on public.plan_items to authenticated;
grant select, insert, update, delete on public.daily_checkins to authenticated;
grant select on public.ai_generation_requests to authenticated;

comment on table public.food_nutrition is
  'Normalized nutrition facts. Pending and unavailable rows intentionally contain no invented nutrient values.';
comment on table public.food_dietary_restrictions is
  'Each row means the food violates the linked dietary restriction.';
comment on column public.weight_entries.local_date is
  'User-local calendar date; timestamps remain UTC instants.';
comment on column public.onboarding_drafts.validated_data is
  'Validated resumable onboarding data. Passwords, OTPs, and session tokens are rejected by a database constraint.';
comment on function public.accept_plan(uuid) is
  'Atomically accepts one complete plan while preserving earlier versions.';
comment on function public.upsert_daily_checkin(date, boolean, boolean, boolean, text) is
  'Atomically stores the authenticated user requested final meal-completion state.';
comment on function public.complete_onboarding(
  public.profile_gender,
  smallint,
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
  'Atomically persists validated onboarding data and marks the authenticated profile complete last.';
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
