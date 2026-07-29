begin;

-- The normalizer is an implementation detail. Keeping it out of the exposed
-- public schema prevents clients and generated API types from treating the
-- unchecked entry point as part of the supported contract.
alter function public.save_plan_version_normalize_unchecked(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) set schema private;

revoke all on function private.save_plan_version_normalize_unchecked(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
) from public, anon, authenticated, service_role;

-- Rejected catalog records are never client-visible. Retired records remain
-- readable for historical plans and exports, while ordinary catalog search
-- continues to decide whether to present them in new choices.
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
      from public.foods food
      where food.id = target_food_id
        and (
          (
            food.ownership_type = 'catalog'
            and food.catalog_status <> 'rejected'
          )
          or (
            food.ownership_type = 'private'
            and food.owner_user_id = (select auth.uid())
          )
        )
    );
$$;

create or replace function private.food_basis_is_plan_eligible(
  target_food_id uuid,
  target_user_id uuid,
  target_measurement_basis public.measurement_basis
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and target_measurement_basis is not null
    and (
      target_user_id = (select auth.uid())
      or (select auth.role()) = 'service_role'
    )
    and exists (
      select 1
      from public.foods food
      join public.food_nutrition nutrition
        on nutrition.food_id = food.id
       and nutrition.measurement_basis = target_measurement_basis
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

revoke all on function private.food_basis_is_plan_eligible(
  uuid,
  uuid,
  public.measurement_basis
) from public, anon;
grant execute on function private.food_basis_is_plan_eligible(
  uuid,
  uuid,
  public.measurement_basis
) to authenticated, service_role;

-- A source record is meaningful only for the food it describes. Plain
-- source_id foreign keys cannot prevent a nutrition or safety row from
-- pointing at another food's otherwise-valid source.
create function private.ensure_food_source_matches_food()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_id is not null
    and not exists (
      select 1
      from public.food_sources source
      where source.id = new.source_id
        and source.food_id = new.food_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Food provenance source must belong to the same food.';
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_food_source_matches_food()
  from public, anon, authenticated;

create trigger food_nutrition_require_matching_source
before insert or update of food_id, source_id on public.food_nutrition
for each row execute function private.ensure_food_source_matches_food();

create trigger food_safety_metadata_require_matching_source
before insert or update of food_id, source_id on public.food_safety_metadata
for each row execute function private.ensure_food_source_matches_food();

-- Removing the final optional-snack item also clears the derived completed
-- state. Locking the slot makes the item deletion and state transition atomic
-- with concurrent add_daily_meal_item calls.
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
  target_checkin_id uuid;
  target_meal_type public.meal_type;
  deleted_item_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  select item.meal_checkin_id, checkin.meal_type
  into target_checkin_id, target_meal_type
  from public.daily_meal_items item
  join public.daily_meal_checkins checkin
    on checkin.id = item.meal_checkin_id
   and checkin.user_id = item.user_id
  where item.id = target_item_id
    and item.user_id = current_user_id
  for update of checkin, item;

  if not found then
    return null;
  end if;

  delete from public.daily_meal_items item
  where item.id = target_item_id
    and item.user_id = current_user_id
  returning item.id into deleted_item_id;

  if target_meal_type in ('morning_snack', 'afternoon_snack', 'evening_snack')
    and not exists (
      select 1
      from public.daily_meal_items item
      where item.meal_checkin_id = target_checkin_id
    )
  then
    update public.daily_meal_checkins checkin
    set
      status = 'not_marked',
      skip_reason = null
    where checkin.id = target_checkin_id
      and checkin.user_id = current_user_id;
  end if;

  return deleted_item_id;
end;
$$;

comment on function public.delete_daily_meal_item(uuid) is
  'Atomically deletes one owned meal item and clears an empty optional-snack slot to not marked.';

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
    or not private.food_basis_is_plan_eligible(
      new.food_id,
      plan_user_id,
      new.measurement_basis
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Plan items require complete trusted nutrition and confirmed safety data for the selected measurement basis.';
  end if;

  return new;
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
  day_record jsonb;
  meal_record jsonb;
  item_record jsonb;
  meal_types text[];
  item_food_id uuid;
  item_measurement_basis public.measurement_basis;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Plan persistence is restricted to the trusted server boundary.';
  end if;

  if jsonb_typeof(plan_output) is distinct from 'object'
    or jsonb_typeof(plan_output -> 'days') is distinct from 'array'
    or jsonb_array_length(plan_output -> 'days') <> 7
  then
    raise exception using
      errcode = '22023',
      message = 'The validated plan payload must contain exactly seven days.';
  end if;

  for day_record in
    select value from jsonb_array_elements(plan_output -> 'days')
  loop
    if jsonb_typeof(day_record -> 'meals') is distinct from 'array'
      or jsonb_array_length(day_record -> 'meals') <> 3
    then
      raise exception using
        errcode = '22023',
        message = 'Every plan day must contain breakfast, lunch, and dinner.';
    end if;

    select array_agg(distinct meal ->> 'mealType' order by meal ->> 'mealType')
    into meal_types
    from jsonb_array_elements(day_record -> 'meals') meal;

    if meal_types is distinct from array['breakfast', 'dinner', 'lunch']::text[]
    then
      raise exception using
        errcode = '23514',
        message = 'Every plan day must contain breakfast, lunch, and dinner exactly once.';
    end if;

    for meal_record in
      select value from jsonb_array_elements(day_record -> 'meals')
    loop
      if jsonb_typeof(meal_record -> 'items') is distinct from 'array'
        or jsonb_array_length(meal_record -> 'items') < 1
      then
        raise exception using
          errcode = '22023',
          message = 'Every primary meal must contain at least one item.';
      end if;

      for item_record in
        select value from jsonb_array_elements(meal_record -> 'items')
      loop
        begin
          item_food_id := (item_record ->> 'foodId')::uuid;
          item_measurement_basis :=
            (item_record ->> 'measurementBasis')::public.measurement_basis;
        exception
          when invalid_text_representation then
            raise exception using
              errcode = '22023',
              message = 'A plan item contains an invalid food ID or measurement basis.';
        end;

        if not private.food_basis_is_plan_eligible(
          item_food_id,
          target_user_id,
          item_measurement_basis
        ) then
          raise exception using
            errcode = '23514',
            message = 'A plan item is not eligible for deterministic planning in the selected measurement basis.';
        end if;
      end loop;
    end loop;
  end loop;

  return private.save_plan_version_normalize_unchecked(
    target_user_id,
    target_goal_id,
    plan_provider,
    plan_model,
    plan_prompt_version,
    plan_input_snapshot,
    plan_output,
    generation_request_id
  );
end;
$$;

-- Keep the full label normalizer private and put the explicit review contract
-- in the only authenticated entry point.
alter function public.create_confirmed_label_food(jsonb, uuid)
  rename to create_confirmed_label_food_unchecked;
alter function public.create_confirmed_label_food_unchecked(jsonb, uuid)
  set schema private;

revoke all on function private.create_confirmed_label_food_unchecked(jsonb, uuid)
  from public, anon, authenticated, service_role;

create function private.food_label_allergens_are_consistent(label_data jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  statement_text text;
  selected_slugs text[];
begin
  if jsonb_typeof(label_data) is distinct from 'object'
    or jsonb_typeof(coalesce(label_data -> 'allergenSlugs', '[]'::jsonb))
      is distinct from 'array'
  then
    return false;
  end if;

  statement_text := lower(coalesce(label_data ->> 'allergenStatement', ''));
  statement_text := regexp_replace(
    statement_text,
    '(^|[^[:alnum:]])(milk|dairy|whey|casein|caseinate|lactalbumin|eggs?|albumen|ovalbumin|fish|anchovy|anchovies|cod|salmon|tuna|shellfish|shrimp|prawn|crab|lobster|crayfish|tree[ -]?nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil[ -]?nuts?|peanuts?|wheat|spelt|semolina|durum|soy|soya|sesame)[ -]free([^[:alnum:]]|$)',
    ' ',
    'g'
  );

  select coalesce(array_agg(selected.slug), '{}'::text[])
  into selected_slugs
  from jsonb_array_elements_text(
    coalesce(label_data -> 'allergenSlugs', '[]'::jsonb)
  ) as selected(slug);

  return not (
    (
      statement_text ~
        '(^|[^[:alnum:]])(milk|dairy|whey|casein|caseinate|lactalbumin)([^[:alnum:]]|$)'
      and not ('milk' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])(eggs?|albumen|ovalbumin)([^[:alnum:]]|$)'
      and not ('egg' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])(fish|anchovy|anchovies|cod|salmon|tuna)([^[:alnum:]]|$)'
      and not ('fish' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])(shellfish|shrimp|prawn|crab|lobster|crayfish)([^[:alnum:]]|$)'
      and not ('shellfish' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])(tree[ -]?nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil[ -]?nuts?)([^[:alnum:]]|$)'
      and not ('tree-nuts' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])peanuts?([^[:alnum:]]|$)'
      and not ('peanuts' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])(wheat|spelt|semolina|durum)([^[:alnum:]]|$)'
      and not ('wheat' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])(soy|soya)([^[:alnum:]]|$)'
      and not ('soy' = any(selected_slugs))
    )
    or (
      statement_text ~
        '(^|[^[:alnum:]])sesame([^[:alnum:]]|$)'
      and not ('sesame' = any(selected_slugs))
    )
  );
