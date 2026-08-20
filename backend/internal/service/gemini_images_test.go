package service

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestParseGeminiImagesRequest_Valid(t *testing.T) {
	body := []byte(`{
		"model": "gemini-2.5-flash-image",
		"prompt": "  a red cat  ",
		"aspect_ratio": "16:9",
		"resolution": "1k",
		"n": 1
	}`)
	req, err := ParseGeminiImagesRequest(body)
	require.NoError(t, err)
	require.Equal(t, "gemini-2.5-flash-image", req.Model)
	require.Equal(t, "a red cat", req.Prompt)
	require.Equal(t, "16:9", req.AspectRatio)
	require.Equal(t, "1K", req.Resolution) // 小写 1k 被规范化为 1K
	require.Equal(t, 1, req.N)
}

func TestParseGeminiImagesRequest_DefaultNIsOne(t *testing.T) {
	body := []byte(`{"model": "gemini-3-pro-image", "prompt": "draw a cat"}`)
	req, err := ParseGeminiImagesRequest(body)
	require.NoError(t, err)
	require.Equal(t, 1, req.N)
}

func TestParseGeminiImagesRequest_Errors(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr string
	}{
		{"empty body", ``, "request body is empty"},
		{"invalid json", `{`, "failed to parse request body"},
		{"missing model", `{"prompt": "x"}`, "model is required"},
		{"unsupported model", `{"model": "gpt-image-2", "prompt": "x"}`, "not a supported Gemini image model"},
		{"missing prompt", `{"model": "gemini-2.5-flash-image"}`, "prompt is required"},
		{"blank prompt", `{"model": "gemini-2.5-flash-image", "prompt": "   "}`, "prompt is required"},
		{"n not 1", `{"model": "gemini-2.5-flash-image", "prompt": "x", "n": 2}`, "n must be 1"},
		{"invalid aspect_ratio", `{"model": "gemini-2.5-flash-image", "prompt": "x", "aspect_ratio": "21:9"}`, "aspect_ratio must be one of [1:1 16:9 9:16 4:3 3:4]"},
		{"invalid resolution", `{"model": "gemini-2.5-flash-image", "prompt": "x", "resolution": "8K"}`, "resolution must be one of [1K 2K 4K]"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseGeminiImagesRequest([]byte(tc.body))
			require.Error(t, err)
			require.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

func TestIsGeminiImageModel(t *testing.T) {
	require.True(t, IsGeminiImageModel("gemini-2.5-flash-image"))
	require.True(t, IsGeminiImageModel("gemini-2.5-flash-image-preview"))
	require.True(t, IsGeminiImageModel("gemini-3-pro-image"))
	require.True(t, IsGeminiImageModel("gemini-3.1-flash-image"))
	require.False(t, IsGeminiImageModel("gemini-2.5-pro"))
	require.False(t, IsGeminiImageModel("gpt-image-2"))
	require.False(t, IsGeminiImageModel("grok-imagine"))
}

func TestBuildGeminiImagesGenerateContentBody(t *testing.T) {
	req := &GeminiImagesRequest{
		Model:       "gemini-2.5-flash-image",
		Prompt:      "a red cat",
		AspectRatio: "16:9",
		Resolution:  "1k",
		N:           1,
	}
	body, err := BuildGeminiImagesGenerateContentBody(req)
	require.NoError(t, err)

	require.Equal(t, "a red cat", gjson.GetBytes(body, "contents.0.parts.0.text").String())
	require.Equal(t, "user", gjson.GetBytes(body, "contents.0.role").String())
	require.Equal(t, "TEXT", gjson.GetBytes(body, "generationConfig.responseModalities.0").String())
	require.Equal(t, "IMAGE", gjson.GetBytes(body, "generationConfig.responseModalities.1").String())
	require.Equal(t, "16:9", gjson.GetBytes(body, "generationConfig.imageConfig.aspectRatio").String())
	require.Equal(t, "1K", gjson.GetBytes(body, "generationConfig.imageConfig.imageSize").String())

	// 不透传其他 provider 字段
	raw := gjson.ParseBytes(body)
	require.False(t, raw.Get("generationConfig.size").Exists())
	require.False(t, raw.Get("generationConfig.quality").Exists())
	require.False(t, raw.Get("background").Exists())
}

func TestBuildGeminiImagesGenerateContentBody_NoImageConfigWhenEmpty(t *testing.T) {
	req := &GeminiImagesRequest{Model: "gemini-2.5-flash-image", Prompt: "cat", N: 1}
	body, err := BuildGeminiImagesGenerateContentBody(req)
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(body, "generationConfig.imageConfig").Exists())
}

func TestCollectGeminiImages_MultipleCandidatesAndParts(t *testing.T) {
	// 第一个 candidate 两张图，第二个 candidate 一张图 + 一段文本
	payload := `{
		"candidates": [
			{
				"content": {
					"parts": [
						{"inlineData": {"mimeType": "image/png", "data": "aGVsbG8="}},
						{"text": "some text"},
						{"inlineData": {"mimeType": "image/jpeg", "data": "d29ybGQ="}}
					]
				}
			},
			{
				"content": {
					"parts": [
						{"inlineData": {"mimeType": "image/webp", "data": "Zm9vYmFy"}}
					]
				}
			}
		]
	}`
	images, err := CollectGeminiImages([]byte(payload))
	require.NoError(t, err)
	require.Len(t, images, 3)
	require.Equal(t, "image/png", images[0].MimeType)
	require.Equal(t, "aGVsbG8=", images[0].Base64)
	require.Equal(t, "image/webp", images[2].MimeType)
}

func TestCollectGeminiImages_SnakeCaseInlineData(t *testing.T) {
	payload := `{
		"candidates": [
			{"content": {"parts": [{"inline_data": {"mime_type": "image/png", "data": "aGVsbG8="}}]}}
		]
	}`
	images, err := CollectGeminiImages([]byte(payload))
	require.NoError(t, err)
	require.Len(t, images, 1)
	require.Equal(t, "image/png", images[0].MimeType)
	require.Equal(t, "aGVsbG8=", images[0].Base64)
}

func TestCollectGeminiImages_Errors(t *testing.T) {
	cases := []struct {
		name    string
		payload string
	}{
		{"no candidates", `{}`},
		{"no parts", `{"candidates": [{"content": {"parts": []}}]}`},
		{"text only", `{"candidates": [{"content": {"parts": [{"text": "hi"}]}}]}`},
		{"non-image mime", `{"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "application/json", "data": "e30="}}]}}]}`},
		{"invalid base64", `{"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": "!!!"}}]}}]}`},
		{"empty data", `{"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": ""}}]}}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := CollectGeminiImages([]byte(tc.payload))
			require.Error(t, err)
			require.Contains(t, err.Error(), "no image parts")
		})
	}
}

func TestNormalizeGeminiImagesResponse_Shape(t *testing.T) {
	payload := `{
		"candidates": [
			{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": "aGVsbG8="}}]}}
		]
	}`
	out, err := NormalizeGeminiImagesResponse([]byte(payload))
	require.NoError(t, err)

	var parsed map[string]any
	require.NoError(t, json.Unmarshal(out, &parsed))
	require.NotZero(t, parsed["created"])
	data, ok := parsed["data"].([]any)
	require.True(t, ok)
	require.Len(t, data, 1)
	item := data[0].(map[string]any)
	require.Equal(t, "aGVsbG8=", item["b64_json"])
	require.Equal(t, "image/png", item["mime_type"])
}

func TestNormalizeGeminiImagesResponse_NoImagesReturnsError(t *testing.T) {
	_, err := NormalizeGeminiImagesResponse([]byte(`{"candidates": [{"content": {"parts": [{"text": "hi"}]}}]}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "no image parts")
}
