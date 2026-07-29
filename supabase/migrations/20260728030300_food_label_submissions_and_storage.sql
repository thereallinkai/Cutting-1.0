begin;

create type public.food_label_submission_status as enum (
  'draft',
  'submitted',
  'needs_changes',
  'approved',
  'rejected',
  'matched'
);
create type public.food_label_image_kind as enum (
  'front',
  'nutrition',
  'ingredients',
  'barcode'
);

create table public.food_label_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.food_label_submission_status not null default 'draft',
  brand_name text not null
    check (char_length(btrim(brand_name)) between 1 and 160),
  product_name text not null
    check (char_length(btrim(product_name)) between 1 and 240),
  variant_name text check (char_length(btrim(variant_name)) between 1 and 160),
  gtin text check (gtin ~ '^[0-9]{8,14}$'),
  package_description text
    check (char_length(btrim(package_description)) between 1 and 240),
  label_data jsonb not null
    check (
      jsonb_typeof(label_data) = 'object'
      and private.onboarding_draft_is_safe(label_data)
      and jsonb_typeof(label_data -> 'servingWeightGrams') = 'number'
      and jsonb_typeof(label_data -> 'calories') = 'number'
      and jsonb_typeof(label_data -> 'proteinGrams') = 'number'
      and jsonb_typeof(label_data -> 'carbohydrateGrams') = 'number'
      and jsonb_typeof(label_data -> 'fatGrams') = 'number'
    ),
  private_food_id uuid references public.foods(id) on delete set null,
  published_food_id uuid references public.foods(id) on delete set null,
  review_note text check (char_length(review_note) <= 2000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (status = 'draft' and submitted_at is null)
    or (status <> 'draft' and submitted_at is not null)
  )
);

create index food_label_submissions_user_created_idx
  on public.food_label_submissions (user_id, created_at desc);
create index food_label_submissions_gtin_idx
  on public.food_label_submissions (gtin)
  where gtin is not null;

create table public.food_label_images (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique
    check (char_length(object_path) between 1 and 1024),
  image_kind public.food_label_image_kind not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  byte_size integer not null check (byte_size between 1 and 8388608),
  pixel_width integer not null check (pixel_width between 1 and 20000),
  pixel_height integer not null check (pixel_height between 1 and 20000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (submission_id, user_id)
    references public.food_label_submissions (id, user_id)
    on delete cascade,
  check ((pixel_width::bigint * pixel_height::bigint) <= 20000000)
);

create index food_label_images_submission_idx
  on public.food_label_images (submission_id, image_kind);

-- The initial schema limited user-label nutrition to a label-serving row.
-- Explicit confirmation now also creates a deterministic per-100g derivative
-- so generated gram-based plans can use the owner's product safely.
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
    and pg_get_constraintdef(constraint_entry.oid) like '%user_label%'
    and pg_get_constraintdef(constraint_entry.oid) like '%label_serving%'
    and pg_get_constraintdef(constraint_entry.oid) like '%source_reference%'
  limit 1;

  if constraint_name is null then
    raise exception 'Could not locate the user-label provenance constraint.';
  end if;

  execute format(
    'alter table public.food_nutrition drop constraint %I',
    constraint_name
  );
end;
$$;

alter table public.food_nutrition
  add constraint food_nutrition_user_label_provenance_check
  check (
    verification_status <> 'user_label'
    or (
      measurement_basis in ('label_serving', 'as_sold')
      and source_name is not null
      and source_reference is not null
      and source_id is not null
    )
  );

create or replace function private.owns_food_label_submission(
  target_submission_id uuid
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
      from public.food_label_submissions submission
      where submission.id = target_submission_id
        and submission.user_id = (select auth.uid())
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
            and safety.allergen_data_status = 'reviewed'
            and safety.restriction_data_status = 'reviewed'
          )
          or (
            food.ownership_type = 'private'
            and food.owner_user_id = target_user_id
            and food.verification_status = 'user_label'
            and nutrition.verification_status = 'user_label'
            and safety.allergen_data_status in ('user_confirmed', 'reviewed')
            and safety.restriction_data_status in ('user_confirmed', 'reviewed')
          )
        )
        and num_nonnulls(
          nutrition.calories,
          nutrition.protein_g,
          nutrition.carbohydrate_g,
          nutrition.fat_g
        ) = 4
    );
