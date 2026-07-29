-- Account-backed completion state for the optional, replayable product tour.

alter table public.profiles
  add column product_tour_completed_version smallint not null default 0
    check (product_tour_completed_version >= 0),
  add column product_tour_completed_at timestamptz;

comment on column public.profiles.product_tour_completed_version is
  'Highest optional product-tour version the account has completed or dismissed.';

comment on column public.profiles.product_tour_completed_at is
  'When the current stored product-tour version was completed or dismissed.';
