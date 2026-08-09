//go:build unit

package service_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/repository"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
)

type delayedSubscriptionSnapshotCache struct {
	service.BillingCache
	started chan struct{}
	release chan struct{}
	done    chan struct{}
	once    sync.Once
}

func (c *delayedSubscriptionSnapshotCache) SetSubscriptionCache(
	ctx context.Context,
	userID, groupID int64,
	data *service.SubscriptionCacheData,
) error {
	c.once.Do(func() { close(c.started) })
	select {
	case <-c.release:
	case <-ctx.Done():
		return ctx.Err()
	}
	err := c.BillingCache.SetSubscriptionCache(ctx, userID, groupID, data)
	close(c.done)
	return err
}

func TestQueuedSubscriptionSnapshot_CannotOverwriteNewerResetRevision(t *testing.T) {
	redisServer := miniredis.RunT(t)
	workerClient := redis.NewClient(&redis.Options{Addr: redisServer.Addr()})
	adminClient := redis.NewClient(&redis.Options{Addr: redisServer.Addr()})
	t.Cleanup(func() {
		_ = workerClient.Close()
		_ = adminClient.Close()
	})

	workerCache := repository.NewBillingCache(workerClient)
	delayedCache := &delayedSubscriptionSnapshotCache{
		BillingCache: workerCache,
		started:      make(chan struct{}),
		release:      make(chan struct{}),
		done:         make(chan struct{}),
	}
	workerService := service.NewBillingCacheService(delayedCache, nil, nil, nil, nil, nil, &config.Config{}, nil)
	t.Cleanup(workerService.Stop)
	adminCache := repository.NewBillingCache(adminClient)

	userID := int64(41)
	groupID := int64(51)
	expiresAt := time.Now().Add(time.Hour)
	oldUsageSnapshot := &service.SubscriptionCacheData{
		Status:       service.SubscriptionStatusActive,
		ExpiresAt:    expiresAt,
		DailyUsage:   5,
		WeeklyUsage:  13,
		MonthlyUsage: 33,
		Version:      1,
	}
	resetSnapshot := &service.SubscriptionCacheData{
		Status:       service.SubscriptionStatusActive,
		ExpiresAt:    expiresAt,
		DailyUsage:   0,
		WeeklyUsage:  13,
		MonthlyUsage: 33,
		Version:      2,
	}

	workerService.QueueSubscriptionSnapshot(userID, groupID, oldUsageSnapshot)
	requireSignal(t, delayedCache.started)
	require.NoError(t, adminCache.SetSubscriptionCache(context.Background(), userID, groupID, resetSnapshot))
	close(delayedCache.release)
	requireSignal(t, delayedCache.done)

	got, err := adminCache.GetSubscriptionCache(context.Background(), userID, groupID)
	require.NoError(t, err)
	require.Equal(t, resetSnapshot.Version, got.Version)
	require.InDelta(t, resetSnapshot.DailyUsage, got.DailyUsage, 1e-9)
	require.InDelta(t, resetSnapshot.WeeklyUsage, got.WeeklyUsage, 1e-9)
	require.InDelta(t, resetSnapshot.MonthlyUsage, got.MonthlyUsage, 1e-9)
}

func requireSignal(t *testing.T, signal <-chan struct{}) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for cache worker")
	}
}
