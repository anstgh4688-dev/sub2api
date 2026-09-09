package repository

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	dbent "github.com/Wei-Shaw/sub2api/ent"
	_ "github.com/Wei-Shaw/sub2api/ent/runtime"
	"github.com/stretchr/testify/require"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

func TestResetUsageWindows_UsesAtomicParentDeductionSQL(t *testing.T) {
	var capturedSQL string
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(captureEntQueryMatcher{actual: &capturedSQL}))
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	driver := entsql.OpenDB(dialect.Postgres, db)
	client := dbent.NewClient(dbent.Driver(driver))
	t.Cleanup(func() { _ = client.Close() })
	repo := NewUserSubscriptionRepository(client)
	dailyStart := time.Date(2026, 8, 26, 0, 0, 0, 0, time.UTC)
	periodicStart := dailyStart.Add(2 * time.Hour)

	mock.ExpectExec("reset usage windows").
		WithArgs(int64(7), true, false, false, dailyStart, periodicStart).
		WillReturnResult(sqlmock.NewResult(0, 1))

	require.NoError(t, repo.ResetUsageWindows(context.Background(), 7, true, false, false, dailyStart, periodicStart))
	require.NoError(t, mock.ExpectationsWereMet())

	normalized := strings.ToLower(normalizeSQLWhitespace(capturedSQL))
	require.Contains(t, normalized, "weekly_usage_usd = case when $3 then 0 when $2 then greatest(0::numeric, weekly_usage_usd - daily_usage_usd) else weekly_usage_usd end")
	require.Contains(t, normalized, "monthly_usage_usd = case when $4 then 0 else greatest(0::numeric, monthly_usage_usd - case when $2 then daily_usage_usd else 0 end - case when $3 then weekly_usage_usd else 0 end) end")
	require.Contains(t, normalized, "daily_usage_usd = case when $2 then 0 else daily_usage_usd end")
}
