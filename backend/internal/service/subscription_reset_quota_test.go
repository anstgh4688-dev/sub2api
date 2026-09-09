//go:build unit

package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/timezone"
	"github.com/stretchr/testify/require"
)

// resetQuotaUserSubRepoStub 支持 GetByID、ResetUsageWindows，
// 其余方法继承 userSubRepoNoop（panic）。
type resetQuotaUserSubRepoStub struct {
	userSubRepoNoop

	sub *UserSubscription

	resetDailyCalled   bool
	resetWeeklyCalled  bool
	resetMonthlyCalled bool
	resetDailyErr      error
	resetWeeklyErr     error
	resetMonthlyErr    error
	dailyStart         time.Time
	periodicStart      time.Time
}

func (r *resetQuotaUserSubRepoStub) GetByID(_ context.Context, id int64) (*UserSubscription, error) {
	if r.sub == nil || r.sub.ID != id {
		return nil, ErrSubscriptionNotFound
	}
	cp := *r.sub
	return &cp, nil
}

func (r *resetQuotaUserSubRepoStub) ResetUsageWindows(_ context.Context, _ int64, resetDaily, resetWeekly, resetMonthly bool, dailyStart, periodicStart time.Time) error {
	r.resetDailyCalled = resetDaily
	r.resetWeeklyCalled = resetWeekly
	r.resetMonthlyCalled = resetMonthly
	r.dailyStart = dailyStart
	r.periodicStart = periodicStart
	if resetDaily && r.resetDailyErr != nil {
		return r.resetDailyErr
	}
	if resetWeekly && r.resetWeeklyErr != nil {
		return r.resetWeeklyErr
	}
	if resetMonthly && r.resetMonthlyErr != nil {
		return r.resetMonthlyErr
	}
	if r.sub == nil {
		return nil
	}
	dailyUsage := r.sub.DailyUsageUSD
	weeklyUsage := r.sub.WeeklyUsageUSD
	if resetDaily {
		r.sub.DailyUsageUSD = 0
		r.sub.DailyWindowStart = &dailyStart
	}
	if resetWeekly {
		r.sub.WeeklyUsageUSD = 0
		r.sub.WeeklyWindowStart = &periodicStart
	} else if resetDaily {
		r.sub.WeeklyUsageUSD -= dailyUsage
		if r.sub.WeeklyUsageUSD < 0 {
			r.sub.WeeklyUsageUSD = 0
		}
	}
	if resetMonthly {
		r.sub.MonthlyUsageUSD = 0
		r.sub.MonthlyWindowStart = &periodicStart
	} else {
		if resetDaily {
			r.sub.MonthlyUsageUSD -= dailyUsage
		}
		if resetWeekly {
			r.sub.MonthlyUsageUSD -= weeklyUsage
		}
		if r.sub.MonthlyUsageUSD < 0 {
			r.sub.MonthlyUsageUSD = 0
		}
	}
	r.sub.CacheRevision++
	return nil
}

func (r *resetQuotaUserSubRepoStub) ResetDailyUsage(_ context.Context, _ int64, _ *time.Time, windowStart time.Time) error {
	r.resetDailyCalled = true
	if r.resetDailyErr == nil && r.sub != nil {
		r.sub.DailyUsageUSD = 0
		r.sub.DailyWindowStart = &windowStart
	}
	return r.resetDailyErr
}

func (r *resetQuotaUserSubRepoStub) ResetWeeklyUsage(_ context.Context, _ int64, _ *time.Time, _ time.Time) error {
	r.resetWeeklyCalled = true
	return r.resetWeeklyErr
}

func (r *resetQuotaUserSubRepoStub) ResetMonthlyUsage(_ context.Context, _ int64, _ *time.Time, _ time.Time) error {
	r.resetMonthlyCalled = true
	return r.resetMonthlyErr
}

func newResetQuotaSvc(stub *resetQuotaUserSubRepoStub) *SubscriptionService {
	return NewSubscriptionService(groupRepoNoop{}, stub, nil, nil, nil)
}

