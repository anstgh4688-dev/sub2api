package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// TestGeminiImages_RejectsGroupWithoutImagePermission 验证 Gemini 图片链路在
// 分组禁用 allow_image_generation 时返回 403。该门在所有底层 service 调用之前
// 生效，无需 mock 转发/计费。
func TestGeminiImages_RejectsGroupWithoutImagePermission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	groupID := int64(1)
	apiKey := &service.APIKey{
		ID:      10,
		GroupID: &groupID,
		Group: &service.Group{
			ID:                   groupID,
			AllowImageGeneration: false,
		},
		User: &service.User{ID: 20},
	}
	subject := middleware.AuthSubject{UserID: 20, Concurrency: 1}

	body := `{"model":"gemini-2.5-flash-image","prompt":"draw a cat"}`
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(body))
	c.Set(string(middleware.ContextKeyAPIKey), apiKey)
	c.Set(string(middleware.ContextKeyUser), subject)

	h := &GatewayHandler{}
	h.GeminiImages(c)

	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Equal(t, "permission_error", gjson.GetBytes(rec.Body.Bytes(), "error.type").String())
	require.Contains(t, rec.Body.String(), service.ImageGenerationPermissionMessage())
}

// TestGeminiImages_RejectsInvalidRequestBeforeServices 验证参数校验（n != 1、
// 非图片模型等）在任何底层依赖之前以 400 返回，不依赖转发/计费组件。
func TestGeminiImages_RejectsInvalidRequestBeforeServices(t *testing.T) {
	gin.SetMode(gin.TestMode)
	groupID := int64(1)
	apiKey := &service.APIKey{
		ID:      10,
		GroupID: &groupID,
		Group:   &service.Group{ID: groupID, AllowImageGeneration: true},
		User:    &service.User{ID: 20},
	}
	subject := middleware.AuthSubject{UserID: 20, Concurrency: 1}

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"model":"gemini-2.5-flash-image","prompt":"x","n":2}`))
	c.Set(string(middleware.ContextKeyAPIKey), apiKey)
	c.Set(string(middleware.ContextKeyUser), subject)

	h := &GatewayHandler{}
	h.GeminiImages(c)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Equal(t, "invalid_request_error", gjson.GetBytes(rec.Body.Bytes(), "error.type").String())
	require.Contains(t, rec.Body.String(), "n must be 1")
}
