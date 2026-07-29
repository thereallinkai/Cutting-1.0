-- External databases and uploaded labels may contain useful source-reported
-- values before this application has reviewed them. Keep those values visible
-- without presenting them as verified or making them eligible for plans.
alter type public.verification_status
  add value if not exists 'source_reported' after 'user_label';
