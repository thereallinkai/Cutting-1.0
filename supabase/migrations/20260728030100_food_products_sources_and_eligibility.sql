begin;

create type public.food_kind as enum ('generic', 'branded_product');
create type public.food_catalog_status as enum (
  'active',
  'pending_review',
  'rejected',
  'retired'
);
create type public.food_source_provider as enum (
  'usda_fdc',
  'open_food_facts',
  'user_label',
  'manual_review'
);
create type public.food_safety_data_status as enum (
  'unknown',
  'source_reported',
  'reviewed'
);

alter table public.foods
  add column food_kind public.food_kind not null default 'generic',
  add column catalog_status public.food_catalog_status not null default 'active';

create index foods_catalog_status_idx
  on public.foods (catalog_status, english_name);

create table public.food_products (
  food_id uuid primary key references public.foods(id) on delete cascade,
  parent_food_id uuid references public.foods(id) on delete set null,
  brand_name text not null
    check (char_length(btrim(brand_name)) between 1 and 160),
  product_name text not null
    check (char_length(btrim(product_name)) between 1 and 240),
  variant_name text check (char_length(btrim(variant_name)) between 1 and 160),
  manufacturer_name text
    check (char_length(btrim(manufacturer_name)) between 1 and 240),
  gtin text check (gtin ~ '^[0-9]{8,14}$'),
  package_description text
    check (char_length(btrim(package_description)) between 1 and 240),
  country_codes text[] not null default '{}'
    check (cardinality(country_codes) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_food_id is null or parent_food_id <> food_id)
);

create index food_products_gtin_idx
  on public.food_products (gtin)
  where gtin is not null;
create index food_products_brand_name_idx
  on public.food_products (lower(brand_name), lower(product_name));

create table public.food_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  provider public.food_source_provider not null,
  external_id text not null
    check (char_length(btrim(external_id)) between 1 and 240),
  source_url text check (char_length(source_url) <= 2000),
  source_version text check (char_length(source_version) <= 240),
  license_code text check (char_length(license_code) <= 120),
  attribution_text text check (char_length(attribution_text) <= 1000),
  source_modified_at timestamptz,
  retrieved_at timestamptz not null default now(),
  payload_sha256 text check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index food_sources_food_id_idx on public.food_sources (food_id);

create or replace function private.enforce_catalog_product_gtin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.gtin is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-gtin:' || new.gtin, 0));
  if exists (
    select 1
    from public.food_products product
    join public.foods food on food.id = product.food_id
    where product.gtin = new.gtin
      and product.food_id <> new.food_id
      and food.ownership_type = 'catalog'
  ) and exists (
    select 1
    from public.foods food
    where food.id = new.food_id
      and food.ownership_type = 'catalog'
  ) then
    raise exception using
      errcode = '23505',
      message = 'A catalog product already uses this GTIN.';
  end if;

  return new;
end;
$$;

create table private.food_source_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid not null references public.food_sources(id) on delete cascade,
  parser_version text not null
    check (char_length(btrim(parser_version)) between 1 and 120),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  retrieved_at timestamptz not null default now(),
  unique (source_id, payload_sha256)
);

create table public.external_food_lookup_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.food_source_provider not null
    check (provider in ('usda_fdc', 'open_food_facts')),
  requested_at timestamptz not null default now()
);

create index external_food_lookup_requests_user_time_idx
  on public.external_food_lookup_requests (user_id, requested_at desc);

create or replace function public.record_external_food_lookup(
  target_user_id uuid,
  lookup_provider public.food_source_provider
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role'
    or target_user_id is null
    or lookup_provider not in ('usda_fdc', 'open_food_facts')
  then
    raise exception using
      errcode = '42501',
      message = 'External lookup accounting is restricted to the trusted server.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('food-lookup:' || target_user_id::text, 0)
  );
  if (
    select count(*)
    from public.external_food_lookup_requests request
    where request.user_id = target_user_id
      and request.requested_at >= now() - interval '5 minutes'
  ) >= 12 then
    return false;
  end if;

  insert into public.external_food_lookup_requests (user_id, provider)
  values (target_user_id, lookup_provider);
  return true;
end;
$$;

alter table public.food_nutrition
  add column source_id uuid references public.food_sources(id) on delete set null,
  add column serving_description text
    check (char_length(btrim(serving_description)) between 1 and 160),
  add column energy_kj numeric(12, 3)
    check (energy_kj between 0 and 100000),
  add column saturated_fat_g numeric(10, 3)
    check (saturated_fat_g between 0 and 10000),
  add column trans_fat_g numeric(10, 3)
    check (trans_fat_g between 0 and 10000),
  add column total_sugars_g numeric(10, 3)
    check (total_sugars_g between 0 and 10000),
  add column added_sugars_g numeric(10, 3)
    check (added_sugars_g between 0 and 10000),
  add column cholesterol_mg numeric(12, 3)
    check (cholesterol_mg between 0 and 1000000),
  add column potassium_mg numeric(12, 3)
    check (potassium_mg between 0 and 1000000),
  add column calcium_mg numeric(12, 3)
    check (calcium_mg between 0 and 1000000),
  add column iron_mg numeric(12, 3)
    check (iron_mg between 0 and 1000000),
  add column vitamin_d_mcg numeric(12, 3)
    check (vitamin_d_mcg between 0 and 1000000);

