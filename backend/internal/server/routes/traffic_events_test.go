package routes

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

func setupTrafficRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	RegisterTrafficEventRoutes(r.Group("/api/v1"))
	return r
}

func TestTrafficStream_ReplaysRecentEvents(t *testing.T) {
	service.PublishTrafficEvent(service.TrafficEvent{
		Time: time.Now(), Platform: "anthropic", Model: "claude-sonnet-4-5", DurationMs: 1234, Stream: true,
	})

	// 短生命周期请求:读取到首帧后主动取消,结束 SSE 循环
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/traffic", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		setupTrafficRouter().ServeHTTP(rec, req)
		close(done)
	}()

	deadline := time.After(2 * time.Second)
	for {
		if strings.Contains(rec.Body.String(), "claude-sonnet-4-5") {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("replayed event not found in stream body: %q", rec.Body.String())
		case <-time.After(10 * time.Millisecond):
		}
	}
	cancel()
	<-done

	if ct := rec.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("unexpected content type: %q", ct)
	}
	if rec.Header().Get("X-Accel-Buffering") != "no" {
		t.Fatal("expected X-Accel-Buffering: no header")
	}
}

func TestTrafficStream_RejectsWhenSaturated(t *testing.T) {
	trafficStreamClients.Store(trafficStreamMaxClients)
	defer trafficStreamClients.Store(0)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/traffic", nil)
	rec := httptest.NewRecorder()
	setupTrafficRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when saturated, got %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Result().Body)
	if !strings.Contains(string(body), "too many stream clients") {
		t.Fatalf("unexpected body: %s", body)
	}
}