end;
$$;

revoke all on function private.food_label_allergens_are_consistent(jsonb)
  from public, anon, authenticated;

create function public.create_confirmed_label_food(
  label_data jsonb,
  label_submission_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if jsonb_typeof(label_data) is distinct from 'object'
    or jsonb_typeof(label_data -> 'confirmedAccurate') is distinct from 'boolean'
    or (label_data -> 'confirmedAccurate') is distinct from 'true'::jsonb
    or jsonb_typeof(label_data -> 'allergensReviewed') is distinct from 'boolean'
    or (label_data -> 'allergensReviewed') is distinct from 'true'::jsonb
    or jsonb_typeof(label_data -> 'restrictionsReviewed') is distinct from 'boolean'
    or (label_data -> 'restrictionsReviewed') is distinct from 'true'::jsonb
    or nullif(btrim(coalesce(label_data ->> 'sourceNote', '')), '') is not null
  then
    raise exception using
      errcode = '23514',
      message = 'Confirm the nutrition, allergen, and dietary-restriction review before using this label.';
  end if;

  if not private.food_label_allergens_are_consistent(label_data) then
    raise exception using
      errcode = '23514',
      message = 'Every allergen named in the package statement must be selected before confirmation.';
  end if;

  return private.create_confirmed_label_food_unchecked(
    label_data,
    label_submission_id
  );
end;
$$;

revoke all on function public.create_confirmed_label_food(jsonb, uuid)
  from public, anon;
grant execute on function public.create_confirmed_label_food(jsonb, uuid)
  to authenticated;

comment on function public.create_confirmed_label_food(jsonb, uuid) is
  'Validates explicit nutrition, allergen, and restriction review before atomically creating an owner-scoped label food.';

-- Existing normalized shared-label rows must not retain an owner's optional
-- free-text source note. Shared provenance uses a fixed nonpersonal statement.
update public.food_nutrition nutrition
set
  source_reference =
    'Normalized from an account-confirmed package label; raw evidence remains private.',
  updated_at = now()
from public.foods food
join public.food_sources source on source.food_id = food.id
where nutrition.food_id = food.id
  and nutrition.source_id = source.id
  and food.ownership_type = 'catalog'
  and food.catalog_status = 'pending_review'
  and source.provider = 'user_label'
  and source.external_id like 'shared-label:%';

-- One current evidence image per kind prevents concurrent replacement races.
-- Older duplicate metadata is removed deterministically; storage-object cleanup
-- remains a trusted server responsibility.
drop trigger if exists food_label_images_require_editable_submission
  on public.food_label_images;

with ranked_images as (
  select
    image.id,
    row_number() over (
      partition by image.submission_id, image.image_kind
      order by image.created_at desc, image.id desc
    ) as row_number
  from public.food_label_images image
)
delete from public.food_label_images image
using ranked_images ranked
where image.id = ranked.id
  and ranked.row_number > 1;

create trigger food_label_images_require_editable_submission
before insert or update or delete on public.food_label_images
for each row execute function private.ensure_food_label_image_editable();

create unique index food_label_images_submission_kind_unique_idx
  on public.food_label_images (submission_id, image_kind);

-- Direct deletion cannot coordinate database metadata with private object
-- storage. Keep deletion behind a future trusted-server cleanup operation.
drop policy if exists "food_label_submissions_delete_own_unreviewed"
  on public.food_label_submissions;
revoke delete on public.food_label_submissions from authenticated;

create table private.food_label_upload_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  image_kind public.food_label_image_kind not null,
  attempted_at timestamptz not null default now(),
  foreign key (submission_id, user_id)
    references public.food_label_submissions (id, user_id)
    on delete cascade
);

