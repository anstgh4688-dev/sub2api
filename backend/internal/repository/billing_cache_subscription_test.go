//go:build unit

package repository

import (
	"context"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestSetSubscriptionCache_RejectsOlderSnapshot(t *testing.T) {
	cache, _ := newMiniRedisCache(t)
	ctx := context.Background()
	userID := int64(14)
	groupID := int64(24)
	expiresAt := time.Now().Add(time.Hour)

	resetSnapshot := &service.SubscriptionCacheData{
		Status:       service.SubscriptionStatusActive,
		ExpiresAt:    expiresAt,
		DailyUsage:   0,
		WeeklyUsage:  13,
		MonthlyUsage: 33,
		Version:      2,
	}
	delayedOldSnapshot := &service.SubscriptionCacheData{
		Status:       service.SubscriptionStatusActive,
		ExpiresAt:    expiresAt,
		DailyUsage:   5,
		WeeklyUsage:  13,
		MonthlyUsage: 33,
		Version:      1,
	}

	require.NoError(t, cache.SetSubscriptionCache(ctx, userID, groupID, resetSnapshot))
	require.NoError(t, cache.SetSubscriptionCache(ctx, userID, groupID, delayedOldSnapshot))

	got, err := cache.GetSubscriptionCache(ctx, userID, groupID)
	require.NoError(t, err)
	require.Equal(t, resetSnapshot.Status, got.Status)
	require.Equal(t, resetSnapshot.ExpiresAt.Unix(), got.ExpiresAt.Unix())
	require.InDelta(t, resetSnapshot.DailyUsage, got.DailyUsage, 1e-9)
	require.InDelta(t, resetSnapshot.WeeklyUsage, got.WeeklyUsage, 1e-9)
	require.InDelta(t, resetSnapshot.MonthlyUsage, got.MonthlyUsage, 1e-9)
	require.Equal(t, resetSnapshot.Version, got.Version)
}

func TestSetSubscriptionCache_ExpiredSnapshotRejectsDelayedActiveSnapshot(t *testing.T) {
	cache, _ := newMiniRedisCache(t)
	ctx := context.Background()
	userID := int64(16)
	groupID := int64(26)

	expiredSnapshot := &service.SubscriptionCacheData{
		Status:    service.SubscriptionStatusExpired,
		ExpiresAt: time.Now().Add(-time.Hour),
		Version:   12,
	}
	delayedActiveSnapshot := &service.SubscriptionCacheData{
		Status:    service.SubscriptionStatusActive,
		ExpiresAt: time.Now().Add(time.Hour),
		Version:   11,
	}

	require.NoError(t, cache.SetSubscriptionCache(ctx, userID, groupID, expiredSnapshot))
	require.NoError(t, cache.SetSubscriptionCache(ctx, userID, groupID, delayedActiveSnapshot))

	got, err := cache.GetSubscriptionCache(ctx, userID, groupID)
	require.NoError(t, err)
	require.Equal(t, expiredSnapshot.Status, got.Status)
	require.Equal(t, expiredSnapshot.ExpiresAt.Unix(), got.ExpiresAt.Unix())
	require.Equal(t, expiredSnapshot.Version, got.Version)
}

func TestInvalidateSubscriptionCache_RemovesLegacyAndRevisionedKeys(t *testing.T) {
	cache, redisServer := newMiniRedisCache(t)
	ctx := context.Background()
	userID := int64(15)
	groupID := int64(25)

	require.NoError(t, cache.SetSubscriptionCache(ctx, userID, groupID, &service.SubscriptionCacheData{
		Status:    service.SubscriptionStatusActive,
		ExpiresAt: time.Now().Add(time.Hour),
		Version:   1,
	}))
	redisServer.HSet(billingLegacySubKey(userID, groupID), "status", service.SubscriptionStatusActive)

	require.NoError(t, cache.InvalidateSubscriptionCache(ctx, userID, groupID))
	require.False(t, redisServer.Exists(billingSubKey(userID, groupID)))
	require.False(t, redisServer.Exists(billingLegacySubKey(userID, groupID)))
}
