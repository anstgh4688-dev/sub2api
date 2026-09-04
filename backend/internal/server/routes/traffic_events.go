package routes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

const (
	// trafficStreamReplayCount 是新连接建立时重放的最近事件数，
	// 让刚打开的页面立刻看到"正在流动"的流量。
	trafficStreamReplayCount = 20
	trafficStreamHeartbeat   = 25 * time.Second
	// trafficStreamMaxClients 限制并发 SSE 连接数：公开端点不做身份认证，
	// 每个连接常驻一个 goroutine，必须设防打爆上限。
	trafficStreamMaxClients = 256
)

var trafficStreamClients atomic.Int64

// RegisterTrafficEventRoutes 注册匿名化实时流量事件流（公开，供首页请求流光使用）。
func RegisterTrafficEventRoutes(v1 *gin.RouterGroup) {
	v1.GET("/events/traffic", streamTrafficEvents)
}

func streamTrafficEvents(c *gin.Context) {
	if trafficStreamClients.Load() >= trafficStreamMaxClients {
		c.JSON(http.StatusServiceUnavailable, gin.H{"message": "too many stream clients"})
		return
	}
	trafficStreamClients.Add(1)
	defer trafficStreamClients.Add(-1)

	w := c.Writer
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// nginx 等反代默认缓冲 SSE，必须显式关闭
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		return
	}

	send := func(evt service.TrafficEvent) bool {
		payload, err := json.Marshal(evt)
		if err != nil {
			return true // 序列化失败不应断开流
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	// 重放缓冲区里的最近事件
	for _, evt := range service.RecentTrafficEvents(trafficStreamReplayCount) {
		if !send(evt) {
			return
		}
	}

	events, cancel := service.SubscribeTrafficEvents()
	defer cancel()

	heartbeat := time.NewTicker(trafficStreamHeartbeat)
	defer heartbeat.Stop()

	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-events:
			if !ok {
				return
			}
			if !send(evt) {
				return
			}
		case <-heartbeat.C:
			// SSE 注释行作心跳，防止中间层因空闲断开
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
