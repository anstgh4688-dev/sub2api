-- VALIDATE avoids holding an access-exclusive lock during the table scan.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_subscriptions_cache_revision_not_null_check'
          AND conrelid = 'public.user_subscriptions'::regclass
          AND NOT convalidated
    ) THEN
        ALTER TABLE public.user_subscriptions
            VALIDATE CONSTRAINT user_subscriptions_cache_revision_not_null_check;
    END IF;
END
$$;

ALTER TABLE public.user_subscriptions
    ALTER COLUMN cache_revision SET NOT NULL;

ALTER TABLE public.user_subscriptions
    DROP CONSTRAINT IF EXISTS user_subscriptions_cache_revision_not_null_check;
