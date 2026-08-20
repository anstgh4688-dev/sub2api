package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// TestGeminiImages_AdapterBodyFlowsThroughForwardNative 是 Gemini Images adapter
// 的核心复用链路（规格 7.2/9.1）：ParseGeminiImagesRequest → BuildGeminiImagesGenerateContentBody
// → GeminiMessagesCompatService.ForwardNative（假上游 HTTP 返回含 inlineData 的
// Gemini 响应）→ 图片计数被观测计入 ForwardResult → CollectGeminiImages 归一化。
//
// 锁定两个不变量：
//  1. 上游请求是 generateContent 形状（路径 + x-goog-api-key 凭证）；
//  2. 上游返回的图片数量经 ForwardNative 的观测（gemini_image_output_accounting.go）
//     被计入 ForwardResult.ImageCount，供计费按真实输出数量使用。
func TestGeminiImages_AdapterBodyFlowsThroughForwardNative(t *testing.T) {
	gin.SetMode(gin.TestMode)

	upstreamBody := `{
		"candidates": [
			{
				"content": {
					"parts": [
						{"inlineData": {"mimeType": "image/png", "data": "aGVsbG8="}},
						{"inlineData": {"mimeType": "image/jpeg", "data": "d29ybGQ="}}
					]
				},
				"finishReason": "STOP"
			}
		],
		"usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5}
	}`
	httpStub := &geminiCompatHTTPUpstreamStub{
		response: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(upstreamBody)),
		},
	}
	svc := &GeminiMessagesCompatService{
		httpUpstream: httpStub,
		cfg:          &config.Config{},
	}
	account := &Account{
		ID:       101,
		Platform: PlatformGemini,
		Type:     AccountTypeAPIKey,
		Credentials: map[string]any{
			"api_key": "sk-gemini-test",
		},
		Concurrency: 1,
	}

	// adapter 请求构造
	parsed, err := ParseGeminiImagesRequest([]byte(`{
		"model": "gemini-2.5-flash-image",
		"prompt": "a red cat",
		"aspect_ratio": "16:9",
		"resolution": "1k",
		"n": 1
	}`))
	require.NoError(t, err)
	geminiBody, err := BuildGeminiImagesGenerateContentBody(parsed)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)

	// 经共享 ForwardNative 转发
	result, fwdErr := svc.ForwardNative(context.Background(), c, account, parsed.Model, "generateContent", false, geminiBody)
	require.NoError(t, fwdErr)

	// 不变量 1：上游请求是 generateContent 形状 + API Key 凭证
	require.NotNil(t, httpStub.lastReq)
	require.Equal(t, http.MethodPost, httpStub.lastReq.Method)
	require.Equal(t, "/v1beta/models/gemini-2.5-flash-image:generateContent", httpStub.lastReq.URL.Path)
	require.Equal(t, "sk-gemini-test", httpStub.lastReq.Header.Get("x-goog-api-key"))

	// 不变量 2：图片输出数被观测计入计费
	require.Equal(t, 2, result.ImageCount)

	// adapter 归一化：同一上游体可解析出两幅图
	images, err := CollectGeminiImages([]byte(upstreamBody))
	require.NoError(t, err)
	require.Len(t, images, 2)
	require.Equal(t, "image/png", images[0].MimeType)
	require.Equal(t, "image/jpeg", images[1].MimeType)
}

// TestGeminiImages_ForwardNativeSurfacesUpstreamError 上游 4xx 时 ForwardNative
// 以错误返回（客户端错误不触发重试），错误消息可从返回错误提取（规格 8/9.1）。
func TestGeminiImages_ForwardNativeSurfacesUpstreamError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	httpStub := &geminiCompatHTTPUpstreamStub{
		response: &http.Response{
			StatusCode: http.StatusBadRequest,
			Header: http.Header{
				"Content-Type": []string{"application/json"},
				"X-Request-Id": []string{"req-upstream-1"},
			},
			Body: io.NopCloser(strings.NewReader(`{"error":{"message":"invalid_argument"}}`)),
		},
	}
	svc := &GeminiMessagesCompatService{
		httpUpstream: httpStub,
		cfg:          &config.Config{},
	}
	account := &Account{
		ID:       101,
		Platform: PlatformGemini,
		Type:     AccountTypeAPIKey,
		Credentials: map[string]any{
			"api_key": "sk-gemini-test",
		},
		Concurrency: 1,
	}

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)

	result, err := svc.ForwardNative(context.Background(), c, account, "gemini-2.5-flash-image", "generateContent", false, []byte(`{"contents":[{"parts":[{"text":"x"}]}]}`))
	require.Error(t, err)
	require.Nil(t, result)
	// 上游错误消息可通过 ExtractUpstreamErrorMessage 从响应中提取，供 handler 映射
	require.Contains(t, rec.Body.String(), "invalid_argument")
}

// TestGeminiImages_ForwardNativeDerivesImageSize 锁定规格 9.1"按真实输出尺寸计费"：
// adapter 把 resolution 映射进 generateContent 的 imageConfig.imageSize，ForwardNative
// 从请求体推导 ImageSize，供计费按尺寸定价使用。
func TestGeminiImages_ForwardNativeDerivesImageSize(t *testing.T) {
	gin.SetMode(gin.TestMode)

	httpStub := &geminiCompatHTTPUpstreamStub{
		response: &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"candidates": [
					{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": "aGVsbG8="}}]}}
				]
			}`)),
		},
	}
	svc := &GeminiMessagesCompatService{httpUpstream: httpStub, cfg: &config.Config{}}
	account := &Account{
		ID:          101,
		Platform:    PlatformGemini,
		Type:        AccountTypeAPIKey,
		Credentials: map[string]any{"api_key": "sk-gemini-test"},
		Concurrency: 1,
	}

	parsed, err := ParseGeminiImagesRequest([]byte(`{
		"model": "gemini-2.5-flash-image",
		"prompt": "a cat",
		"resolution": "2K",
		"n": 1
	}`))
	require.NoError(t, err)
	geminiBody, err := BuildGeminiImagesGenerateContentBody(parsed)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)

	result, fwdErr := svc.ForwardNative(context.Background(), c, account, parsed.Model, "generateContent", false, geminiBody)
	require.NoError(t, fwdErr)
	require.Equal(t, "2K", result.ImageSize)
	require.Equal(t, "2K", result.ImageInputSize)
	require.Equal(t, 1, result.ImageCount)
}
