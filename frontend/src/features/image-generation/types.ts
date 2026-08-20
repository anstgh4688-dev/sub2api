/**
 * Image generation workbench domain types.
 *
 * V1 is synchronous text-to-image only: no history, no persistence, no batch.
 * These types are the single source of truth shared by the view, the API layer
 * and the pure helper modules (modelProfiles / normalizeResponse).
 */

import type { ApiKey } from '@/types'

export type ImageProvider = 'openai' | 'gemini' | 'grok'

/** Parameters the workbench can send for the currently selected model. */
export interface ImageGenerationSettings {
  /** GPT: image size, e.g. '1024x1024' */
  size?: string
  /** GPT: quality, e.g. 'high' */
  quality?: string
  /** GPT: background transparency, e.g. 'transparent' */
  background?: string
  /** GPT: output container format, e.g. 'png' */
  output_format?: 'png' | 'jpeg' | 'webp'
  /** Gemini / Grok: aspect ratio, e.g. '1:1' */
  aspect_ratio?: string
  /** Gemini / Grok: resolution, e.g. '1K' */
  resolution?: string
  /** number of images (GPT / Grok; Gemini fixed to 1) */
  n?: number
}

/** Unified request sent to the gateway for every provider. */
export interface ImageGenerationRequest extends ImageGenerationSettings {
  model: string
  prompt: string
  response_format: 'b64_json'
}

/** Unified gateway response (OpenAI Images shape). */
export interface ImageGenerationResponse {
  created: number
  data: Array<{
    b64_json?: string
    url?: string
    revised_prompt?: string
    mime_type?: string
  }>
}

/** A single generated image kept in memory (object URL, revoked on replace/unmount). */
export interface GeneratedImage {
  url: string
  mimeType: string
  /** 下载文件名，例如 sub2api-gemini-20260812-101500-0.png */
  downloadName: string
  /** 图片 Blob（仅对象 URL 来源存在），用于免二次请求直接下载。 */
  blob?: Blob
}

/** A gateway response error surfaced to the user (safe summary + status + request id). */
export interface ImageGenerationError {
  message: string
  status?: number
  requestId?: string
}

/**
 * Profile that maps a provider + model to the capabilities the workbench knows
 * about. The view, the settings panel and the request serializer all read from
 * this registry — no second source of truth.
 */
export interface ImageModelProfile {
  provider: ImageProvider
  matches: (model: string) => boolean
  supportedSizes?: readonly string[]
  supportedAspectRatios?: readonly string[]
  supportedQualities?: readonly string[]
  supportedResolutions?: readonly string[]
  maxImages: number
  defaultValues: Readonly<ImageGenerationSettings>
}

/** 本人合格 Key：激活、分组启用、平台为 openai/gemini/grok、允许生图、非 composite。 */
export function isEligibleImageKey(key: ApiKey | null | undefined): key is ApiKey {
  if (!key || key.status !== 'active') return false
  const group = key.group
  if (!group || group.status !== 'active') return false
  if (group.platform === 'composite') return false
  if (group.platform !== 'openai' && group.platform !== 'gemini' && group.platform !== 'grok') return false
  return group.allow_image_generation === true
}
