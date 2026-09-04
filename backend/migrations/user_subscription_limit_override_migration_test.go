package migrations

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserSubscriptionLimitOverrideMigrationKeepsLimitsRevisioned(t *testing.T) {
	content, err := FS.ReadFile("231_user_subscription_limit_overrides.sql")
	require.NoError(t, err)

	sql := string(content)
	require.Contains(t, sql, "ADD COLUMN IF NOT EXISTS daily_limit_override_usd")
	require.Contains(t, sql, "ADD COLUMN IF NOT EXISTS weekly_limit_override_usd")
	require.Contains(t, sql, "ADD COLUMN IF NOT EXISTS monthly_limit_override_usd")
	require.Contains(t, sql, "user_subscriptions_limit_overrides_non_negative")
	require.Contains(t, sql, "OLD.daily_limit_override_usd IS DISTINCT FROM NEW.daily_limit_override_usd")
	require.Contains(t, sql, "OLD.weekly_limit_override_usd IS DISTINCT FROM NEW.weekly_limit_override_usd")
	require.Contains(t, sql, "OLD.monthly_limit_override_usd IS DISTINCT FROM NEW.monthly_limit_override_usd")
}
