package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"

	"github.com/Wei-Shaw/sub2api/internal/pkg/pagination"
)

// PublicPoolNode 是首页控制台展示的匿名化账号节点。
// 刻意只包含平台与调度状态：不含真实账号 ID、名称、凭据类型、
// 订阅计划、用量等任何可溯源或敏感的信息。
type PublicPoolNode struct {
	Tag      string `json:"tag"`      // 匿名稳定标签，如 node_a1b2c3d4
	Platform string `json:"platform"` // anthropic / openai / gemini / ...
	State    string `json:"state"`    // ok / limited / down / disabled
}

const (
	// PublicPoolStateOK 可正常参与调度
	PublicPoolStateOK = "ok"
	// PublicPoolStateLimited 处于限流/过载/临时冷却窗口，调度降额
	PublicPoolStateLimited = "limited"
	// PublicPoolStateDown 账号状态异常（非 active）
	PublicPoolStateDown = "down"
	// PublicPoolStateDisabled 被手动移出调度
	PublicPoolStateDisabled = "disabled"

	// publicPoolMaxNodes 是公开端点返回的节点上限：首页控制台只展示
	// 少量行，全量返回既无用也扩大池规模的暴露面。
	publicPoolMaxNodes = 12
)

// AnonymizeAccountTag 把真实账号 ID 不可逆地映射为稳定的公开匿名标签。
// 同一账号跨请求、跨事件保持一致（供 ROUTED 高亮联动），
// 但从标签无法反推 ID 或枚举账号。
func AnonymizeAccountTag(id int64) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("sub2api:pool-node:%d", id)))
	return "node_" + hex.EncodeToString(sum[:])[:8]
}

// publicNodeState 把内部调度状态映射为公开的三态。
// 映射优先级与 IsSchedulable 的失败原因一一对应。
func publicNodeState(a *Account) string {
	if !a.IsActive() {
		return PublicPoolStateDown
	}
	if !a.Schedulable {
		return PublicPoolStateDisabled
	}
	if !a.IsSchedulable() {
		// active + 手动可调度，但处于限流/过载/临时冷却/配额超限窗口
		return PublicPoolStateLimited
	}
	return PublicPoolStateOK
}

// publicStateRank 用于排序：健康节点排前面，控制台首屏看到的
// 是池子"正在工作"的部分。
func publicStateRank(state string) int {
	switch state {
	case PublicPoolStateOK:
		return 0
	case PublicPoolStateLimited:
		return 1
	case PublicPoolStateDown:
		return 2
	default:
		return 3
	}
}

// PublicPoolStatus 返回匿名化的账号池状态快照，供公开端点使用。
// 节点按状态健康度排序并截断到 publicPoolMaxNodes。
func (s *AccountService) PublicPoolStatus(ctx context.Context) ([]PublicPoolNode, error) {
	accounts, _, err := s.accountRepo.List(ctx, pagination.PaginationParams{Page: 1, PageSize: 500})
	if err != nil {
		return nil, err
	}

	nodes := make([]PublicPoolNode, 0, len(accounts))
	for i := range accounts {
		acc := &accounts[i]
		nodes = append(nodes, PublicPoolNode{
			Tag:      AnonymizeAccountTag(acc.ID),
			Platform: acc.Platform,
			State:    publicNodeState(acc),
		})
	}

	sort.SliceStable(nodes, func(i, j int) bool {
		if ri, rj := publicStateRank(nodes[i].State), publicStateRank(nodes[j].State); ri != rj {
			return ri < rj
		}
		if nodes[i].Platform != nodes[j].Platform {
			return nodes[i].Platform < nodes[j].Platform
		}
		return nodes[i].Tag < nodes[j].Tag
	})

	if len(nodes) > publicPoolMaxNodes {
		nodes = nodes[:publicPoolMaxNodes]
	}
	return nodes, nil
}
