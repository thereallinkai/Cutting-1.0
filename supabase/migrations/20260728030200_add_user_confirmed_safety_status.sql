-- A user may transcribe and explicitly confirm their own complete package
-- label. This is distinct from application review and remains owner-scoped.
alter type public.food_safety_data_status
  add value if not exists 'user_confirmed' after 'source_reported';
