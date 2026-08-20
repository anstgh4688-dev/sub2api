package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// newTestCaptureWriter 基于 gin.CreateTestContext 的默认 writer 构造 capture-writer，
// 保证内嵌的 gin.ResponseWriter 实现完整（CloseNotify 等）。
func newTestCaptureWriter(t *testing.T, c *gin.Context) *geminiImageCaptureResponseWriter {
	t.Helper()
	capture := newGeminiImageCaptureResponseWriter(c.Writer)
	c.Writer = capture
	return capture
}

// TestGeminiImageCaptureResponseWriter_InterceptsData 锁定 capture-writer 的复用
// 机制：ForwardNative 的非流式路径通过 c.Data 写入上游响应，capture-writer 必须
// 拦截 status + body 而不落到真实 writer（规格 7.2 的基石）。
func TestGeminiImageCaptureResponseWriter_InterceptsData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	capture := newTestCaptureWriter(t, c)

	c.Data(http.StatusOK, "application/json", []byte(`{"candidates":[]}`))

	// 真实 writer 未被写入任何内容
	require.Zero(t, rec.Body.Len())
	require.Equal(t, http.StatusOK, capture.status)
	require.Equal(t, `{"candidates":[]}`, capture.buffer.String())
	require.Equal(t, http.StatusOK, capture.Status())
	require.True(t, capture.Written())
	require.Equal(t, 17, capture.Size())
}

// TestGeminiImageCaptureResponseWriter_RecordsUpstreamStatus 上游非 2xx 状态也应
// 被捕获，供 handler 映射为错误响应。
func TestGeminiImageCaptureResponseWriter_RecordsUpstreamStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	capture := newTestCaptureWriter(t, c)

	c.Data(http.StatusBadGateway, "application/json", []byte(`{"error":{"message":"boom"}}`))

	require.Equal(t, http.StatusBadGateway, capture.status)
	require.Equal(t, http.StatusBadGateway, capture.Status())
	require.Equal(t, `{"error":{"message":"boom"}}`, capture.buffer.String())
	require.Zero(t, rec.Body.Len())
}

// TestGeminiImageCaptureResponseWriter_HeaderCaptured c.Header 写入的响应头（如
// x-request-id）也应被捕获，供 handler 在错误响应中保留 request ID。
func TestGeminiImageCaptureResponseWriter_HeaderCaptured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	capture := newTestCaptureWriter(t, c)

	c.Header("X-Request-Id", "req-abc-123")
	c.Data(http.StatusOK, "application/json", []byte(`{}`))

	require.Equal(t, "req-abc-123", capture.Header().Get("X-Request-Id"))
	require.Zero(t, rec.Body.Len())
	require.Empty(t, rec.Header().Get("X-Request-Id"))
}

// TestGeminiImagesRequestID 锁定 request ID 提取：优先 x-request-id，兼容
// x-goog-request-id（规格 7.5/8 的可定位性要求）。
func TestGeminiImagesRequestID(t *testing.T) {
	require.Equal(t, "req-abc", geminiImagesRequestID(http.Header{
		"X-Request-Id": []string{"req-abc"},
	}))
	require.Equal(t, "req-gg-9", geminiImagesRequestID(http.Header{
		"X-Goog-Request-Id": []string{"req-gg-9"},
	}))
	require.Equal(t, "req-abc", geminiImagesRequestID(http.Header{
		"X-Request-Id":      []string{"req-abc"},
		"X-Goog-Request-Id": []string{"req-gg-9"},
	}))
	require.Equal(t, "", geminiImagesRequestID(nil))
	require.Equal(t, "", geminiImagesRequestID(http.Header{}))
}

// TestSetGeminiImageRequestID 验证空 request ID 不污染响应头。
func TestSetGeminiImageRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	setGeminiImageRequestID(c, "req-xyz")
	require.Equal(t, "req-xyz", rec.Header().Get("x-request-id"))

	setGeminiImageRequestID(c, "")
	require.Equal(t, "req-xyz", rec.Header().Get("x-request-id"))
}
