/**
 * Response normalization for the image generation workbench.
 *
 * The gateway returns the OpenAI Images shape for all three providers. Base64
 * payloads are converted to Blob object URLs; every created URL must be revoked
 * when replaced, cleared or unmounted (see GeneratedImage.revoke).
 */

import type { GeneratedImage, ImageGenerationError, ImageGenerationResponse } from './types'

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** 把请求的 output_format 归一化为可用的 MIME 类型（用于推导上游未返回 mime_type 时）。 */
export function mimeTypeFromOutputFormat(format: string | undefined): string {
  switch ((format || '').toLowerCase()) {
    case 'png':
      return 'image/png'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

function sanitizeMimeType(mime: string | undefined, fallback: string): string {
  const trimmed = (mime || '').trim().toLowerCase()
  return SUPPORTED_MIME_TYPES.has(trimmed) ? trimmed : fallback
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  // 兼容 data URL 前缀
  const b64 = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

/** 生成统一下载文件名：sub2api-{provider}-{yyyyMMdd-HHmmss}-{index}.{ext} */
export function buildDownloadName(
  provider: string,
  mimeType: string,
  index: number,
  date?: Date,
): string {
  const now = date || new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/gif' ? 'gif' : 'png'
  return `sub2api-${provider}-${stamp}-${index}.${ext}`
}

/**
 * 把网关响应归一化为页面内存中的 GeneratedImage 列表。
 * 优先取 b64_json；只有 URL 时直接引用（下载仍可用）。无效图片项被丢弃。
 */
export function normalizeImageResponse(
  response: ImageGenerationResponse,
  provider: string,
  fallbackOutputFormat: string | undefined,
): GeneratedImage[] {
  const fallbackMime = mimeTypeFromOutputFormat(fallbackOutputFormat)
  if (!response || !Array.isArray(response.data)) return []
  const images: GeneratedImage[] = []
  response.data.forEach((item, index) => {
    if (!item) return
    if (typeof item.b64_json === 'string' && item.b64_json.trim() !== '') {
      const mimeType = sanitizeMimeType(item.mime_type, fallbackMime)
      const blob = base64ToBlob(item.b64_json, mimeType)
      const url = URL.createObjectURL(blob)
      images.push({
        url,
        mimeType,
        blob,
        downloadName: buildDownloadName(provider, mimeType, index),
      })
      return
    }
    if (typeof item.url === 'string' && item.url.trim() !== '') {
      const mimeType = sanitizeMimeType(item.mime_type, fallbackMime)
      images.push({
        url: item.url,
        mimeType,
        downloadName: buildDownloadName(provider, mimeType, index),
      })
    }
  })
  return images
}

/** 从网关错误响应中提取安全摘要 + HTTP 状态 + request ID。 */
export function extractImageGenerationError(error: unknown): ImageGenerationError {
  if (error && typeof error === 'object') {
    const err = error as {
      message?: string
      status?: number
      statusCode?: number
      requestId?: string
      request_id?: string
      response?: { status?: number; headers?: { get?: (k: string) => string | null } }
    }
    const status = err.status ?? err.statusCode ?? err.response?.status
    const requestId = err.requestId ?? err.request_id ?? err.response?.headers?.get?.('X-Request-Id') ?? ''
    const message =
      typeof err.message === 'string' && err.message.trim() !== ''
        ? err.message
        : `Image generation failed${status ? ` (HTTP ${status})` : ''}`
    return { message, status, requestId }
  }
  return { message: 'Image generation failed' }
}