create index food_nutrition_source_id_idx
  on public.food_nutrition (source_id)
  where source_id is not null;

-- Replace only the status/value constraint. The all-or-none core macro
-- constraint and measurement-basis constraints remain unchanged.
do $$
declare
  constraint_name text;
begin
  select constraint_entry.conname
  into constraint_name
  from pg_constraint constraint_entry
  where constraint_entry.conrelid = 'public.food_nutrition'::regclass
    and constraint_entry.contype = 'c'
    and pg_get_constraintdef(constraint_entry.oid) like '%verification_status%'
    and pg_get_constraintdef(constraint_entry.oid) like '%num_nonnulls(calories%'
    and pg_get_constraintdef(constraint_entry.oid) like '%pending_verification%'
  limit 1;

  if constraint_name is null then
    raise exception 'Could not locate the food nutrition verification/value constraint.';
  end if;

  execute format(
    'alter table public.food_nutrition drop constraint %I',
    constraint_name
  );
end;
$$;

alter table public.food_nutrition
  add constraint food_nutrition_values_match_verification_check
  check (
    (
      verification_status in ('verified', 'user_label', 'source_reported')
      and num_nonnulls(calories, protein_g, carbohydrate_g, fat_g) = 4
    )
    or (
      verification_status in ('pending_verification', 'unavailable')
      and num_nonnulls(calories, protein_g, carbohydrate_g, fat_g) = 0
      and fiber_g is null
      and sodium_mg is null
      and energy_kj is null
      and saturated_fat_g is null
      and trans_fat_g is null
      and total_sugars_g is null
      and added_sugars_g is null
      and cholesterol_mg is null
      and potassium_mg is null
      and calcium_mg is null
      and iron_mg is null
      and vitamin_d_mcg is null
    )
  ),
  add constraint food_nutrition_source_reported_provenance_check
  check (
    verification_status <> 'source_reported'
    or (
      source_name is not null
      and source_reference is not null
      and source_id is not null
    )
  );

create table public.food_nutrient_amounts (
  nutrition_id uuid not null
    references public.food_nutrition(id) on delete cascade,
  nutrient_code text not null
    check (
      nutrient_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(nutrient_code) between 1 and 120
    ),
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 160),
  amount numeric(16, 6) not null check (amount >= 0),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  daily_value_percent numeric(10, 3)
    check (daily_value_percent between 0 and 10000),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  primary key (nutrition_id, nutrient_code)
);

