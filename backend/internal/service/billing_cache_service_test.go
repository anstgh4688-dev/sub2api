package service

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

type billingCacheWorkerStub struct {
	mu                  sync.Mutex
	balanceUpdates      int64
	subscriptionUpdates int64
	lastSubscription    *SubscriptionCacheData
	publishedCacheKey   string
	subscriptionDeletes int64
	subscriptionSetErr  error
	publishErr          error
}

func (b *billingCacheWorkerStub) GetUserBalance(ctx context.Context, userID int64) (float64, error) {
	return 0, errors.New("not implemented")
}

func (b *billingCacheWorkerStub) SetUserBalance(ctx context.Context, userID int64, balance float64) error {
	atomic.AddInt64(&b.balanceUpdates, 1)
	return nil
}

func (b *billingCacheWorkerStub) DeductUserBalance(ctx context.Context, userID int64, amount float64) error {
	atomic.AddInt64(&b.balanceUpdates, 1)
	return nil
}

func (b *billingCacheWorkerStub) InvalidateUserBalance(ctx context.Context, userID int64) error {
	return nil
}

func (b *billingCacheWorkerStub) GetSubscriptionCache(ctx context.Context, userID, groupID int64) (*SubscriptionCacheData, error) {
	return nil, errors.New("not implemented")
}

func (b *billingCacheWorkerStub) SetSubscriptionCache(ctx context.Context, userID, groupID int64, data *SubscriptionCacheData) error {
	atomic.AddInt64(&b.subscriptionUpdates, 1)
	if b.subscriptionSetErr != nil {
		return b.subscriptionSetErr
	}
	b.mu.Lock()
	if data != nil {
		cp := *data
		b.lastSubscription = &cp
	}
	b.mu.Unlock()
	return nil
}

func (b *billingCacheWorkerStub) InvalidateSubscriptionCache(ctx context.Context, userID, groupID int64) error {
	atomic.AddInt64(&b.subscriptionDeletes, 1)
	return nil
}

func (b *billingCacheWorkerStub) PublishSubscriptionCacheInvalidation(_ context.Context, cacheKey string) error {
	b.mu.Lock()
	b.publishedCacheKey = cacheKey
	b.mu.Unlock()
	return b.publishErr
}

func (b *billingCacheWorkerStub) SubscribeSubscriptionCacheInvalidation(_ context.Context, _ func(cacheKey string)) error {
	return nil
}

func (b *billingCacheWorkerStub) GetAPIKeyRateLimit(ctx context.Context, keyID int64) (*APIKeyRateLimitCacheData, error) {
	return nil, errors.New("not implemented")
}

func (b *billingCacheWorkerStub) SetAPIKeyRateLimit(ctx context.Context, keyID int64, data *APIKeyRateLimitCacheData) error {
	return nil
}

func (b *billingCacheWorkerStub) UpdateAPIKeyRateLimitUsage(ctx context.Context, keyID int64, cost float64) error {
	return nil
}

func (b *billingCacheWorkerStub) InvalidateAPIKeyRateLimit(ctx context.Context, keyID int64) error {
	return nil
}

func (b *billingCacheWorkerStub) GetUserPlatformQuotaCache(ctx context.Context, userID int64, platform string) (*UserPlatformQuotaCacheEntry, bool, error) {
	return nil, false, nil
}

func (b *billingCacheWorkerStub) SetUserPlatformQuotaCache(ctx context.Context, userID int64, platform string, entry *UserPlatformQuotaCacheEntry, ttl time.Duration) error {
	return nil
}

func (b *billingCacheWorkerStub) DeleteUserPlatformQuotaCache(ctx context.Context, userID int64, platform string) error {
	return nil
}

func (b *billingCacheWorkerStub) IncrUserPlatformQuotaUsageCache(ctx context.Context, userID int64, platform string, cost float64, ttl time.Duration, markDirty bool) error {
	return nil
}

func (b *billingCacheWorkerStub) PopDirtyUserPlatformQuotaKeys(ctx context.Context, n int) ([]UserPlatformQuotaKey, error) {
	return nil, nil
}

func (b *billingCacheWorkerStub) ReaddDirtyUserPlatformQuotaKeys(ctx context.Context, keys []UserPlatformQuotaKey) error {
	return nil
}

