package migrations

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserSubscriptionCacheRevisionMigrationDefinesDatabaseIssuedOrdering(t *testing.T) {
	infrastructure, err := FS.ReadFile("185_user_subscription_cache_revision.sql")
	require.NoError(t, err)
	backfill, err := FS.ReadFile("186_backfill_user_subscription_cache_revision.sql")
	require.NoError(t, err)
	constraint, err := FS.ReadFile("187_add_user_subscription_cache_revision_constraint.sql")
	require.NoError(t, err)
	enforcement, err := FS.ReadFile("188_enforce_user_subscription_cache_revision_not_null.sql")
	require.NoError(t, err)

	sql := string(infrastructure)
	require.Contains(t, sql, "CREATE SEQUENCE IF NOT EXISTS public.user_subscription_cache_revision_seq")
	require.Contains(t, sql, "ADD COLUMN IF NOT EXISTS cache_revision BIGINT")
	require.Contains(t, sql, "BEFORE INSERT OR UPDATE ON public.user_subscriptions")
	require.Contains(t, sql, "NEW.cache_revision := nextval('public.user_subscription_cache_revision_seq'::regclass)")
	require.Contains(t, sql, "OLD.daily_usage_usd IS DISTINCT FROM NEW.daily_usage_usd")
	require.Contains(t, sql, "OLD.weekly_usage_usd IS DISTINCT FROM NEW.weekly_usage_usd")
	require.Contains(t, sql, "OLD.monthly_usage_usd IS DISTINCT FROM NEW.monthly_usage_usd")
	require.Contains(t, sql, "OLD.status IS DISTINCT FROM NEW.status")
	require.Contains(t, sql, "OLD.expires_at IS DISTINCT FROM NEW.expires_at")
	require.Contains(t, sql, "OLD.deleted_at IS DISTINCT FROM NEW.deleted_at")
	require.NotContains(t, sql, "IF NEW.cache_revision > OLD.cache_revision")
	require.NotContains(t, sql, "setval(")
	require.NotContains(t, sql, "MAX(cache_revision)")

	backfillSQL := string(backfill)
	require.Contains(t, backfillSQL, "SET cache_revision = nextval('public.user_subscription_cache_revision_seq'::regclass)")
	require.NotContains(t, backfillSQL, "setval(")
	require.NotContains(t, backfillSQL, "MAX(cache_revision)")
	require.Contains(t, string(constraint), "CHECK (cache_revision IS NOT NULL) NOT VALID")
	require.Contains(t, string(enforcement), "VALIDATE CONSTRAINT user_subscriptions_cache_revision_not_null_check")
	require.Contains(t, string(enforcement), "ALTER COLUMN cache_revision SET NOT NULL")
}