create index food_label_upload_attempts_user_time_idx
  on private.food_label_upload_attempts (user_id, attempted_at desc);

revoke all on private.food_label_upload_attempts
  from public, anon, authenticated, service_role;

create function public.reserve_food_label_upload(
  target_user_id uuid,
  target_submission_id uuid,
  target_image_kind public.food_label_image_kind
)
returns table (
  allowed boolean,
  rate_limited boolean,
  existing_image_id uuid,
  existing_object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_image_id uuid;
  current_object_path text;
  current_submission_status public.food_label_submission_status;
begin
  if (select auth.role()) is distinct from 'service_role'
    or target_user_id is null
    or target_submission_id is null
    or target_image_kind is null
  then
    raise exception using
      errcode = '42501',
      message = 'Label-upload reservation is restricted to the trusted server.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('food-label-upload:' || target_user_id::text, 0)
  );

  select submission.status
  into current_submission_status
  from public.food_label_submissions submission
  where submission.id = target_submission_id
    and submission.user_id = target_user_id
  for update;

  if current_submission_status is null
    or current_submission_status not in ('draft', 'needs_changes')
  then
    raise exception using
      errcode = '23514',
      message = 'The label submission is not editable by this account.';
  end if;

  select image.id, image.object_path
  into current_image_id, current_object_path
  from public.food_label_images image
  where image.submission_id = target_submission_id
    and image.user_id = target_user_id
    and image.image_kind = target_image_kind
  for update;

  if (
    select count(*)
    from private.food_label_upload_attempts attempt
    where attempt.user_id = target_user_id
      and attempt.attempted_at >= now() - interval '24 hours'
  ) >= 20 then
    return query
    select false, true, current_image_id, current_object_path;
    return;
  end if;

  insert into private.food_label_upload_attempts (
    user_id,
    submission_id,
    image_kind
  )
  values (
    target_user_id,
    target_submission_id,
    target_image_kind
  );

  return query
  select true, false, current_image_id, current_object_path;
