-- Per-subscription quota overrides. NULL inherits the group quota; zero means unlimited.
ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS daily_limit_override_usd DECIMAL(20,10),
    ADD COLUMN IF NOT EXISTS weekly_limit_override_usd DECIMAL(20,10),
    ADD COLUMN IF NOT EXISTS monthly_limit_override_usd DECIMAL(20,10);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_subscriptions_limit_overrides_non_negative'
          AND conrelid = 'public.user_subscriptions'::regclass
    ) THEN
        ALTER TABLE user_subscriptions
            ADD CONSTRAINT user_subscriptions_limit_overrides_non_negative
            CHECK (
                (daily_limit_override_usd IS NULL OR daily_limit_override_usd >= 0)
                AND (weekly_limit_override_usd IS NULL OR weekly_limit_override_usd >= 0)
                AND (monthly_limit_override_usd IS NULL OR monthly_limit_override_usd >= 0)
            );
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.assign_user_subscription_cache_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.cache_revision := nextval('public.user_subscription_cache_revision_seq'::regclass);
        RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
       OR OLD.daily_usage_usd IS DISTINCT FROM NEW.daily_usage_usd
       OR OLD.weekly_usage_usd IS DISTINCT FROM NEW.weekly_usage_usd
       OR OLD.monthly_usage_usd IS DISTINCT FROM NEW.monthly_usage_usd
       OR OLD.daily_limit_override_usd IS DISTINCT FROM NEW.daily_limit_override_usd
       OR OLD.weekly_limit_override_usd IS DISTINCT FROM NEW.weekly_limit_override_usd
       OR OLD.monthly_limit_override_usd IS DISTINCT FROM NEW.monthly_limit_override_usd
       OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
        NEW.cache_revision := nextval('public.user_subscription_cache_revision_seq'::regclass);
    ELSIF (OLD.cache_revision IS NULL OR OLD.cache_revision <= 0)
          AND NEW.cache_revision > 0 THEN
        RETURN NEW;
    ELSE
        NEW.cache_revision := OLD.cache_revision;
    END IF;

    RETURN NEW;
END;
$$;
