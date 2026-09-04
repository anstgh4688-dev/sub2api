package routes

import (
	"net/http"
	"sync"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

// poolStatusCacheTTL 是公开池状态端点的内存缓存时长。
// 控制台展示不需要秒级新鲜度，缓存既能挡住对 DB 的连续刷新，
// 也让端点在突发流量下保持 O(1)。
const poolStatusCacheTTL = 15 * time.Second

type poolStatusCache struct {
	mu        sync.RWMutex
	nodes     []service.PublicPoolNode
	fetchedAt time.Time
}

var publicPoolStatusCache poolStatusCache

// RegisterPoolStatusRoutes 注册匿名化账号池状态端点（公开，供首页控制台使用）。
func RegisterPoolStatusRoutes(v1 *gin.RouterGroup, accountService *service.AccountService) {
	v1.GET("/pool/status", getPublicPoolStatus(accountService))
}

func getPublicPoolStatus(accountService *service.AccountService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if nodes, ok := publicPoolStatusCache.get(); ok {
			c.JSON(http.StatusOK, poolStatusPayload(nodes))
			return
		}

		nodes, err := accountService.PublicPoolStatus(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load pool status"})
			return
		}
		publicPoolStatusCache.set(nodes)
		c.JSON(http.StatusOK, poolStatusPayload(nodes))
	}
}

func poolStatusPayload(nodes []service.PublicPoolNode) gin.H {
	if nodes == nil {
		nodes = []service.PublicPoolNode{}
	}
	return gin.H{
		"accounts":   nodes,
		"updated_at": time.Now(),
	}
}

func (c *poolStatusCache) get() ([]service.PublicPoolNode, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.fetchedAt.IsZero() || time.Since(c.fetchedAt) >= poolStatusCacheTTL {
		return nil, false
	}
	return c.nodes, true
}

func (c *poolStatusCache) set(nodes []service.PublicPoolNode) {
	c.mu.Lock()
	c.nodes = nodes
	c.fetchedAt = time.Now()
	c.mu.Unlock()
}

// resetPublicPoolStatusCacheForTest 清空缓存，仅供测试使用。
func resetPublicPoolStatusCacheForTest() {
	publicPoolStatusCache.mu.Lock()
	publicPoolStatusCache.nodes = nil
	publicPoolStatusCache.fetchedAt = time.Time{}
	publicPoolStatusCache.mu.Unlock()
}
