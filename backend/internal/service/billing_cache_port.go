package service

import (
	"time"
)

// SubscriptionCacheData is an exact post-commit subscription snapshot.
// Version is the database-backed monotonic cache_revision, not a timestamp.
type SubscriptionCacheData struct {
	Status               string
	ExpiresAt            time.Time
	DailyUsage           float64
	WeeklyUsage          float64
	MonthlyUsage         float64
	DailyLimitOverride   *float64
	WeeklyLimitOverride  *float64
	MonthlyLimitOverride *float64
	Version              int64
}
