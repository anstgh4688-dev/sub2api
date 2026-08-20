package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/pkg/geminicli"
	"github.com/stretchr/testify/require"
)

// TestGeminiImagesUsageNeverCarriesSensitiveContent 锁定规格 10.2 的 persistence
// regression：usage 记录不得包含 prompt 原文、Base64 图片数据或结果 URL。
//
// 结构保证：recordUsageCoreInput（真正写 usage 行的输入）只有 RequestPayloadHash
// 一个承载请求体的字段，且 handler 用 HashUsageRequestPayload(body) 填它——是
// 单向 SHA-256，不含原文。这里验证：
//  1. recordUsageCoreInput 字段集中不存在 prompt/base64/url 之类字段；
//  2. HashUsageRequestPayload 输出是确定性的单向哈希，不含原始 JSON 片段。
func TestGeminiImagesUsageNeverCarriesSensitiveContent(t *testing.T) {
	// 1) 结构不变量：usage 输入结构不含任何敏感内容字段
	raw, err := json.Marshal(recordUsageCoreInput{})
	require.NoError(t, err)
	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &fields))
	for field := range fields {
		lower := strings.ToLower(field)
		require.False(t,
			strings.Contains(lower, "prompt") ||
				strings.Contains(lower, "base64") ||
				strings.Contains(lower, "image_url") ||
				strings.Contains(lower, "b64"),
			"usage input must not carry sensitive field %q", field,
		)
	}

	// 2) 哈希不变量：body 的 SHA-256 哈希不含原始内容、长度固定、确定性
	body := []byte(`{"model":"gemini-2.5-flash-image","prompt":"a very secret prompt","n":1}`)
	h1 := HashUsageRequestPayload(body)
	h2 := HashUsageRequestPayload(body)
	require.NotEmpty(t, h1)
	require.Equal(t, h1, h2)
	require.Len(t, h1, 64) // hex(sha256) = 64 chars
	require.False(t, strings.Contains(h1, "prompt"))
	require.False(t, strings.Contains(h1, "secret"))
	require.False(t, strings.Contains(h1, "gemini"))

	// 空 body 不产生哈希
	require.Equal(t, "", HashUsageRequestPayload(nil))
}

// TestGeminiImagesForwardResultCarriesNoImageBytes 规格 10.2：ForwardResult（用于
// usage 记录的图片计费字段）只携带数量/尺寸元数据，绝不携带图片 Base64 或 URL。
func TestGeminiImagesForwardResultCarriesNoImageBytes(t *testing.T) {
	result := &ForwardResult{
		ImageCount:       2,
		ImageSize:        "1K",
		ImageInputSize:   "1K",
		ImageOutputSizes: []string{"1K", "1K"},
	}
	raw, err := json.Marshal(result)
	require.NoError(t, err)
	s := string(raw)
	require.NotContains(t, s, "b64_json")
	require.NotContains(t, s, "base64")
	require.NotContains(t, s, "http")
	require.NotContains(t, s, "url")
}

// TestGeminiDefaultModelsExposeImageModels 锁定规格 6.3/6.2 的集成不变量：
// Gemini 分组的 /v1/models fallback 模型列表（geminicli.DefaultModels）必须至少
// 包含一个前端 modelProfiles 能识别的图片模型，否则工作台永远进入 no-image-model。
func TestGeminiDefaultModelsExposeImageModels(t *testing.T) {
	imageModelFound := false
	for _, m := range geminicliDefaultModels() {
		if IsGeminiImageModel(m) {
			imageModelFound = true
			break
		}
	}
	require.True(t, imageModelFound, "geminicli.DefaultModels must expose at least one Gemini image model")
}

// geminicliDefaultModels 返回 Gemini 分组 /v1/models 的 fallback 模型 ID 列表。
func geminicliDefaultModels() []string {
	models := geminicli.DefaultModels
	ids := make([]string, 0, len(models))
	for _, m := range models {
		ids = append(ids, m.ID)
	}
	return ids
}
