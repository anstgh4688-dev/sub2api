//go:build unit

package service

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

type delayedActiveSubscriptionRepo struct {
	userSubRepoNoop

	started chan struct{}
	release chan struct{}
	calls   atomic.Int64
	oldSub  *UserSubscription
	newSub  *UserSubscription
}

func (r *delayedActiveSubscriptionRepo) GetActiveByUserIDAndGroupID(context.Context, int64, int64) (*UserSubscription, error) {
	if r.calls.Add(1) == 1 {
		close(r.started)
		<-r.release
		cp := *r.oldSub
		return &cp, nil
	}
	cp := *r.newSub
	return &cp, nil
}

func TestInvalidateSubCache_PreventsInflightLoaderFromRestoringStaleEntry(t *testing.T) {
	oldSub := &UserSubscription{ID: 1, UserID: 10, GroupID: 20, DailyUsageUSD: 5, CacheRevision: 1}
	newSub := &UserSubscription{ID: 1, UserID: 10, GroupID: 20, DailyUsageUSD: 0, CacheRevision: 2}
	repo := &delayedActiveSubscriptionRepo{
		started: make(chan struct{}),
		release: make(chan struct{}),
		oldSub:  oldSub,
		newSub:  newSub,
	}
	svc := NewSubscriptionService(groupRepoNoop{}, repo, nil, nil, &config.Config{
		SubscriptionCache: config.SubscriptionCacheConfig{L1Size: 16, L1TTLSeconds: 60},
	})
	t.Cleanup(svc.Stop)

	oldResult := make(chan *UserSubscription, 1)
	oldErr := make(chan error, 1)
	go func() {
		sub, err := svc.GetActiveSubscription(context.Background(), 10, 20)
		oldResult <- sub
		oldErr <- err
	}()

	select {
	case <-repo.started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for stale subscription load")
	}

	svc.InvalidateSubCacheSync(10, 20)
	fresh, err := svc.GetActiveSubscription(context.Background(), 10, 20)
	require.NoError(t, err)
	require.Equal(t, int64(2), fresh.CacheRevision)

	close(repo.release)
	require.NoError(t, <-oldErr)
	require.Equal(t, int64(1), (<-oldResult).CacheRevision)
	svc.subCacheL1.Wait()

	cached, err := svc.GetActiveSubscription(context.Background(), 10, 20)
	require.NoError(t, err)
	require.Equal(t, int64(2), cached.CacheRevision)
	require.GreaterOrEqual(t, repo.calls.Load(), int64(2))
}