func TestAdminResetQuota_ResetBoth(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:              1,
			UserID:          10,
			GroupID:         20,
			DailyUsageUSD:   2,
			WeeklyUsageUSD:  10,
			MonthlyUsageUSD: 30,
		},
	}
	svc := newResetQuotaSvc(stub)
	resetAt := time.Date(2026, 7, 1, 10, 37, 42, 123, time.UTC)
	svc.now = func() time.Time { return resetAt }

	result, err := svc.AdminResetQuota(context.Background(), 1, true, true, false)

	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, stub.resetDailyCalled, "应调用 ResetDailyUsage")
	require.True(t, stub.resetWeeklyCalled, "应调用 ResetWeeklyUsage")
	require.False(t, stub.resetMonthlyCalled, "不应调用 ResetMonthlyUsage")
	// 手动重置后日窗口锚定当天 0 点（保持 0 点刷新节奏），周窗口锚定重置时刻。
	require.Equal(t, timezone.StartOfDay(resetAt), stub.dailyStart)
	require.Equal(t, resetAt, stub.periodicStart)
	require.Equal(t, timezone.StartOfDay(resetAt), *result.DailyWindowStart)
	require.Equal(t, resetAt, *result.WeeklyWindowStart)
	require.Zero(t, result.DailyUsageUSD)
	require.Zero(t, result.WeeklyUsageUSD)
	require.Equal(t, float64(18), result.MonthlyUsageUSD)
}

func TestAdminResetQuota_ResetDailyOnly(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:              2,
			UserID:          10,
			GroupID:         20,
			DailyUsageUSD:   2,
			WeeklyUsageUSD:  10,
			MonthlyUsageUSD: 30,
		},
	}
	svc := newResetQuotaSvc(stub)

	result, err := svc.AdminResetQuota(context.Background(), 2, true, false, false)

	require.NoError(t, err)
	require.NotNil(t, result)
	require.True(t, stub.resetDailyCalled, "应调用 ResetDailyUsage")
	require.False(t, stub.resetWeeklyCalled, "不应调用 ResetWeeklyUsage")
	require.False(t, stub.resetMonthlyCalled, "不应调用 ResetMonthlyUsage")
	require.Zero(t, result.DailyUsageUSD)
	require.Equal(t, float64(8), result.WeeklyUsageUSD)
	require.Equal(t, float64(28), result.MonthlyUsageUSD)
}

func TestAdminResetQuota_ResetWeeklyOnly(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:              3,
			UserID:          10,
			GroupID:         20,
			DailyUsageUSD:   2,
			WeeklyUsageUSD:  10,
			MonthlyUsageUSD: 30,
		},
	}
	svc := newResetQuotaSvc(stub)

	result, err := svc.AdminResetQuota(context.Background(), 3, false, true, false)

	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, stub.resetDailyCalled, "不应调用 ResetDailyUsage")
	require.True(t, stub.resetWeeklyCalled, "应调用 ResetWeeklyUsage")
	require.False(t, stub.resetMonthlyCalled, "不应调用 ResetMonthlyUsage")
	require.Equal(t, float64(2), result.DailyUsageUSD)
	require.Zero(t, result.WeeklyUsageUSD)
	require.Equal(t, float64(20), result.MonthlyUsageUSD)
}

func TestAdminResetQuota_BothFalseReturnsError(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{ID: 7, UserID: 10, GroupID: 20},
	}
	svc := newResetQuotaSvc(stub)

	_, err := svc.AdminResetQuota(context.Background(), 7, false, false, false)

	require.ErrorIs(t, err, ErrInvalidInput)
	require.False(t, stub.resetDailyCalled)
	require.False(t, stub.resetWeeklyCalled)
	require.False(t, stub.resetMonthlyCalled)
}