$$;

create or replace function public.plan_eligible_food_ids(
  candidate_food_ids uuid[]
)
returns table (food_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select candidate.food_id
  from unnest(coalesce(candidate_food_ids, '{}')) candidate(food_id)
  where private.food_is_plan_eligible(
    candidate.food_id,
    (select auth.uid())
  );
$$;

create or replace function private.ensure_meal_preference_food_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.food_is_plan_eligible(new.food_id, new.user_id) then
    raise exception using
      errcode = '23514',
      message = 'Meal preferences require complete trusted nutrition and confirmed safety data.';
  end if;

  return new;
end;
$$;

create or replace function private.ensure_plan_item_food_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_user_id uuid;
begin
  select plan.user_id
  into plan_user_id
  from public.plan_meals meal
  join public.plan_days day on day.id = meal.plan_day_id
  join public.plans plan on plan.id = day.plan_id
  where meal.id = new.plan_meal_id;

  if plan_user_id is null
    or not private.food_is_plan_eligible(new.food_id, plan_user_id)
  then
    raise exception using
      errcode = '23514',
      message = 'Plan items require complete trusted nutrition and confirmed safety data.';
  end if;

  return new;
end;
$$;

create or replace function public.create_confirmed_label_food(
  label_data jsonb,
  label_submission_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_food_id uuid := extensions.gen_random_uuid();
  new_source_id uuid;
  serving_nutrition_id uuid;
  per_100g_nutrition_id uuid;
  shared_food_id uuid;
  shared_source_id uuid;
  serving_weight numeric;
  conversion numeric;
  normalized_slug text;
  allergen_slug text;
  restriction_slug text;
  category_slug text;
  source_reference text;
  submission_status public.food_label_submission_status;
  nutrition_image_sha256 text;
  existing_private_food_id uuid;
  stored_label_data jsonb;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if jsonb_typeof(label_data) <> 'object'
    or not private.onboarding_draft_is_safe(label_data)
    or label_data ->> 'confirmedAccurate' <> 'true'
    or coalesce(char_length(btrim(label_data ->> 'brandName')), 0)
      not between 1 and 160
    or coalesce(char_length(btrim(label_data ->> 'productName')), 0)
      not between 1 and 240
    or coalesce(char_length(btrim(label_data ->> 'ingredientsText')), 0)
      not between 1 and 10000
    or coalesce(char_length(btrim(label_data ->> 'allergenStatement')), 0)
      not between 1 and 4000
    or jsonb_typeof(coalesce(label_data -> 'allergenSlugs', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(label_data -> 'restrictionSlugs', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(label_data -> 'categorySlugs', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(label_data -> 'categorySlugs', '[]'::jsonb)) < 1
  then
    raise exception using
      errcode = '22023',
      message = 'Complete and confirm the package label before using this product.';
  end if;

  serving_weight := (label_data ->> 'servingWeightGrams')::numeric;
  if serving_weight <= 0 or serving_weight > 10000
    or (label_data ->> 'calories')::numeric not between 0 and 10000
    or (label_data ->> 'proteinGrams')::numeric not between 0 and 10000
    or (label_data ->> 'carbohydrateGrams')::numeric not between 0 and 10000
    or (label_data ->> 'fatGrams')::numeric not between 0 and 10000
  then
    raise exception using
      errcode = '22023',
      message = 'The package nutrition values are outside supported bounds.';
  end if;

  if nullif(label_data ->> 'gtin', '') is not null
    and (label_data ->> 'gtin') !~ '^[0-9]{8,14}$'
  then
    raise exception using
      errcode = '22023',
      message = 'The barcode must contain 8 to 14 digits.';
  end if;

  select submission.status, submission.private_food_id, submission.label_data
  into submission_status, existing_private_food_id, stored_label_data
  from public.food_label_submissions submission
  where submission.id = label_submission_id
    and submission.user_id = current_user_id
  for update;

  if submission_status = 'submitted' and existing_private_food_id is not null then
    return existing_private_food_id;
  end if;

  if stored_label_data ->> 'confirmedAccurate' <> 'false'
    or (stored_label_data - 'confirmedAccurate')
      is distinct from (label_data - 'confirmedAccurate')
  then
    raise exception using
      errcode = '23514',
      message = 'The confirmation must match the photographed label transcription.';
  end if;

  select image.sha256
  into nutrition_image_sha256
  from public.food_label_images image
  join storage.objects object
    on object.bucket_id = 'food-labels'
    and object.name = image.object_path
  where image.submission_id = label_submission_id
    and image.user_id = current_user_id
    and image.image_kind = 'nutrition'
  order by image.created_at desc
  limit 1;

  if submission_status not in ('draft', 'needs_changes')
    or nutrition_image_sha256 is null
  then
    raise exception using
      errcode = '23514',
      message = 'An owned draft and nutrition-label image are required for confirmation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(label_data -> 'allergenSlugs', '[]'::jsonb)
    ) requested(slug)
    where not exists (
      select 1 from public.allergens allergen where allergen.slug = requested.slug
    )
  ) or exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(label_data -> 'restrictionSlugs', '[]'::jsonb)
    ) requested(slug)
    where not exists (
      select 1
      from public.dietary_restriction_types restriction
      where restriction.slug = requested.slug
    )
  ) or exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(label_data -> 'categorySlugs', '[]'::jsonb)
    ) requested(slug)
    where not exists (
      select 1
      from public.food_categories category
      where category.slug = requested.slug
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'One or more safety selections are not recognized.';
  end if;

  normalized_slug := trim(
    both '-' from regexp_replace(
      lower(
        btrim(label_data ->> 'brandName')
        || '-'
        || btrim(label_data ->> 'productName')
        || '-'
        || coalesce(nullif(btrim(label_data ->> 'variantName'), ''), 'label')
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
  normalized_slug := left(coalesce(nullif(normalized_slug, ''), 'label-food'), 80)
    || '-'
    || left(new_food_id::text, 8);
  source_reference := coalesce(
    nullif(btrim(label_data ->> 'sourceNote'), ''),
    'Package label transcribed and confirmed by the account owner.'
  );

  insert into public.foods (
    id,
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
    new_food_id,
    normalized_slug,
    btrim(label_data ->> 'brandName')
      || ' '
      || btrim(label_data ->> 'productName')
      || case
        when nullif(btrim(label_data ->> 'variantName'), '') is null then ''
        else ' — ' || btrim(label_data ->> 'variantName')
      end,
    'package',
    'User-confirmed package label',
    'private',
    current_user_id,
    'user_label',
    'branded_product',
    'active'
  );

  insert into public.food_products (
    food_id,
    brand_name,
    product_name,
    variant_name,
    gtin,
    package_description
  )
  values (
    new_food_id,
    btrim(label_data ->> 'brandName'),
    btrim(label_data ->> 'productName'),
    nullif(btrim(label_data ->> 'variantName'), ''),
    nullif(label_data ->> 'gtin', ''),
    nullif(btrim(label_data ->> 'packageDescription'), '')
  );

  insert into public.food_sources (
    food_id,
    provider,
    external_id,
    source_url,
    source_version,
    license_code,
    attribution_text,
    retrieved_at,
    payload_sha256
  )
  values (
    new_food_id,
    'user_label',
    current_user_id::text || ':' || new_food_id::text,
    null,
    'account-confirmed-v1',
    null,
    'Package label transcribed and confirmed by the account owner.',
    now(),
    nutrition_image_sha256
  )
  returning id into new_source_id;

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
    btrim(label_data ->> 'ingredientsText'),
    btrim(label_data ->> 'allergenStatement'),
    'user_confirmed',
    'user_confirmed',
    new_source_id
  );

  for category_slug in
    select jsonb_array_elements_text(label_data -> 'categorySlugs')
  loop
    insert into public.food_category_links (food_id, category_id)
    select new_food_id, category.id
    from public.food_categories category
    where category.slug = category_slug
    on conflict (food_id, category_id) do nothing;
  end loop;

  for allergen_slug in
    select jsonb_array_elements_text(
      coalesce(label_data -> 'allergenSlugs', '[]'::jsonb)
    )
  loop
    insert into public.food_allergens (food_id, allergen_id)
    select new_food_id, allergen.id
    from public.allergens allergen
    where allergen.slug = allergen_slug
    on conflict (food_id, allergen_id) do nothing;
  end loop;

  for restriction_slug in
    select jsonb_array_elements_text(
      coalesce(label_data -> 'restrictionSlugs', '[]'::jsonb)
    )
  loop
    insert into public.food_dietary_restrictions (food_id, restriction_id)
    select new_food_id, restriction.id
    from public.dietary_restriction_types restriction
    where restriction.slug = restriction_slug
    on conflict (food_id, restriction_id) do nothing;
  end loop;

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
    source_id
  )
  values (
    new_food_id,
    'label_serving',
    1,
    'serving',
    serving_weight,
    coalesce(
      nullif(btrim(label_data ->> 'servingDescription'), ''),
      '1 serving'
    ),
    (label_data ->> 'calories')::numeric,
    nullif(label_data ->> 'energyKilojoules', '')::numeric,
    (label_data ->> 'proteinGrams')::numeric,
    (label_data ->> 'carbohydrateGrams')::numeric,
    (label_data ->> 'fatGrams')::numeric,
    nullif(label_data ->> 'fiberGrams', '')::numeric,
    nullif(label_data ->> 'sodiumMilligrams', '')::numeric,
    nullif(label_data ->> 'saturatedFatGrams', '')::numeric,
    nullif(label_data ->> 'transFatGrams', '')::numeric,
    nullif(label_data ->> 'totalSugarsGrams', '')::numeric,
    nullif(label_data ->> 'addedSugarsGrams', '')::numeric,
    nullif(label_data ->> 'cholesterolMilligrams', '')::numeric,
    nullif(label_data ->> 'potassiumMilligrams', '')::numeric,
    nullif(label_data ->> 'calciumMilligrams', '')::numeric,
    nullif(label_data ->> 'ironMilligrams', '')::numeric,
    nullif(label_data ->> 'vitaminDMicrograms', '')::numeric,
    'User-confirmed package label',
    source_reference,
    'user_label',
    'account-confirmed-v1',
    new_source_id
  )
  returning id into serving_nutrition_id;

  conversion := 100 / serving_weight;
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
    source_id
  )
  values (
    new_food_id,
    'as_sold',
    100,
    'g',
    null,
    null,
    round((label_data ->> 'calories')::numeric * conversion, 3),
    round(nullif(label_data ->> 'energyKilojoules', '')::numeric * conversion, 3),
    round((label_data ->> 'proteinGrams')::numeric * conversion, 3),
    round((label_data ->> 'carbohydrateGrams')::numeric * conversion, 3),
    round((label_data ->> 'fatGrams')::numeric * conversion, 3),
    round(nullif(label_data ->> 'fiberGrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'sodiumMilligrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'saturatedFatGrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'transFatGrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'totalSugarsGrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'addedSugarsGrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'cholesterolMilligrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'potassiumMilligrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'calciumMilligrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'ironMilligrams', '')::numeric * conversion, 3),
    round(nullif(label_data ->> 'vitaminDMicrograms', '')::numeric * conversion, 3),
    'Calculated from user-confirmed package serving',
    source_reference,
    'user_label',
    'account-confirmed-v1',
    new_source_id
  )
  returning id into per_100g_nutrition_id;

  -- A barcode is the stable cross-client identity. Publish only the normalized
  -- transcription as a shared, pending-review catalog record; label photos
  -- remain in the submitting user's private storage path. Pending records are
  -- searchable and loggable but cannot enter a generated plan until reviewed.
  if nullif(label_data ->> 'gtin', '') is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('catalog-gtin:' || (label_data ->> 'gtin'), 0)
    );

    select product.food_id
    into shared_food_id
    from public.food_products product
    join public.foods food on food.id = product.food_id
    where product.gtin = label_data ->> 'gtin'
      and food.ownership_type = 'catalog'
    limit 1;

    if shared_food_id is null then
      shared_food_id := extensions.gen_random_uuid();

      insert into public.foods (
        id,
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
        shared_food_id,
        left(normalized_slug, 84)
          || '-shared-'
          || right(label_data ->> 'gtin', 8),
        btrim(label_data ->> 'brandName')
          || ' '
          || btrim(label_data ->> 'productName')
          || case
            when nullif(btrim(label_data ->> 'variantName'), '') is null then ''
            else ' — ' || btrim(label_data ->> 'variantName')
          end,
        'package',
        'Normalized account-confirmed package label; review pending',
        'catalog',
        null,
        'source_reported',
        'branded_product',
        'pending_review'
      );

      insert into public.food_products (
        food_id,
        brand_name,
        product_name,
        variant_name,
        gtin,
        package_description
      )
      values (
        shared_food_id,
        btrim(label_data ->> 'brandName'),
        btrim(label_data ->> 'productName'),
        nullif(btrim(label_data ->> 'variantName'), ''),
        label_data ->> 'gtin',
        nullif(btrim(label_data ->> 'packageDescription'), '')
      );

      insert into public.food_sources (
        food_id,
        provider,
        external_id,
        source_version,
        attribution_text,
        retrieved_at,
        payload_sha256
      )
      values (
        shared_food_id,
        'user_label',
        'shared-label:' || (label_data ->> 'gtin'),
        'normalized-label-submission-v1',
        'Normalized from an account-confirmed package label. The raw image remains private.',
        now(),
        nutrition_image_sha256
      )
      returning id into shared_source_id;

      insert into public.food_safety_metadata (
        food_id,
        ingredients_text,
        allergen_statement,
        allergen_data_status,
        restriction_data_status,
        source_id
      )
      values (
        shared_food_id,
        btrim(label_data ->> 'ingredientsText'),
        btrim(label_data ->> 'allergenStatement'),
        'source_reported',
        'source_reported',
        shared_source_id
      );

      insert into public.food_nutrition (
        food_id,
        measurement_basis,
        reference_quantity,
        reference_unit,
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
        source_id
      )
      values (
        shared_food_id,
        'as_sold',
        100,
        'g',
        round((label_data ->> 'calories')::numeric * conversion, 3),
        round(nullif(label_data ->> 'energyKilojoules', '')::numeric * conversion, 3),
        round((label_data ->> 'proteinGrams')::numeric * conversion, 3),
        round((label_data ->> 'carbohydrateGrams')::numeric * conversion, 3),
        round((label_data ->> 'fatGrams')::numeric * conversion, 3),
        round(nullif(label_data ->> 'fiberGrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'sodiumMilligrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'saturatedFatGrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'transFatGrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'totalSugarsGrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'addedSugarsGrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'cholesterolMilligrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'potassiumMilligrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'calciumMilligrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'ironMilligrams', '')::numeric * conversion, 3),
        round(nullif(label_data ->> 'vitaminDMicrograms', '')::numeric * conversion, 3),
        'Normalized account-confirmed package label',
        'Normalized from an account-confirmed package label; raw evidence remains private.',
        'source_reported',
        'normalized-label-submission-v1',
        shared_source_id
      );

      insert into public.food_allergens (food_id, allergen_id)
      select shared_food_id, mapping.allergen_id
      from public.food_allergens mapping
      where mapping.food_id = new_food_id
      on conflict (food_id, allergen_id) do nothing;

      insert into public.food_category_links (food_id, category_id)
      select shared_food_id, mapping.category_id
      from public.food_category_links mapping
      where mapping.food_id = new_food_id
      on conflict (food_id, category_id) do nothing;

      insert into public.food_dietary_restrictions (food_id, restriction_id)
      select shared_food_id, mapping.restriction_id
      from public.food_dietary_restrictions mapping
      where mapping.food_id = new_food_id
      on conflict (food_id, restriction_id) do nothing;
    end if;
  end if;

  update public.food_label_submissions
  set
    status = 'submitted',
    label_data = $1,
    private_food_id = new_food_id,
    published_food_id = shared_food_id,
    submitted_at = now(),
    updated_at = now()
  where id = label_submission_id
    and user_id = current_user_id;

  return new_food_id;
end;
$$;

create or replace function public.submit_food_label(
  target_submission_id uuid
)
returns public.food_label_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result public.food_label_submissions;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.food_label_submissions submission
    where submission.id = target_submission_id
      and submission.user_id = current_user_id
      and submission.status in ('draft', 'needs_changes')
  ) or not exists (
    select 1
    from public.food_label_images image
    join storage.objects object
      on object.bucket_id = 'food-labels'
      and object.name = image.object_path
    where image.submission_id = target_submission_id
      and image.user_id = current_user_id
      and image.image_kind = 'nutrition'
  ) then
    raise exception using
      errcode = '23514',
      message = 'A nutrition-label image is required before submission.';
  end if;

  update public.food_label_submissions
  set
    status = 'submitted',
    submitted_at = now(),
    updated_at = now()
  where id = target_submission_id
    and user_id = current_user_id
  returning * into result;

  return result;
end;
$$;

create trigger food_label_submissions_set_updated_at
before update on public.food_label_submissions
for each row execute function private.set_updated_at();

create or replace function private.ensure_food_label_image_editable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.food_label_submission_status;
  target_submission_id uuid;
  target_user_id uuid;
begin
  if tg_op = 'DELETE' then
    target_submission_id := old.submission_id;
    target_user_id := old.user_id;
  else
    target_submission_id := new.submission_id;
    target_user_id := new.user_id;
  end if;

  select submission.status
  into current_status
  from public.food_label_submissions submission
  where submission.id = target_submission_id
    and submission.user_id = target_user_id
  for update;

  if current_status not in ('draft', 'needs_changes') then
    raise exception using
      errcode = '23514',
      message = 'Submitted label evidence is immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger food_label_images_require_editable_submission
before insert or update or delete on public.food_label_images
for each row execute function private.ensure_food_label_image_editable();

alter table public.food_label_submissions enable row level security;
alter table public.food_label_images enable row level security;

create policy "food_label_submissions_select_own"
on public.food_label_submissions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "food_label_submissions_insert_own_draft"
on public.food_label_submissions for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'draft'
  and private_food_id is null
  and published_food_id is null
  and submitted_at is null
  and reviewed_at is null
);

create policy "food_label_submissions_delete_own_unreviewed"
on public.food_label_submissions for delete to authenticated
using (
  (select auth.uid()) = user_id
  and status in ('draft', 'needs_changes', 'rejected')
);

create policy "food_label_images_select_own"
on public.food_label_images for select to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'food-labels',
  'food-labels',
  false,
  8388608,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "food_label_objects_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'food-labels'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

revoke all on function private.owns_food_label_submission(uuid)
  from public, anon;
grant execute on function private.owns_food_label_submission(uuid)
  to authenticated, service_role;

revoke all on public.food_label_submissions from anon, authenticated;
revoke all on public.food_label_images from anon, authenticated;
grant select, insert, delete on public.food_label_submissions to authenticated;
grant select on public.food_label_images to authenticated;

-- All nutrition-trust mutations now pass through server-only provider caching
-- or the atomic, photo-bound label confirmation RPC above.
revoke insert, update, delete on public.foods from authenticated;
revoke insert, update, delete on public.food_products from authenticated;
revoke insert, update, delete on public.food_sources from authenticated;
revoke insert, update, delete on public.food_nutrition from authenticated;
revoke insert, update, delete on public.food_nutrient_amounts from authenticated;
revoke insert, update, delete on public.food_safety_metadata from authenticated;
revoke insert, update, delete on public.food_category_links from authenticated;
revoke insert, update, delete on public.food_allergens from authenticated;
revoke insert, update, delete on public.food_dietary_restrictions from authenticated;

revoke all on function public.plan_eligible_food_ids(uuid[])
  from public, anon;
grant execute on function public.plan_eligible_food_ids(uuid[])
  to authenticated, service_role;

revoke all on function public.create_confirmed_label_food(jsonb, uuid)
  from public, anon;
grant execute on function public.create_confirmed_label_food(jsonb, uuid)
  to authenticated;

revoke all on function public.submit_food_label(uuid)
  from public, anon, authenticated;
grant execute on function public.submit_food_label(uuid)
  to service_role;

comment on table public.food_label_submissions is
  'Owner-private product-label submissions. No submission becomes globally trusted without a separate review.';
comment on function public.create_confirmed_label_food(jsonb, uuid) is
  'Atomically creates an owner-scoped user-label product with serving and deterministic per-100g nutrition after explicit confirmation.';

commit;