func (b *billingCacheWorkerStub) BatchGetUserPlatformQuotaCache(ctx context.Context, keys []UserPlatformQuotaKey) ([]*UserPlatformQuotaCacheEntry, error) {
	return nil, nil
}

func TestBillingCacheServiceQueueHighLoad(t *testing.T) {
	cache := &billingCacheWorkerStub{}
	svc := NewBillingCacheService(cache, nil, nil, nil, nil, nil, &config.Config{}, nil)
	t.Cleanup(svc.Stop)

	start := time.Now()
	for i := 0; i < cacheWriteBufferSize*2; i++ {
		svc.QueueDeductBalance(1, 1)
	}
	require.Less(t, time.Since(start), 2*time.Second)

	svc.QueueSubscriptionSnapshot(1, 2, &SubscriptionCacheData{
		Status:       SubscriptionStatusActive,
		ExpiresAt:    time.Now().Add(time.Hour),
		DailyUsage:   1.5,
		WeeklyUsage:  1.5,
		MonthlyUsage: 1.5,
		Version:      1,
	})

	require.Eventually(t, func() bool {
		return atomic.LoadInt64(&cache.balanceUpdates) > 0
	}, 2*time.Second, 10*time.Millisecond)

	require.Eventually(t, func() bool {
		return atomic.LoadInt64(&cache.subscriptionUpdates) > 0
	}, 2*time.Second, 10*time.Millisecond)
}

func TestBillingCacheServiceEnqueueAfterStopReturnsFalse(t *testing.T) {
	cache := &billingCacheWorkerStub{}
	svc := NewBillingCacheService(cache, nil, nil, nil, nil, nil, &config.Config{}, nil)
	svc.Stop()

	enqueued := svc.enqueueCacheWrite(cacheWriteTask{
		kind:   cacheWriteDeductBalance,
		userID: 1,
		amount: 1,
	})
	require.False(t, enqueued)
}

type currentSubscriptionRepoStub struct {
	userSubRepoNoop
	sub *UserSubscription
}

func (r *currentSubscriptionRepoStub) GetByUserIDAndGroupID(context.Context, int64, int64) (*UserSubscription, error) {
	cp := *r.sub
	return &cp, nil
}

func TestInvalidateSubscription_StoresCurrentDatabaseRevision(t *testing.T) {
	repo := &currentSubscriptionRepoStub{sub: &UserSubscription{
		UserID:          10,
		GroupID:         20,
		Status:          SubscriptionStatusExpired,
		ExpiresAt:       time.Now().Add(-time.Hour),
		DailyUsageUSD:   3,
		WeeklyUsageUSD:  13,
		MonthlyUsageUSD: 33,
		CacheRevision:   9,
	}}
	cache := &billingCacheWorkerStub{}
	svc := NewBillingCacheService(cache, nil, repo, nil, nil, nil, &config.Config{}, nil)
	t.Cleanup(svc.Stop)

	require.NoError(t, svc.InvalidateSubscription(context.Background(), 10, 20))

	cache.mu.Lock()
	snapshot := cache.lastSubscription
	cache.mu.Unlock()
	require.NotNil(t, snapshot)
	require.Equal(t, int64(9), snapshot.Version)
	require.Equal(t, SubscriptionStatusExpired, snapshot.Status)
	require.InDelta(t, 3, snapshot.DailyUsage, 1e-9)
	require.Zero(t, atomic.LoadInt64(&cache.subscriptionDeletes))
}

func TestStoreSubscriptionSnapshot_InvalidatesStaleCacheWhenWriteFails(t *testing.T) {
	cache := &billingCacheWorkerStub{subscriptionSetErr: errors.New("redis write failed")}
	svc := NewBillingCacheService(cache, nil, nil, nil, nil, nil, &config.Config{}, nil)
	t.Cleanup(svc.Stop)

	err := svc.StoreSubscriptionSnapshot(context.Background(), 10, 20, &SubscriptionCacheData{
		Status:  SubscriptionStatusActive,
		Version: 2,
	})

	require.ErrorContains(t, err, "redis write failed")
	require.Equal(t, int64(1), atomic.LoadInt64(&cache.subscriptionDeletes))
}