func TestAdminResetQuota_SubscriptionNotFound(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{sub: nil}
	svc := newResetQuotaSvc(stub)

	_, err := svc.AdminResetQuota(context.Background(), 999, true, true, true)

	require.ErrorIs(t, err, ErrSubscriptionNotFound)
	require.False(t, stub.resetDailyCalled)
	require.False(t, stub.resetWeeklyCalled)
	require.False(t, stub.resetMonthlyCalled)
}

func TestAdminResetQuota_ResetDailyUsageError(t *testing.T) {
	dbErr := errors.New("db error")
	stub := &resetQuotaUserSubRepoStub{
		sub:           &UserSubscription{ID: 4, UserID: 10, GroupID: 20},
		resetDailyErr: dbErr,
	}
	svc := newResetQuotaSvc(stub)

	_, err := svc.AdminResetQuota(context.Background(), 4, true, true, false)

	require.ErrorIs(t, err, dbErr)
	require.True(t, stub.resetDailyCalled)
	require.True(t, stub.resetWeeklyCalled, "原子重置应在一次调用中提交所选窗口")
}

func TestAdminResetQuota_ResetWeeklyUsageError(t *testing.T) {
	dbErr := errors.New("db error")
	stub := &resetQuotaUserSubRepoStub{
		sub:            &UserSubscription{ID: 5, UserID: 10, GroupID: 20},
		resetWeeklyErr: dbErr,
	}
	svc := newResetQuotaSvc(stub)

	_, err := svc.AdminResetQuota(context.Background(), 5, false, true, false)

	require.ErrorIs(t, err, dbErr)
	require.True(t, stub.resetWeeklyCalled)
}

func TestAdminResetQuota_ResetMonthlyOnly(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:              8,
			UserID:          10,
			GroupID:         20,
			DailyUsageUSD:   2,
			WeeklyUsageUSD:  10,
			MonthlyUsageUSD: 30,
		},
	}
	svc := newResetQuotaSvc(stub)

	result, err := svc.AdminResetQuota(context.Background(), 8, false, false, true)

	require.NoError(t, err)
	require.NotNil(t, result)
	require.False(t, stub.resetDailyCalled, "不应调用 ResetDailyUsage")
	require.False(t, stub.resetWeeklyCalled, "不应调用 ResetWeeklyUsage")
	require.True(t, stub.resetMonthlyCalled, "应调用 ResetMonthlyUsage")
	require.Equal(t, float64(2), result.DailyUsageUSD)
	require.Equal(t, float64(10), result.WeeklyUsageUSD)
	require.Zero(t, result.MonthlyUsageUSD)
}

func TestAdminResetQuota_ResetAllClearsEveryPeriod(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:              12,
			UserID:          10,
			GroupID:         20,
			DailyUsageUSD:   2,
			WeeklyUsageUSD:  10,
			MonthlyUsageUSD: 30,
		},
	}
	svc := newResetQuotaSvc(stub)

	result, err := svc.AdminResetQuota(context.Background(), 12, true, true, true)

	require.NoError(t, err)
	require.Zero(t, result.DailyUsageUSD)
	require.Zero(t, result.WeeklyUsageUSD)
	require.Zero(t, result.MonthlyUsageUSD)
}

func TestAdminResetQuota_BeforeStartsAtSameDayPreservesAutomaticBoundary(t *testing.T) {
	startsAt := time.Date(2026, 7, 1, 15, 0, 0, 0, time.UTC)
	resetAt := time.Date(2026, 7, 1, 10, 37, 42, 123, time.UTC)
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:        10,
			UserID:    10,
			GroupID:   20,
			StartsAt:  startsAt,
			ExpiresAt: startsAt.Add(45 * 24 * time.Hour),
		},
	}
	svc := newResetQuotaSvc(stub)
	svc.now = func() time.Time { return resetAt }

	result, err := svc.AdminResetQuota(context.Background(), 10, false, false, true)

	require.NoError(t, err)
	require.Equal(t, resetAt, *result.MonthlyWindowStart)
	boundary, ok := result.automaticWindowStartAt(result.MonthlyWindowStart, 30*24*time.Hour, resetAt.Add(30*24*time.Hour))
	require.True(t, ok)
	require.Equal(t, resetAt.Add(30*24*time.Hour), boundary)
}

