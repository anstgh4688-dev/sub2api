/**
 * Frontend's single registry of image model capabilities.
 *
 * V1 recognition scope matches the backend gateway:
 *   - GPT:    gpt-image-*
 *   - Gemini: gemini-2.5-flash-image*, gemini-3-pro-image*, gemini-3.1-flash-image*
 *   - Grok:   grok-imagine*
 *
 * Do not broaden this to "model name contains image". Unknown models are
 * surfaced as an explicit empty state, never silently defaulted.
 */

import type { ImageModelProfile, ImageProvider } from './types'

export const imageModelProfiles: readonly ImageModelProfile[] = [
  {
    provider: 'openai',
    matches: (model) => /^gpt-image-/i.test(model),
    supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
    supportedQualities: ['low', 'medium', 'high', 'auto'],
    supportedAspectRatios: undefined,
    supportedResolutions: undefined,
    maxImages: 10,
    defaultValues: { n: 1, size: '1024x1024', quality: 'auto' },
  },
  {
    provider: 'gemini',
    matches: (model) =>
      /^gemini-(2\.5-flash-image|3-pro-image|3\.1-flash-image)(-|$)/i.test(model),
    supportedSizes: undefined,
    supportedQualities: undefined,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportedResolutions: ['1K', '2K', '4K'],
    maxImages: 1,
    defaultValues: { n: 1 },
  },
  {
    provider: 'grok',
    // 匹配 Grok 图片模型（grok-imagine 别名 / -image / -image-quality / -edit），
    // 用负向前瞻排除同前缀的视频模型 grok-imagine-video*（规格 6.2：不做宽泛判断）。
    matches: (model) => /^grok-imagine(?!-video)/i.test(model),
    supportedSizes: undefined,
    supportedQualities: undefined,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportedResolutions: ['1K', '2K', '4K'],
    maxImages: 10,
    defaultValues: { n: 1 },
  },
]

/** 返回匹配给定模型的 profile；无匹配返回 undefined（调用方展示明确空状态）。 */
export function resolveImageModelProfile(model: string): ImageModelProfile | undefined {
  return imageModelProfiles.find((profile) => profile.matches(model))
}

/** 从 /v1/models 的模型列表中筛出工作台可用的图片模型。 */
export function filterImageModels(
  modelIds: string[],
  provider?: ImageProvider,
): string[] {
  if (!Array.isArray(modelIds)) return []
  return modelIds
    .map((id) => String(id ?? '').trim())
    .filter((id) => id !== '')
    .filter((id) => {
      const profile = resolveImageModelProfile(id)
      if (!profile) return false
      return provider === undefined || profile.provider === provider
    })
}
