package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/tidwall/gjson"
)

// GeminiImagesRequest 是 Gemini 同步文生图请求的解析结果。
// 与 OpenAI Images 请求共用同一个网关入口，但只保留 Gemini 支持/关心的字段。
type GeminiImagesRequest struct {
	Model       string
	Prompt      string
	AspectRatio string
	Resolution  string
	N           int
}

// Gemini 图片请求允许的 aspect_ratio 值域，与前端 modelProfiles 及
// antigravity.GeminiImageConfig 注释口径一致（规格 7.4：不凭经验硬编码非法组合）。
var geminiImagesAspectRatios = map[string]struct{}{
	"1:1": {}, "16:9": {}, "9:16": {}, "4:3": {}, "3:4": {},
}

// ParseGeminiImagesRequest 解析并校验 OpenAI-compatible images 请求体，得到
// Gemini adapter 的入参。V1 约束：
//   - prompt 必填且边界 trim，空字符串返回明确 400；
//   - model 必填且必须是 Gemini 图片模型；
//   - n 只允许 1，其他值返回明确 400，不静默忽略；
//   - aspect_ratio / resolution 可选，但必须落在仓库支持枚举内（规格 8：
//     参数错误返回 400 并指出允许值；后端独立验证，不信任前端过滤）；
//   - GPT/Grok 专属字段（size/quality/background/output_format 等）解析但不透传。
func ParseGeminiImagesRequest(body []byte) (*GeminiImagesRequest, error) {
	if len(body) == 0 {
		return nil, fmt.Errorf("request body is empty")
	}
	if !gjson.ValidBytes(body) {
		return nil, fmt.Errorf("failed to parse request body")
	}

	req := &GeminiImagesRequest{
		Model:       strings.TrimSpace(gjson.GetBytes(body, "model").String()),
		Prompt:      strings.TrimSpace(gjson.GetBytes(body, "prompt").String()),
		AspectRatio: strings.TrimSpace(gjson.GetBytes(body, "aspect_ratio").String()),
		Resolution:  strings.TrimSpace(gjson.GetBytes(body, "resolution").String()),
		N:           1,
	}
	if n := gjson.GetBytes(body, "n").Int(); n != 0 {
		req.N = int(n)
	}

	if req.Model == "" {
		return nil, fmt.Errorf("model is required")
	}
	if !IsGeminiImageModel(req.Model) {
		return nil, fmt.Errorf("model %q is not a supported Gemini image model", req.Model)
	}
	if req.Prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if req.N != 1 {
		return nil, fmt.Errorf("n must be 1 for Gemini image generation, got %d", req.N)
	}
	if req.AspectRatio != "" {
		if _, ok := geminiImagesAspectRatios[req.AspectRatio]; !ok {
			return nil, fmt.Errorf("aspect_ratio must be one of [1:1 16:9 9:16 4:3 3:4], got %q", req.AspectRatio)
		}
	}
	if req.Resolution != "" {
		normalized := strings.ToUpper(req.Resolution)
		if normalized != ImageBillingSize1K && normalized != ImageBillingSize2K && normalized != ImageBillingSize4K {
			return nil, fmt.Errorf("resolution must be one of [1K 2K 4K], got %q", req.Resolution)
		}
		req.Resolution = normalized
	}
	return req, nil
}

// IsGeminiImageModel 判断模型是否为后端支持的 Gemini 图片生成模型。
// 与前端 modelProfiles 保持一致，后端必须独立验证，不信任前端过滤。
func IsGeminiImageModel(model string) bool {
	return isImageGenerationModel(model)
}

// BuildGeminiImagesGenerateContentBody 把解析后的请求映射为 Gemini
// generateContent 请求体。只输出 Gemini 认识的字段，不透传其他 provider 参数。
func BuildGeminiImagesGenerateContentBody(req *GeminiImagesRequest) ([]byte, error) {
	if req == nil {
		return nil, fmt.Errorf("missing gemini images request")
	}
	generationConfig := map[string]any{
		"responseModalities": []string{"TEXT", "IMAGE"},
	}
	if req.AspectRatio != "" || req.Resolution != "" {
		imageConfig := map[string]any{}
		if req.AspectRatio != "" {
			imageConfig["aspectRatio"] = req.AspectRatio
		}
		if req.Resolution != "" {
			imageConfig["imageSize"] = strings.ToUpper(req.Resolution)
		}
		generationConfig["imageConfig"] = imageConfig
	}

	payload := map[string]any{
		"contents": []any{
			map[string]any{
				"role":  "user",
				"parts": []any{map[string]any{"text": req.Prompt}},
			},
		},
		"generationConfig": generationConfig,
	}
	return json.Marshal(payload)
}

// GeminiImageItem 是从 Gemini 响应 part 中提取的一幅内联图片。
type GeminiImageItem struct {
	Base64   string
	MimeType string
}

// NormalizeGeminiImagesResponse 把 Gemini generateContent 响应归一化为统一
// OpenAI Images 形状。遍历所有 candidates 的 parts，收集 MIME 为 image/* 的
// inlineData / inline_data 内容。若响应成功但没有图片 part，返回明确错误，
// 不能返回 200 + data: [] 伪装成功。
func NormalizeGeminiImagesResponse(payload []byte) ([]byte, error) {
	images, err := CollectGeminiImages(payload)
	if err != nil {
		return nil, err
	}
	data := make([]any, 0, len(images))
	for _, img := range images {
		data = append(data, map[string]any{
			"b64_json":  img.Base64,
			"mime_type": img.MimeType,
		})
	}
	out := map[string]any{
		"created": time.Now().Unix(),
		"data":    data,
	}
	return json.Marshal(out)
}

// CollectGeminiImages 提取 Gemini generateContent 响应中的所有内联图片。
// 同时识别 camelCase 的 inlineData 与 snake_case 的 inline_data；只接受受支持
// 的 image/* MIME 且 base64 可解码的内容。无图片时返回明确错误。
func CollectGeminiImages(payload []byte) ([]GeminiImageItem, error) {
	if len(payload) == 0 || !gjson.ValidBytes(payload) {
		return nil, fmt.Errorf("invalid Gemini response payload")
	}

	var images []GeminiImageItem
	gjson.GetBytes(payload, "candidates").ForEach(func(_, candidate gjson.Result) bool {
		candidate.Get("content.parts").ForEach(func(_, part gjson.Result) bool {
			if item, ok := geminiImagePartToItem(part); ok {
				images = append(images, item)
			}
			return true
		})
		return true
	})

	if len(images) == 0 {
		return nil, fmt.Errorf("Gemini response contains no image parts")
	}
	return images, nil
}

// geminiImagePartToItem 从 Gemini 响应 part 中提取一幅内联图片。
func geminiImagePartToItem(part gjson.Result) (GeminiImageItem, bool) {
	inline := part.Get("inlineData")
	if !inline.Exists() {
		inline = part.Get("inline_data")
	}
	if !inline.Exists() {
		return GeminiImageItem{}, false
	}

	mimeType := strings.ToLower(strings.TrimSpace(inline.Get("mimeType").String()))
	if mimeType == "" {
		mimeType = strings.ToLower(strings.TrimSpace(inline.Get("mime_type").String()))
	}
	if !isGeminiInlineImageMIMEType(mimeType) {
		return GeminiImageItem{}, false
	}

	data := strings.TrimSpace(inline.Get("data").String())
	if !isValidBase64(data) {
		return GeminiImageItem{}, false
	}
	return GeminiImageItem{Base64: data, MimeType: mimeType}, true
}
