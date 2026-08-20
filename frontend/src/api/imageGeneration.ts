/**
 * Image generation gateway API (synchronous, unified for GPT / Gemini / Grok).
 *
 * All three providers share a single gateway endpoint:
 *   POST /v1/images/generations
 *   Authorization: Bearer <selected user's Sub2API key>
 *
 * The request body only contains fields the selected model declares as
 * supported (see features/image-generation/modelProfiles.ts). The gateway key
 * never leaves the current in-memory selection — it is not persisted, logged
 * or embedded in URLs/attributes.
 */

import { buildGatewayUrl } from './client'

/** A JSON parse error wrapper that preserves the upstream HTTP status and request id. */
export class ImageGenerationHttpError extends Error {
  status: number
  requestId: string

  constructor(message: string, status: number, requestId: string) {
    super(message)
    this.name = 'ImageGenerationHttpError'
    this.status = status
    this.requestId = requestId
  }
}

async function parseError(response: Response): Promise<ImageGenerationHttpError> {
  let message = `HTTP ${response.status}`
  try {
    const body = await response.json()
    if (body?.error?.message) message = String(body.error.message)
    else if (body?.message) message = String(body.message)
  } catch {
    // fall through to default message
  }
  return new ImageGenerationHttpError(message, response.status, response.headers.get('X-Request-Id') || '')
}

/**
 * 发起同步文生图。返回 OpenAI Images 形状响应体。
 * 只发送当前模型声明支持的字段；response_format 固定为 b64_json。
 */
export async function generateImage(
  apiKey: string,
  payload: {
    model: string
    prompt: string
    n?: number
    size?: string
    quality?: string
    background?: string
    output_format?: 'png' | 'jpeg' | 'webp'
    aspect_ratio?: string
    resolution?: string
  },
  options?: { signal?: AbortSignal },
): Promise<{
  created: number
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string; mime_type?: string }>
}> {
  const body: Record<string, unknown> = {
    model: payload.model,
    prompt: payload.prompt,
    response_format: 'b64_json',
  }
  const numericN = payload.n === undefined ? undefined : Math.floor(Number(payload.n))
  if (payload.n !== undefined && numericN !== undefined && numericN > 0) body.n = numericN
  if (payload.size) body.size = payload.size
  if (payload.quality) body.quality = payload.quality
  if (payload.background) body.background = payload.background
  if (payload.output_format) body.output_format = payload.output_format
  if (payload.aspect_ratio) body.aspect_ratio = payload.aspect_ratio
  if (payload.resolution) body.resolution = payload.resolution

  const response = await fetch(buildGatewayUrl('/v1/images/generations'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!response.ok) throw await parseError(response)
  return response.json()
}

/**
 * 以本人 Key 调 /v1/models 获取该分组可用的模型列表。
 * 只读取模型 ID；不把 Key 写入任何持久化位置。
 */
export async function listModels(apiKey: string, options?: { signal?: AbortSignal }): Promise<string[]> {
  const response = await fetch(buildGatewayUrl('/v1/models'), {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: options?.signal,
  })
  if (!response.ok) throw await parseError(response)
  const body = await response.json()
  const data = Array.isArray(body?.data) ? body.data : []
  return data
    .map((item: { id?: string }) => (typeof item?.id === 'string' ? item.id : ''))
    .filter((id: string) => id !== '')
}