create table public.food_safety_metadata (
  food_id uuid primary key references public.foods(id) on delete cascade,
  ingredients_text text check (char_length(ingredients_text) <= 10000),
  allergen_statement text check (char_length(allergen_statement) <= 4000),
  allergen_data_status public.food_safety_data_status not null default 'unknown',
  restriction_data_status public.food_safety_data_status not null default 'unknown',
  source_id uuid references public.food_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.can_access_nutrition(
  target_nutrition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.food_nutrition nutrition
    where nutrition.id = target_nutrition_id
      and (select private.can_access_food(nutrition.food_id))
  );
$$;

create or replace function private.food_is_plan_eligible(
  target_food_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and (
      target_user_id = (select auth.uid())
      or (select auth.role()) = 'service_role'
    )
    and exists (
      select 1
      from public.foods food
      join public.food_nutrition nutrition
        on nutrition.food_id = food.id
      join public.food_safety_metadata safety
        on safety.food_id = food.id
      where food.id = target_food_id
        and food.catalog_status = 'active'
        and (
          (
            food.ownership_type = 'catalog'
            and food.verification_status = 'verified'
            and nutrition.verification_status = 'verified'
          )
          or (
            food.ownership_type = 'private'
            and food.owner_user_id = target_user_id
            and food.verification_status = 'user_label'
            and nutrition.verification_status = 'user_label'
          )
        )
        and num_nonnulls(
          nutrition.calories,
          nutrition.protein_g,
          nutrition.carbohydrate_g,
          nutrition.fat_g
        ) = 4
        and safety.allergen_data_status = 'reviewed'
        and safety.restriction_data_status = 'reviewed'
    );
$$;

-- Existing verified seed records already have reviewed category, allergen, and
-- restriction mappings. Preserve their eligibility. Missing source data remains
-- unknown and therefore blocked.
insert into public.food_safety_metadata (
  food_id,
  allergen_data_status,
  restriction_data_status
)
select
  food.id,
  case
    when food.ownership_type = 'catalog'
      and food.verification_status = 'verified'
    then 'reviewed'::public.food_safety_data_status
    else 'unknown'::public.food_safety_data_status
  end,
  case
    when food.ownership_type = 'catalog'
      and food.verification_status = 'verified'
    then 'reviewed'::public.food_safety_data_status
    else 'unknown'::public.food_safety_data_status
  end
from public.foods food
on conflict (food_id) do nothing;

insert into public.food_sources (
  food_id,
  provider,
  external_id,
  source_url,
  source_version,
  license_code,
  attribution_text,
  retrieved_at
)
select
  food.id,
  case
    when food.ownership_type = 'private'
    then 'user_label'::public.food_source_provider
    when nutrition.source_name = 'USDA FoodData Central'
    then 'usda_fdc'::public.food_source_provider
    else 'manual_review'::public.food_source_provider
  end,
  case
    when food.ownership_type = 'private'
    then 'legacy-label:' || food.owner_user_id::text || ':' || nutrition.id::text
    when nutrition.source_name = 'USDA FoodData Central'
    then coalesce(
      substring(nutrition.source_reference from 'FDC ID ([0-9]+)'),
      'seed:' || food.slug
    )
    else 'seed:' || food.slug
  end,
  case
    when nutrition.source_name = 'USDA FoodData Central'
      and substring(nutrition.source_reference from 'FDC ID ([0-9]+)') is not null
    then 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/'
      || substring(nutrition.source_reference from 'FDC ID ([0-9]+)')
      || '/nutrients'
    else null
  end,
  nutrition.source_version,
  case
    when nutrition.source_name = 'USDA FoodData Central' then 'CC0-1.0'
    else null
  end,
  case
    when nutrition.source_name = 'USDA FoodData Central'
    then 'U.S. Department of Agriculture, Agricultural Research Service, FoodData Central.'
    else nutrition.source_name
  end,
  coalesce(nutrition.verified_at::timestamptz, nutrition.created_at)
from public.foods food
join public.food_nutrition nutrition on nutrition.food_id = food.id
on conflict (provider, external_id) do nothing;

update public.food_nutrition nutrition
set source_id = source.id
from public.food_sources source
where source.food_id = nutrition.food_id
  and nutrition.source_id is null;

update public.food_safety_metadata safety
set source_id = nutrition.source_id
from public.food_nutrition nutrition
where nutrition.food_id = safety.food_id
  and safety.source_id is null;

create or replace function public.search_food_catalog(
  search_query text default '',
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  english_name text,
  icon_ref text,
  verification_status public.verification_status,
  ownership_type public.food_ownership_type,
  food_kind public.food_kind,
  catalog_status public.food_catalog_status,
  brand_name text,
  product_name text,
  variant_name text,
  gtin text,
  package_description text,
  categories text[],
  nutrition jsonb,
  source jsonb,
  plan_eligible boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with accessible as (
    select
      food.id,
      food.slug,
      food.english_name,
      food.icon_ref,
      food.verification_status,
      food.ownership_type,
      food.food_kind,
      food.catalog_status,
      product.brand_name,
      product.product_name,
      product.variant_name,
      product.gtin,
      product.package_description,
      coalesce(category_data.categories, '{}') as categories,
      case
        when nutrition.id is null then null
        else jsonb_build_object(
          'id', nutrition.id,
          'measurement_basis', nutrition.measurement_basis,
          'reference_quantity', nutrition.reference_quantity,
          'reference_unit', nutrition.reference_unit,
          'serving_weight_grams', nutrition.serving_weight_grams,
          'serving_description', nutrition.serving_description,
          'calories', nutrition.calories,
          'energy_kj', nutrition.energy_kj,
          'protein_g', nutrition.protein_g,
          'carbohydrate_g', nutrition.carbohydrate_g,
          'fat_g', nutrition.fat_g,
          'fiber_g', nutrition.fiber_g,
          'sodium_mg', nutrition.sodium_mg,
          'saturated_fat_g', nutrition.saturated_fat_g,
          'trans_fat_g', nutrition.trans_fat_g,
          'total_sugars_g', nutrition.total_sugars_g,
          'added_sugars_g', nutrition.added_sugars_g,
          'cholesterol_mg', nutrition.cholesterol_mg,
          'potassium_mg', nutrition.potassium_mg,
          'calcium_mg', nutrition.calcium_mg,
          'iron_mg', nutrition.iron_mg,
          'vitamin_d_mcg', nutrition.vitamin_d_mcg,
          'verification_status', nutrition.verification_status,
          'nutrients', coalesce(nutrient_data.nutrients, '[]'::jsonb)
        )
      end as nutrition,
      case
        when source.id is null then
          case
            when nutrition.source_name is null then null
            else jsonb_build_object(
              'provider', 'manual_review',
              'external_id', null,
              'source_url', null,
              'source_version', nutrition.source_version,
              'license_code', null,
              'attribution_text', nutrition.source_name,
              'source_reference', nutrition.source_reference,
              'retrieved_at', nutrition.verified_at
            )
          end
        else jsonb_build_object(
          'provider', source.provider,
          'external_id', source.external_id,
          'source_url', source.source_url,
          'source_version', source.source_version,
          'license_code', source.license_code,
          'attribution_text', source.attribution_text,
          'source_reference', nutrition.source_reference,
          'retrieved_at', source.retrieved_at
        )
      end as source,
      private.food_is_plan_eligible(food.id, (select auth.uid()))
        as plan_eligible
    from public.foods food
    left join public.food_products product on product.food_id = food.id
    left join lateral (
      select array_agg(category.english_label order by category.english_label)
        as categories
      from public.food_category_links link
      join public.food_categories category on category.id = link.category_id
      where link.food_id = food.id
    ) category_data on true
    left join lateral (
      select nutrition_row.*
      from public.food_nutrition nutrition_row
      where nutrition_row.food_id = food.id
      order by
        (nutrition_row.verification_status = 'verified') desc,
        (nutrition_row.measurement_basis = 'label_serving') desc,
        nutrition_row.created_at desc
      limit 1
    ) nutrition on true
    left join public.food_sources source on source.id = nutrition.source_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'code', amount.nutrient_code,
          'name', amount.display_name,
          'amount', amount.amount,
          'unit', amount.unit,
          'daily_value_percent', amount.daily_value_percent
        )
        order by amount.display_order, amount.nutrient_code
      ) as nutrients
      from public.food_nutrient_amounts amount
      where amount.nutrition_id = nutrition.id
    ) nutrient_data on true
    where (
      food.ownership_type = 'catalog'
      or food.owner_user_id = (select auth.uid())
    )
      and (
        (
          food.ownership_type = 'catalog'
          and food.catalog_status in ('active', 'pending_review')
        )
        or (
          food.ownership_type = 'private'
          and food.catalog_status = 'active'
        )
      )
      and (
        nullif(btrim(coalesce(search_query, '')), '') is null
        or food.english_name ilike '%' || btrim(coalesce(search_query, '')) || '%'
        or food.slug ilike '%' || btrim(coalesce(search_query, '')) || '%'
        or product.brand_name ilike '%' || btrim(coalesce(search_query, '')) || '%'
        or product.product_name ilike '%' || btrim(coalesce(search_query, '')) || '%'
        or product.variant_name ilike '%' || btrim(coalesce(search_query, '')) || '%'
        or product.gtin = regexp_replace(coalesce(search_query, ''), '[^0-9]', '', 'g')
      )
  )
  select
    accessible.id,
    accessible.slug,
    accessible.english_name,
    accessible.icon_ref,
    accessible.verification_status,
    accessible.ownership_type,
    accessible.food_kind,
    accessible.catalog_status,
    accessible.brand_name,
    accessible.product_name,
    accessible.variant_name,
    accessible.gtin,
    accessible.package_description,
    accessible.categories,
    accessible.nutrition,
    accessible.source,
    accessible.plan_eligible,
    count(*) over () as total_count
  from accessible
  order by
    case
      when accessible.gtin = regexp_replace(coalesce(search_query, ''), '[^0-9]', '', 'g')
      then 0
      when lower(accessible.english_name) = lower(btrim(coalesce(search_query, '')))
      then 1
      else 2
    end,
    accessible.english_name
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

