-- Backfill without holding the ADD COLUMN access-exclusive lock.
UPDATE public.user_subscriptions
SET cache_revision = nextval('public.user_subscription_cache_revision_seq'::regclass)
WHERE cache_revision IS NULL OR cache_revision <= 0;
