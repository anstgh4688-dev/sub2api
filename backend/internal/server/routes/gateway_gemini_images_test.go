package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

// TestGatewayRoutesGeminiImagesDispatchToGeminiAdapter 是 Gemini Images adapter 的
// 契约测试（RED）：Gemini 分组访问 /v1/images/generations 必须路由到 Gemini 图片
// adapter，而不是走"该平台不支持"的 404 兜底。
//
// 当前实现（adapter 未落地前）会让该测试失败：default 分支返回 404
// "Images API is not supported for this platform"。Slice 2 落地
// gateway.go imagesHandler 的 gemini 分支后转绿。
func TestGatewayRoutesGeminiImagesDispatchToGeminiAdapter(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformGemini)

	for _, path := range []string{
		"/v1/images/generations",
		"/images/generations",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"gemini-2.5-flash-image","prompt":"draw a cat"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
		require.NotEqual(t, http.StatusNotFound, w.Code,
			"path=%s should route Gemini platform to the Gemini images adapter, got %d: %s",
			path, w.Code, w.Body.String())
	}
}

// TestGatewayRoutesUnsupportedPlatformImagesStayUnsupported 锁定现有行为：没有图片
// adapter 的平台（如 Anthropic）保持原样返回 404。这是 Slice 1 的 characterization，
// 防止 unsupported 行为被误改。
func TestGatewayRoutesUnsupportedPlatformImagesStayUnsupported(t *testing.T) {
	router := newGatewayRoutesTestRouter(service.PlatformAnthropic)

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"model":"claude-3-5-sonnet","prompt":"draw a cat"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	require.Equal(t, http.StatusNotFound, w.Code)
	require.Contains(t, w.Body.String(), "Images API is not supported for this platform")
}