create or replace function public.cache_external_food(
  source_provider public.food_source_provider,
  source_external_id text,
  normalized_food jsonb,
  normalized_nutrition jsonb,
  source_metadata jsonb,
  source_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached_food_id uuid;
  new_food_id uuid;
  new_source_id uuid;
  new_nutrition_id uuid;
  normalized_gtin text;
  category_slug text;
  nutrient_entry jsonb;
begin
  if source_provider not in ('usda_fdc', 'open_food_facts')
    or char_length(btrim(source_external_id)) not between 1 and 240
    or jsonb_typeof(normalized_food) <> 'object'
    or jsonb_typeof(normalized_nutrition) <> 'object'
    or jsonb_typeof(source_metadata) <> 'object'
    or jsonb_typeof(source_snapshot) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'The external food payload is invalid.';
  end if;

  select source.food_id
  into cached_food_id
  from public.food_sources source
  where source.provider = source_provider
    and source.external_id = btrim(source_external_id);

  if cached_food_id is not null then
    if exists (
      select 1
      from public.foods food
      where food.id = cached_food_id
        and (
          food.ownership_type <> 'catalog'
          or food.verification_status <> 'source_reported'
          or food.catalog_status <> 'pending_review'
        )
    ) then
      return cached_food_id;
    end if;

    update public.food_sources
    set
      source_url = nullif(source_metadata ->> 'source_url', ''),
      source_version = nullif(source_metadata ->> 'source_version', ''),
      license_code = nullif(source_metadata ->> 'license_code', ''),
      attribution_text = nullif(source_metadata ->> 'attribution_text', ''),
      retrieved_at = now(),
      payload_sha256 = source_metadata ->> 'payload_sha256',
      source_modified_at = nullif(source_metadata ->> 'source_modified_at', '')::timestamptz,
      updated_at = now()
    where provider = source_provider
      and external_id = btrim(source_external_id)
    returning id into new_source_id;

    insert into private.food_source_snapshots (
      source_id,
      parser_version,
      payload_sha256,
      payload
    )
    values (
      new_source_id,
      source_metadata ->> 'parser_version',
      source_metadata ->> 'payload_sha256',
      source_snapshot
    )
    on conflict (source_id, payload_sha256) do nothing;

    update public.foods
    set
      slug = normalized_food ->> 'slug',
      english_name = normalized_food ->> 'english_name',
      source = source_metadata ->> 'source_name',
      updated_at = now()
    where id = cached_food_id
      and ownership_type = 'catalog'
      and verification_status = 'source_reported'
      and catalog_status = 'pending_review';

    update public.food_products product
    set
      brand_name = normalized_food ->> 'brand_name',
      product_name = normalized_food ->> 'product_name',
      variant_name = nullif(normalized_food ->> 'variant_name', ''),
      manufacturer_name = nullif(normalized_food ->> 'manufacturer_name', ''),
      package_description = nullif(normalized_food ->> 'package_description', ''),
      country_codes = coalesce(
        array(
          select jsonb_array_elements_text(
            coalesce(normalized_food -> 'country_codes', '[]'::jsonb)
          )
        ),
        '{}'
      ),
      updated_at = now()
    from public.foods food
    where product.food_id = cached_food_id
      and food.id = product.food_id
      and food.ownership_type = 'catalog'
      and food.verification_status = 'source_reported'
      and food.catalog_status = 'pending_review';

    insert into public.food_nutrition (
      food_id,
      measurement_basis,
      reference_quantity,
      reference_unit,
      serving_weight_grams,
      serving_description,
      calories,
      energy_kj,
      protein_g,
      carbohydrate_g,
      fat_g,
      fiber_g,
      sodium_mg,
      saturated_fat_g,
      trans_fat_g,
      total_sugars_g,
      added_sugars_g,
      cholesterol_mg,
      potassium_mg,
      calcium_mg,
      iron_mg,
      vitamin_d_mcg,
      source_name,
      source_reference,
      verification_status,
      source_version,
      verified_at,
      source_id
    )
    select
      cached_food_id,
      (normalized_nutrition ->> 'measurement_basis')::public.measurement_basis,
      (normalized_nutrition ->> 'reference_quantity')::numeric,
      (normalized_nutrition ->> 'reference_unit')::public.nutrition_reference_unit,
      nullif(normalized_nutrition ->> 'serving_weight_grams', '')::numeric,
      nullif(normalized_nutrition ->> 'serving_description', ''),
      (normalized_nutrition ->> 'calories')::numeric,
      nullif(normalized_nutrition ->> 'energy_kj', '')::numeric,
      (normalized_nutrition ->> 'protein_g')::numeric,
      (normalized_nutrition ->> 'carbohydrate_g')::numeric,
      (normalized_nutrition ->> 'fat_g')::numeric,
      nullif(normalized_nutrition ->> 'fiber_g', '')::numeric,
      nullif(normalized_nutrition ->> 'sodium_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'saturated_fat_g', '')::numeric,
      nullif(normalized_nutrition ->> 'trans_fat_g', '')::numeric,
      nullif(normalized_nutrition ->> 'total_sugars_g', '')::numeric,
      nullif(normalized_nutrition ->> 'added_sugars_g', '')::numeric,
      nullif(normalized_nutrition ->> 'cholesterol_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'potassium_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'calcium_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'iron_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'vitamin_d_mcg', '')::numeric,
      source_metadata ->> 'source_name',
      source_metadata ->> 'source_reference',
      'source_reported'::public.verification_status,
      nullif(source_metadata ->> 'source_version', ''),
      null,
      new_source_id
    from public.foods food
    where food.id = cached_food_id
      and food.ownership_type = 'catalog'
      and food.verification_status = 'source_reported'
      and food.catalog_status = 'pending_review'
    on conflict (food_id, measurement_basis) do update
    set
      reference_quantity = excluded.reference_quantity,
      reference_unit = excluded.reference_unit,
      serving_weight_grams = excluded.serving_weight_grams,
      serving_description = excluded.serving_description,
      calories = excluded.calories,
      energy_kj = excluded.energy_kj,
      protein_g = excluded.protein_g,
      carbohydrate_g = excluded.carbohydrate_g,
      fat_g = excluded.fat_g,
      fiber_g = excluded.fiber_g,
      sodium_mg = excluded.sodium_mg,
      saturated_fat_g = excluded.saturated_fat_g,
      trans_fat_g = excluded.trans_fat_g,
      total_sugars_g = excluded.total_sugars_g,
      added_sugars_g = excluded.added_sugars_g,
      cholesterol_mg = excluded.cholesterol_mg,
      potassium_mg = excluded.potassium_mg,
      calcium_mg = excluded.calcium_mg,
      iron_mg = excluded.iron_mg,
      vitamin_d_mcg = excluded.vitamin_d_mcg,
      source_name = excluded.source_name,
      source_reference = excluded.source_reference,
      verification_status = excluded.verification_status,
      source_version = excluded.source_version,
      verified_at = null,
      source_id = excluded.source_id,
      updated_at = now()
    where public.food_nutrition.verification_status = 'source_reported'
    returning id into new_nutrition_id;

    if new_nutrition_id is not null then
      delete from public.food_nutrient_amounts
      where nutrition_id = new_nutrition_id;

      for nutrient_entry in
        select value
        from jsonb_array_elements(
          coalesce(normalized_nutrition -> 'nutrients', '[]'::jsonb)
        )
      loop
        insert into public.food_nutrient_amounts (
          nutrition_id,
          nutrient_code,
          display_name,
          amount,
          unit,
          daily_value_percent,
          display_order
        )
        values (
          new_nutrition_id,
          nutrient_entry ->> 'code',
          nutrient_entry ->> 'name',
          (nutrient_entry ->> 'amount')::numeric,
          nutrient_entry ->> 'unit',
          nullif(nutrient_entry ->> 'daily_value_percent', '')::numeric,
          coalesce((nutrient_entry ->> 'display_order')::integer, 0)
        );
      end loop;
    end if;

    update public.food_safety_metadata safety
    set
      ingredients_text = nullif(normalized_food ->> 'ingredients_text', ''),
      allergen_statement = nullif(normalized_food ->> 'allergen_statement', ''),
      allergen_data_status = 'source_reported',
      restriction_data_status = 'source_reported',
      source_id = new_source_id,
      updated_at = now()
    from public.foods food
    where safety.food_id = cached_food_id
      and food.id = safety.food_id
      and food.verification_status = 'source_reported'
      and food.catalog_status = 'pending_review';

    for category_slug in
      select jsonb_array_elements_text(
        coalesce(normalized_food -> 'category_slugs', '[]'::jsonb)
      )
    loop
      insert into public.food_category_links (food_id, category_id)
      select cached_food_id, category.id
      from public.food_categories category
      where category.slug = category_slug
      on conflict (food_id, category_id) do nothing;
    end loop;

    return cached_food_id;
  end if;

  normalized_gtin := nullif(normalized_food ->> 'gtin', '');
  if normalized_gtin is not null then
    select product.food_id
    into cached_food_id
    from public.food_products product
    join public.foods food on food.id = product.food_id
    where product.gtin = normalized_gtin
      and food.ownership_type = 'catalog';
  end if;

  if cached_food_id is not null then
    raise exception using
      errcode = '23505',
      message = 'A catalog product with this GTIN already has another source; explicit review is required before merging.';
  end if;

  if cached_food_id is null then
    insert into public.foods (
      slug,
      english_name,
      icon_ref,
      source,
      ownership_type,
      owner_user_id,
      verification_status,
      food_kind,
      catalog_status
    )
    values (
      normalized_food ->> 'slug',
      normalized_food ->> 'english_name',
      case
        when normalized_food ->> 'food_kind' = 'branded_product'
        then 'package'
        else 'utensils'
      end,
      source_metadata ->> 'source_name',
      'catalog',
      null,
      'source_reported',
      (normalized_food ->> 'food_kind')::public.food_kind,
      'pending_review'
    )
    returning id into new_food_id;

    if normalized_food ->> 'food_kind' = 'branded_product' then
      insert into public.food_products (
        food_id,
        parent_food_id,
        brand_name,
        product_name,
        variant_name,
        manufacturer_name,
        gtin,
        package_description,
        country_codes
      )
      values (
        new_food_id,
        nullif(normalized_food ->> 'parent_food_id', '')::uuid,
        normalized_food ->> 'brand_name',
        normalized_food ->> 'product_name',
        nullif(normalized_food ->> 'variant_name', ''),
        nullif(normalized_food ->> 'manufacturer_name', ''),
        normalized_gtin,
        nullif(normalized_food ->> 'package_description', ''),
        coalesce(
          array(
            select jsonb_array_elements_text(
              coalesce(normalized_food -> 'country_codes', '[]'::jsonb)
            )
          ),
          '{}'
        )
      );
    end if;
  else
    new_food_id := cached_food_id;
  end if;

  insert into public.food_sources (
    food_id,
    provider,
    external_id,
    source_url,
    source_version,
    license_code,
    attribution_text,
    source_modified_at,
    retrieved_at,
    payload_sha256
  )
  values (
    new_food_id,
    source_provider,
    btrim(source_external_id),
    nullif(source_metadata ->> 'source_url', ''),
    nullif(source_metadata ->> 'source_version', ''),
    nullif(source_metadata ->> 'license_code', ''),
    nullif(source_metadata ->> 'attribution_text', ''),
    nullif(source_metadata ->> 'source_modified_at', '')::timestamptz,
    now(),
    source_metadata ->> 'payload_sha256'
  )
  returning id into new_source_id;

  insert into private.food_source_snapshots (
    source_id,
    parser_version,
    payload_sha256,
    payload
  )
  values (
    new_source_id,
    source_metadata ->> 'parser_version',
    source_metadata ->> 'payload_sha256',
    source_snapshot
  )
  on conflict (source_id, payload_sha256) do nothing;

  if cached_food_id is null then
    insert into public.food_nutrition (
      food_id,
      measurement_basis,
      reference_quantity,
      reference_unit,
      serving_weight_grams,
      serving_description,
      calories,
      energy_kj,
      protein_g,
      carbohydrate_g,
      fat_g,
      fiber_g,
      sodium_mg,
      saturated_fat_g,
      trans_fat_g,
      total_sugars_g,
      added_sugars_g,
      cholesterol_mg,
      potassium_mg,
      calcium_mg,
      iron_mg,
      vitamin_d_mcg,
      source_name,
      source_reference,
      verification_status,
      source_version,
      verified_at,
      source_id
    )
    values (
      new_food_id,
      (normalized_nutrition ->> 'measurement_basis')::public.measurement_basis,
      (normalized_nutrition ->> 'reference_quantity')::numeric,
      (normalized_nutrition ->> 'reference_unit')::public.nutrition_reference_unit,
      nullif(normalized_nutrition ->> 'serving_weight_grams', '')::numeric,
      nullif(normalized_nutrition ->> 'serving_description', ''),
      (normalized_nutrition ->> 'calories')::numeric,
      nullif(normalized_nutrition ->> 'energy_kj', '')::numeric,
      (normalized_nutrition ->> 'protein_g')::numeric,
      (normalized_nutrition ->> 'carbohydrate_g')::numeric,
      (normalized_nutrition ->> 'fat_g')::numeric,
      nullif(normalized_nutrition ->> 'fiber_g', '')::numeric,
      nullif(normalized_nutrition ->> 'sodium_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'saturated_fat_g', '')::numeric,
      nullif(normalized_nutrition ->> 'trans_fat_g', '')::numeric,
      nullif(normalized_nutrition ->> 'total_sugars_g', '')::numeric,
      nullif(normalized_nutrition ->> 'added_sugars_g', '')::numeric,
      nullif(normalized_nutrition ->> 'cholesterol_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'potassium_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'calcium_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'iron_mg', '')::numeric,
      nullif(normalized_nutrition ->> 'vitamin_d_mcg', '')::numeric,
      source_metadata ->> 'source_name',
      source_metadata ->> 'source_reference',
      'source_reported',
      nullif(source_metadata ->> 'source_version', ''),
      null,
      new_source_id
    )
    returning id into new_nutrition_id;

    for nutrient_entry in
      select value
      from jsonb_array_elements(
        coalesce(normalized_nutrition -> 'nutrients', '[]'::jsonb)
      )
    loop
      insert into public.food_nutrient_amounts (
        nutrition_id,
        nutrient_code,
        display_name,
        amount,
        unit,
        daily_value_percent,
        display_order
      )
      values (
        new_nutrition_id,
        nutrient_entry ->> 'code',
        nutrient_entry ->> 'name',
        (nutrient_entry ->> 'amount')::numeric,
        nutrient_entry ->> 'unit',
        nullif(nutrient_entry ->> 'daily_value_percent', '')::numeric,
        coalesce((nutrient_entry ->> 'display_order')::integer, 0)
      )
      on conflict (nutrition_id, nutrient_code) do update
      set
        display_name = excluded.display_name,
        amount = excluded.amount,
        unit = excluded.unit,
        daily_value_percent = excluded.daily_value_percent,
        display_order = excluded.display_order;
    end loop;

    insert into public.food_safety_metadata (
      food_id,
      ingredients_text,
      allergen_statement,
      allergen_data_status,
      restriction_data_status,
      source_id
    )
    values (
      new_food_id,
      nullif(normalized_food ->> 'ingredients_text', ''),
      nullif(normalized_food ->> 'allergen_statement', ''),
      'source_reported',
      'source_reported',
      new_source_id
    );

    for category_slug in
      select jsonb_array_elements_text(
        coalesce(normalized_food -> 'category_slugs', '[]'::jsonb)
      )
    loop
      insert into public.food_category_links (food_id, category_id)
      select new_food_id, category.id
      from public.food_categories category
      where category.slug = category_slug
      on conflict (food_id, category_id) do nothing;
    end loop;
  end if;

  return new_food_id;
end;
$$;

create trigger food_products_set_updated_at
before update on public.food_products
for each row execute function private.set_updated_at();

create trigger food_products_enforce_catalog_gtin
before insert or update of gtin on public.food_products
for each row execute function private.enforce_catalog_product_gtin();

create trigger food_sources_set_updated_at
before update on public.food_sources
for each row execute function private.set_updated_at();

create trigger food_safety_metadata_set_updated_at
before update on public.food_safety_metadata
for each row execute function private.set_updated_at();

alter table public.food_products enable row level security;
alter table public.food_sources enable row level security;
alter table public.food_nutrient_amounts enable row level security;
alter table public.food_safety_metadata enable row level security;
alter table public.external_food_lookup_requests enable row level security;

create policy "food_products_select_accessible"
on public.food_products for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_products_insert_private_own"
on public.food_products for insert to authenticated
with check ((select private.owns_private_food(food_id)));

create policy "food_products_update_private_own"
on public.food_products for update to authenticated
using ((select private.owns_private_food(food_id)))
with check ((select private.owns_private_food(food_id)));

create policy "food_products_delete_private_own"
on public.food_products for delete to authenticated
using ((select private.owns_private_food(food_id)));

create policy "food_sources_select_accessible"
on public.food_sources for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_sources_insert_private_own"
on public.food_sources for insert to authenticated
with check (
  provider = 'user_label'
  and (select private.owns_private_food(food_id))
);

create policy "food_sources_update_private_own"
on public.food_sources for update to authenticated
using (
  provider = 'user_label'
  and (select private.owns_private_food(food_id))
)
with check (
  provider = 'user_label'
  and (select private.owns_private_food(food_id))
);

create policy "food_sources_delete_private_own"
on public.food_sources for delete to authenticated
using (
  provider = 'user_label'
  and (select private.owns_private_food(food_id))
);

create policy "food_nutrient_amounts_select_accessible"
on public.food_nutrient_amounts for select to authenticated
using ((select private.can_access_nutrition(nutrition_id)));

create policy "food_nutrient_amounts_insert_private_own"
on public.food_nutrient_amounts for insert to authenticated
with check (
  exists (
    select 1
    from public.food_nutrition nutrition
    where nutrition.id = nutrition_id
      and (select private.owns_private_food(nutrition.food_id))
  )
);

create policy "food_nutrient_amounts_update_private_own"
on public.food_nutrient_amounts for update to authenticated
using (
  exists (
    select 1
    from public.food_nutrition nutrition
    where nutrition.id = nutrition_id
      and (select private.owns_private_food(nutrition.food_id))
  )
)
with check (
  exists (
    select 1
    from public.food_nutrition nutrition
    where nutrition.id = nutrition_id
      and (select private.owns_private_food(nutrition.food_id))
  )
);

create policy "food_nutrient_amounts_delete_private_own"
on public.food_nutrient_amounts for delete to authenticated
using (
  exists (
    select 1
    from public.food_nutrition nutrition
    where nutrition.id = nutrition_id
      and (select private.owns_private_food(nutrition.food_id))
  )
);

create policy "food_safety_metadata_select_accessible"
on public.food_safety_metadata for select to authenticated
using ((select private.can_access_food(food_id)));

create policy "food_safety_metadata_insert_private_own"
on public.food_safety_metadata for insert to authenticated
with check ((select private.owns_private_food(food_id)));

create policy "food_safety_metadata_update_private_own"
on public.food_safety_metadata for update to authenticated
using ((select private.owns_private_food(food_id)))
with check ((select private.owns_private_food(food_id)));

create policy "food_safety_metadata_delete_private_own"
on public.food_safety_metadata for delete to authenticated
using ((select private.owns_private_food(food_id)));

revoke all on function private.can_access_nutrition(uuid) from public, anon;
grant execute on function private.can_access_nutrition(uuid)
  to authenticated, service_role;
revoke all on function private.food_is_plan_eligible(uuid, uuid)
  from public, anon;
grant execute on function private.food_is_plan_eligible(uuid, uuid)
  to authenticated, service_role;

revoke all on public.food_products from anon, authenticated;
revoke all on public.food_sources from anon, authenticated;
revoke all on public.food_nutrient_amounts from anon, authenticated;
revoke all on public.food_safety_metadata from anon, authenticated;
revoke all on public.external_food_lookup_requests from anon, authenticated;

revoke all on function public.record_external_food_lookup(
  uuid,
  public.food_source_provider
) from public, anon, authenticated;
grant execute on function public.record_external_food_lookup(
  uuid,
  public.food_source_provider
) to service_role;

grant select, insert, update, delete on public.food_products to authenticated;
grant select, insert, update, delete on public.food_sources to authenticated;
grant select, insert, update, delete on public.food_nutrient_amounts to authenticated;
grant select, insert, update, delete on public.food_safety_metadata to authenticated;

revoke all on function public.search_food_catalog(text, integer, integer)
  from public, anon;
grant execute on function public.search_food_catalog(text, integer, integer)
  to authenticated;

revoke all on function public.cache_external_food(
  public.food_source_provider,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.cache_external_food(
  public.food_source_provider,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;

comment on function private.food_is_plan_eligible(uuid, uuid) is
  'Central plan-eligibility gate: complete trusted core nutrition plus reviewed safety metadata.';
comment on table public.food_sources is
  'Typed, display-safe provenance for catalog and private foods. Raw provider payloads remain in the private schema.';
comment on table public.food_nutrient_amounts is
  'Extensible source-reported nutrients used for a complete visible nutrition-facts panel.';

commit;
