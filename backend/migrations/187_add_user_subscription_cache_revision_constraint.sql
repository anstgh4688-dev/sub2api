-- Install the check quickly; validation runs in a separate transaction.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_subscriptions_cache_revision_not_null_check'
          AND conrelid = 'public.user_subscriptions'::regclass
    ) THEN
        ALTER TABLE public.user_subscriptions
            ADD CONSTRAINT user_subscriptions_cache_revision_not_null_check
            CHECK (cache_revision IS NOT NULL) NOT VALID;
    END IF;
END
$$;
