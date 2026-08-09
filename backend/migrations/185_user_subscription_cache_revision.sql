-- Install revision infrastructure before the separate online backfill.
CREATE SEQUENCE IF NOT EXISTS public.user_subscription_cache_revision_seq
    AS BIGINT
    MINVALUE 1
    START WITH 1;

ALTER TABLE public.user_subscriptions
    ADD COLUMN IF NOT EXISTS cache_revision BIGINT;

ALTER TABLE public.user_subscriptions
    ALTER COLUMN cache_revision SET DEFAULT 0;

ALTER SEQUENCE public.user_subscription_cache_revision_seq
    OWNED BY public.user_subscriptions.cache_revision;

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
       OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
        NEW.cache_revision := nextval('public.user_subscription_cache_revision_seq'::regclass);
    ELSIF (OLD.cache_revision IS NULL OR OLD.cache_revision <= 0)
          AND NEW.cache_revision > 0 THEN
        -- The online backfill reserves revisions from the same sequence.
        RETURN NEW;
    ELSE
        NEW.cache_revision := OLD.cache_revision;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_subscriptions_cache_revision ON public.user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_cache_revision
BEFORE INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.assign_user_subscription_cache_revision();

COMMENT ON COLUMN public.user_subscriptions.cache_revision IS
    'Global monotonic revision for subscription cache snapshots';
