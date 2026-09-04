//go:build unit

package service

import (
	"context"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

type limitOverrideUserSubRepoStub struct {
	userSubRepoNoop
	sub *UserSubscription
}

type limitEligibilityCacheStub struct {
	BillingCache
	snapshot *SubscriptionCacheData
}

func (s *limitEligibilityCacheStub) GetSubscriptionCache(context.Context, int64, int64) (*SubscriptionCacheData, error) {
	return s.snapshot, nil
}

func (r *limitOverrideUserSubRepoStub) GetByID(_ context.Context, id int64) (*UserSubscription, error) {
	if r.sub == nil || r.sub.ID != id {
		return nil, ErrSubscriptionNotFound
	}
	cp := *r.sub
	return &cp, nil
}

func (r *limitOverrideUserSubRepoStub) UpdateLimitOverrides(_ context.Context, id int64, input UpdateSubscriptionLimitsInput) error {
	if r.sub == nil || r.sub.ID != id {
		return ErrSubscriptionNotFound
	}
	if input.DailySet {
		r.sub.DailyLimitOverrideUSD = input.Daily
	}
	if input.WeeklySet {
		r.sub.WeeklyLimitOverrideUSD = input.Weekly
	}
	if input.MonthlySet {
		r.sub.MonthlyLimitOverrideUSD = input.Monthly
	}
	r.sub.CacheRevision++
	return nil
}

func limitFloatPtr(value float64) *float64 { return &value }

func TestUserSubscriptionEffectiveLimitsPreferOverrides(t *testing.T) {
	group := &Group{
		DailyLimitUSD:   limitFloatPtr(100),
		WeeklyLimitUSD:  limitFloatPtr(500),
		MonthlyLimitUSD: limitFloatPtr(1000),
	}
	sub := &UserSubscription{
		DailyLimitOverrideUSD:   limitFloatPtr(50),
		MonthlyLimitOverrideUSD: limitFloatPtr(0),
	}

	require.Equal(t, 50.0, *sub.EffectiveDailyLimitUSD(group))
	require.Equal(t, 500.0, *sub.EffectiveWeeklyLimitUSD(group))
	require.Equal(t, 0.0, *sub.EffectiveMonthlyLimitUSD(group))
	require.True(t, sub.CheckMonthlyLimit(group, 9999))

	effective := sub.GroupWithEffectiveLimits(group)
	require.Equal(t, 50.0, *effective.DailyLimitUSD)
	require.Equal(t, 500.0, *effective.WeeklyLimitUSD)
	require.Equal(t, 0.0, *effective.MonthlyLimitUSD)
}

func TestAdminUpdateSubscriptionLimitsPreservesOmittedPeriods(t *testing.T) {
	group := &Group{
		DailyLimitUSD:   limitFloatPtr(100),
		WeeklyLimitUSD:  limitFloatPtr(500),
		MonthlyLimitUSD: limitFloatPtr(1000),
	}
	stub := &limitOverrideUserSubRepoStub{sub: &UserSubscription{
		ID:                      7,
		UserID:                  11,
		GroupID:                 13,
		Group:                   group,
		WeeklyLimitOverrideUSD:  limitFloatPtr(250),
		MonthlyLimitOverrideUSD: limitFloatPtr(750),
		CacheRevision:           4,
	}}
	svc := NewSubscriptionService(groupRepoNoop{}, stub, nil, nil, nil)

	updated, err := svc.AdminUpdateLimits(context.Background(), 7, UpdateSubscriptionLimitsInput{
		DailySet:   true,
		Daily:      limitFloatPtr(40),
		MonthlySet: true,
		Monthly:    nil,
	})

	require.NoError(t, err)
	require.Equal(t, 40.0, *updated.DailyLimitOverrideUSD)
	require.Equal(t, 250.0, *updated.WeeklyLimitOverrideUSD)
	require.Nil(t, updated.MonthlyLimitOverrideUSD)
	require.Equal(t, int64(5), updated.CacheRevision)
	require.Equal(t, 40.0, *updated.EffectiveDailyLimitUSD(group))
	require.Equal(t, 250.0, *updated.EffectiveWeeklyLimitUSD(group))
	require.Equal(t, 1000.0, *updated.EffectiveMonthlyLimitUSD(group))
}

func TestAdminUpdateSubscriptionLimitsRejectsNegativeValues(t *testing.T) {
	stub := &limitOverrideUserSubRepoStub{sub: &UserSubscription{ID: 7}}
	svc := NewSubscriptionService(groupRepoNoop{}, stub, nil, nil, nil)

	_, err := svc.AdminUpdateLimits(context.Background(), 7, UpdateSubscriptionLimitsInput{
		DailySet: true,
		Daily:    limitFloatPtr(-1),
	})

	require.ErrorIs(t, err, ErrInvalidLimitOverride)
	require.Equal(t, int64(0), stub.sub.CacheRevision)
}

func TestAdminUpdateSubscriptionLimitsRefreshesExactCacheSnapshot(t *testing.T) {
	group := &Group{
		DailyLimitUSD:   limitFloatPtr(100),
		WeeklyLimitUSD:  limitFloatPtr(500),
		MonthlyLimitUSD: limitFloatPtr(1000),
	}
	stub := &limitOverrideUserSubRepoStub{sub: &UserSubscription{
		ID:            7,
		UserID:        11,
		GroupID:       13,
		Group:         group,
		DailyUsageUSD: 12,
		CacheRevision: 4,
	}}
	cache := &billingCacheWorkerStub{}
	billing := NewBillingCacheService(cache, nil, stub, nil, nil, nil, &config.Config{}, nil)
	defer billing.Stop()
	svc := NewSubscriptionService(groupRepoNoop{}, stub, billing, nil, nil)

	_, err := svc.AdminUpdateLimits(context.Background(), 7, UpdateSubscriptionLimitsInput{
		DailySet: true,
		Daily:    limitFloatPtr(25),
	})

	require.NoError(t, err)
	cache.mu.Lock()
	snapshot := *cache.lastSubscription
	cache.mu.Unlock()
	require.Equal(t, int64(5), snapshot.Version)
	require.Equal(t, 25.0, *snapshot.DailyLimitOverride)
	require.Nil(t, snapshot.WeeklyLimitOverride)
	require.Nil(t, snapshot.MonthlyLimitOverride)
	require.Equal(t, "sub:11:13", cache.publishedCacheKey)
}

func TestSubscriptionEligibilityCombinesCachedOverrideWithCurrentGroupLimit(t *testing.T) {
	expiresAt := time.Now().Add(time.Hour)
	groupLimit := 10.0
	group := &Group{ID: 13, DailyLimitUSD: &groupLimit}
	sub := &UserSubscription{DailyLimitOverrideUSD: nil}
	cache := &limitEligibilityCacheStub{snapshot: &SubscriptionCacheData{
		Status:     SubscriptionStatusActive,
		ExpiresAt:  expiresAt,
		DailyUsage: 10,
		Version:    1,
	}}
	billing := &BillingCacheService{cache: cache}

	err := billing.checkSubscriptionEligibility(context.Background(), 11, group, sub)
	require.ErrorIs(t, err, ErrDailyLimitExceeded)

	unlimited := 0.0
	cache.snapshot.DailyLimitOverride = &unlimited
	cache.snapshot.DailyUsage = 100
	require.NoError(t, billing.checkSubscriptionEligibility(context.Background(), 11, group, sub))
}
