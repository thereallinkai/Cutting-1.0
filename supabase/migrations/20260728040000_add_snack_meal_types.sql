-- Add optional snack positions without changing the existing three-meal plan
-- contract. Keep these enum additions in their own migration so PostgreSQL can
-- commit them before the values are referenced by later schema changes.

alter type public.meal_type
  add value if not exists 'morning_snack' after 'breakfast';

alter type public.meal_type
  add value if not exists 'afternoon_snack' after 'lunch';

alter type public.meal_type
  add value if not exists 'evening_snack' after 'dinner';