func TestAdminResetQuota_ResetMonthlyUsageError(t *testing.T) {
	dbErr := errors.New("db error")
	stub := &resetQuotaUserSubRepoStub{
		sub:             &UserSubscription{ID: 9, UserID: 10, GroupID: 20},
		resetMonthlyErr: dbErr,
	}
	svc := newResetQuotaSvc(stub)

	_, err := svc.AdminResetQuota(context.Background(), 9, false, false, true)

	require.ErrorIs(t, err, dbErr)
	require.True(t, stub.resetMonthlyCalled)
}

func TestAdminResetQuota_ReturnsRefreshedSub(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:            6,
			UserID:        10,
			GroupID:       20,
			DailyUsageUSD: 99.9,
		},
	}

	svc := newResetQuotaSvc(stub)
	result, err := svc.AdminResetQuota(context.Background(), 6, true, false, false)

	require.NoError(t, err)
	// ResetUsageWindows stub 会将 sub.DailyUsageUSD 归零，
	// 服务应返回第二次 GetByID 的刷新值而非初始的 99.9
	require.Equal(t, float64(0), result.DailyUsageUSD, "返回的订阅应反映已归零的用量")
	require.True(t, stub.resetDailyCalled)
}

func TestAdminResetQuota_PublishesPostResetSnapshot(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:              10,
			UserID:          20,
			GroupID:         30,
			Status:          SubscriptionStatusActive,
			ExpiresAt:       time.Now().Add(time.Hour),
			DailyUsageUSD:   5,
			WeeklyUsageUSD:  13,
			MonthlyUsageUSD: 33,
			CacheRevision:   7,
		},
	}
	cache := &billingCacheWorkerStub{}
	billing := NewBillingCacheService(cache, nil, stub, nil, nil, nil, &config.Config{}, nil)
	t.Cleanup(billing.Stop)
	svc := NewSubscriptionService(groupRepoNoop{}, stub, billing, nil, nil)

	result, err := svc.AdminResetQuota(context.Background(), 10, true, false, false)
	require.NoError(t, err)
	require.Equal(t, int64(8), result.CacheRevision)

	cache.mu.Lock()
	snapshot := cache.lastSubscription
	publishedKey := cache.publishedCacheKey
	cache.mu.Unlock()
	require.NotNil(t, snapshot)
	require.Equal(t, &SubscriptionCacheData{
		Status:       SubscriptionStatusActive,
		ExpiresAt:    result.ExpiresAt,
		DailyUsage:   0,
		WeeklyUsage:  8,
		MonthlyUsage: 28,
		Version:      8,
	}, snapshot)
	require.Equal(t, subCacheKey(20, 30), publishedKey)
}

func TestAdminResetQuota_CacheFailureDoesNotReportCommittedResetAsFailure(t *testing.T) {
	stub := &resetQuotaUserSubRepoStub{
		sub: &UserSubscription{
			ID:            11,
			UserID:        21,
			GroupID:       31,
			DailyUsageUSD: 5,
			CacheRevision: 9,
		},
	}
	cache := &billingCacheWorkerStub{subscriptionSetErr: errors.New("redis unavailable")}
	billing := NewBillingCacheService(cache, nil, stub, nil, nil, nil, &config.Config{}, nil)
	t.Cleanup(billing.Stop)
	svc := NewSubscriptionService(groupRepoNoop{}, stub, billing, nil, nil)

	result, err := svc.AdminResetQuota(context.Background(), 11, true, false, false)
	require.NoError(t, err)
	require.Zero(t, result.DailyUsageUSD)
	require.True(t, stub.resetDailyCalled)

	cache.mu.Lock()
	publishedKey := cache.publishedCacheKey
	cache.mu.Unlock()
	require.Equal(t, subCacheKey(21, 31), publishedKey, "snapshot failure must not skip L1 invalidation publish")
}
