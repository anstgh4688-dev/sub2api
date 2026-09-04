package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/pagination"
)

// mockPoolAccountRepo 嵌入接口，只实现 PublicPoolStatus 用到的 List。
type mockPoolAccountRepo struct {
	AccountRepository
	accounts []Account
}

func (m *mockPoolAccountRepo) List(_ context.Context, _ pagination.PaginationParams) ([]Account, *pagination.PaginationResult, error) {
	return m.accounts, nil, nil
}

func TestAnonymizeAccountTag_StableAndOpaque(t *testing.T) {
	tag1 := AnonymizeAccountTag(42)
	tag2 := AnonymizeAccountTag(42)
	if tag1 != tag2 {
		t.Fatalf("tag not stable: %q vs %q", tag1, tag2)
	}
	if !strings.HasPrefix(tag1, "node_") || len(tag1) != len("node_")+8 {
		t.Fatalf("unexpected tag format: %q", tag1)
	}
	if strings.Contains(tag1, "42") {
		t.Fatalf("tag leaks account id: %q", tag1)
	}
	if AnonymizeAccountTag(43) == tag1 {
		t.Fatal("different ids must map to different tags")
	}
}

func TestPublicNodeState_Mapping(t *testing.T) {
	now := time.Now()
	future := now.Add(time.Hour)

	tests := []struct {
		name    string
		account *Account
		want    string
	}{
		{
			name:    "ok",
			account: &Account{Status: StatusActive, Schedulable: true},
			want:    PublicPoolStateOK,
		},
		{
			name:    "down when not active",
			account: &Account{Status: StatusError, Schedulable: true},
			want:    PublicPoolStateDown,
		},
		{
			name:    "disabled when schedulable off",
			account: &Account{Status: StatusActive, Schedulable: false},
			want:    PublicPoolStateDisabled,
		},
		{
			name:    "limited when rate limited",
			account: &Account{Status: StatusActive, Schedulable: true, RateLimitResetAt: &future},
			want:    PublicPoolStateLimited,
		},
		{
			name:    "limited when overloaded",
			account: &Account{Status: StatusActive, Schedulable: true, OverloadUntil: &future},
			want:    PublicPoolStateLimited,
		},
		{
			name:    "limited when temp unschedulable",
			account: &Account{Status: StatusActive, Schedulable: true, TempUnschedulableUntil: &future},
			want:    PublicPoolStateLimited,
		},
		{
			name:    "down beats limited",
			account: &Account{Status: StatusError, Schedulable: true, RateLimitResetAt: &future},
			want:    PublicPoolStateDown,
		},
		{
			name:    "disabled beats limited",
			account: &Account{Status: StatusActive, Schedulable: false, RateLimitResetAt: &future},
			want:    PublicPoolStateDisabled,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := publicNodeState(tt.account); got != tt.want {
				t.Fatalf("publicNodeState() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPublicPoolStatus_SortsTruncatesAndStripsIdentity(t *testing.T) {
	future := time.Now().Add(time.Hour)
	accounts := []Account{
		{ID: 101, Name: "prod-claude@example.com", Platform: "anthropic", Status: StatusError, Schedulable: true},
		{ID: 102, Name: "prod-gpt@example.com", Platform: "openai", Status: StatusActive, Schedulable: true},
		{ID: 103, Name: "backup-gemini@example.com", Platform: "gemini", Status: StatusActive, Schedulable: true, RateLimitResetAt: &future},
		{ID: 104, Name: "prod-claude-2@example.com", Platform: "anthropic", Status: StatusActive, Schedulable: true},
	}
	svc := NewAccountService(&mockPoolAccountRepo{accounts: accounts}, nil)

	nodes, err := svc.PublicPoolStatus(context.Background())
	if err != nil {
		t.Fatalf("PublicPoolStatus() error: %v", err)
	}
	if len(nodes) != 4 {
		t.Fatalf("expected 4 nodes, got %d", len(nodes))
	}

	// 排序:ok → limited → down
	wantStates := []string{PublicPoolStateOK, PublicPoolStateOK, PublicPoolStateLimited, PublicPoolStateDown}
	for i, want := range wantStates {
		if nodes[i].State != want {
			t.Fatalf("node %d state = %q, want %q (full: %+v)", i, nodes[i].State, want, nodes)
		}
	}

	// 脱敏:不得携带名称/邮箱/真实 ID
	for _, n := range nodes {
		if strings.Contains(n.Tag, "@") || strings.Contains(n.Platform, "@") {
			t.Fatalf("node leaks identity: %+v", n)
		}
		if !strings.HasPrefix(n.Tag, "node_") {
			t.Fatalf("unexpected tag: %q", n.Tag)
		}
	}
}

func TestPublicPoolStatus_TruncatesToMaxNodes(t *testing.T) {
	accounts := make([]Account, 0, publicPoolMaxNodes+5)
	for i := 0; i < publicPoolMaxNodes+5; i++ {
		accounts = append(accounts, Account{
			ID: int64(1000 + i), Platform: "openai", Status: StatusActive, Schedulable: true,
		})
	}
	svc := NewAccountService(&mockPoolAccountRepo{accounts: accounts}, nil)

	nodes, err := svc.PublicPoolStatus(context.Background())
	if err != nil {
		t.Fatalf("PublicPoolStatus() error: %v", err)
	}
	if len(nodes) != publicPoolMaxNodes {
		t.Fatalf("expected truncation to %d nodes, got %d", publicPoolMaxNodes, len(nodes))
	}
}

func TestPublicStateRank_Ordering(t *testing.T) {
	if !(publicStateRank(PublicPoolStateOK) < publicStateRank(PublicPoolStateLimited) &&
		publicStateRank(PublicPoolStateLimited) < publicStateRank(PublicPoolStateDown) &&
		publicStateRank(PublicPoolStateDown) < publicStateRank(PublicPoolStateDisabled)) {
		t.Fatal("state ranks must order ok < limited < down < disabled")
	}
}