end;
$$;

revoke all on function public.reserve_food_label_upload(
  uuid,
  uuid,
  public.food_label_image_kind
) from public, anon, authenticated;
grant execute on function public.reserve_food_label_upload(
  uuid,
  uuid,
  public.food_label_image_kind
) to service_role;

create function public.reserve_plan_generation(
  target_user_id uuid,
  request_idempotency_key text,
  request_provider text,
  request_model text,
  request_prompt_version text
)
returns table (
  result_state text,
  request_id uuid,
  request_status public.ai_request_status,
  plan_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_request public.ai_generation_requests;
  created_request public.ai_generation_requests;
  normalized_idempotency_key text := btrim(request_idempotency_key);
  normalized_provider text := btrim(request_provider);
  normalized_model text := btrim(request_model);
  normalized_prompt_version text := btrim(request_prompt_version);
begin
  if (select auth.role()) is distinct from 'service_role'
    or target_user_id is null
  then
    raise exception using
      errcode = '42501',
      message = 'Plan-generation reservation is restricted to the trusted server.';
  end if;

  if coalesce(char_length(normalized_idempotency_key), 0) not between 8 and 200
    or coalesce(char_length(normalized_provider), 0) not between 1 and 80
    or coalesce(char_length(normalized_model), 0) not between 1 and 160
    or coalesce(char_length(normalized_prompt_version), 0) not between 1 and 80
  then
    raise exception using
      errcode = '22023',
      message = 'Plan-generation reservation metadata is invalid.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('plan-generation:' || target_user_id::text, 0)
  );

  select request.*
  into existing_request
  from public.ai_generation_requests request
  where request.user_id = target_user_id
    and request.idempotency_key = normalized_idempotency_key
  for update;

  if found then
    if existing_request.status in ('pending', 'processing')
      and existing_request.created_at < now() - interval '5 minutes'
    then
      update public.ai_generation_requests request
      set
        status = 'failed',
        completed_at = now(),
        sanitized_error_code = 'stale_reservation_timeout'
      where request.id = existing_request.id
        and request.user_id = target_user_id
      returning request.* into existing_request;
    end if;

    return query
    select
      'replayed'::text,
      existing_request.id,
      existing_request.status,
      existing_request.plan_id;
    return;
  end if;

  if (
    select count(*)
    from public.ai_generation_requests request
    where request.user_id = target_user_id
      and request.created_at >= now() - interval '10 minutes'
  ) >= 3 then
    return query
    select
      'rate_limited'::text,
      null::uuid,
      null::public.ai_request_status,
      null::uuid;
    return;
  end if;

  insert into public.ai_generation_requests (
    user_id,
    idempotency_key,
    status,
    provider,
    model,
    prompt_version
  )
  values (
    target_user_id,
    normalized_idempotency_key,
    'processing',
    normalized_provider,
    normalized_model,
    normalized_prompt_version
  )
  returning * into created_request;

  return query
  select
    'reserved'::text,
    created_request.id,
    created_request.status,
    created_request.plan_id;
end;
$$;

revoke all on function public.reserve_plan_generation(
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.reserve_plan_generation(
  uuid,
  text,
  text,
  text,
  text
) to service_role;

-- A same-GTIN match under another provider requires explicit review. The cache
-- must never report success after silently discarding newly fetched facts.
create or replace function private.reject_cross_source_external_gtin_merge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider in ('usda_fdc', 'open_food_facts')
    and exists (
      select 1
      from public.food_products product
      join public.foods food on food.id = product.food_id
      where product.food_id = new.food_id
        and product.gtin is not null
        and food.ownership_type = 'catalog'
        and (
          exists (
            select 1
            from public.food_sources existing_source
            where existing_source.food_id = new.food_id
              and (
                existing_source.provider <> new.provider
                or existing_source.external_id <> new.external_id
              )
          )
          or exists (
            select 1
            from public.food_nutrition nutrition
            where nutrition.food_id = new.food_id
          )
        )
    )
  then
    raise exception using
      errcode = '23505',
      message = 'A catalog product with this GTIN already has another source; explicit review is required before merging.';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_cross_source_external_gtin_merge()
  from public, anon, authenticated;

create trigger food_sources_reject_cross_source_external_gtin_merge
before insert or update of food_id, provider, external_id
on public.food_sources
for each row execute function private.reject_cross_source_external_gtin_merge();

comment on function public.reserve_plan_generation(
  uuid,
  text,
  text,
  text,
  text
) is
  'Atomically replays or reserves one service-role plan-generation request under a per-user rate-limit lock.';
comment on function public.reserve_food_label_upload(
  uuid,
  uuid,
  public.food_label_image_kind
) is
  'Atomically reserves one trusted-server label-image attempt and returns the current image to replace.';

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
    '20260729010000_database_release_hardening';
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
