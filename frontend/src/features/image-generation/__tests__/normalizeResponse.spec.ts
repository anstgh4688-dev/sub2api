import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDownloadName,
  extractImageGenerationError,
  mimeTypeFromOutputFormat,
  normalizeImageResponse,
} from '../normalizeResponse'
import type { ImageGenerationResponse } from '../types'

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL
const createObjectURL = vi.fn(() => 'blob:test-url')
const revokeObjectURL = vi.fn()

function stubObjectURL() {
  URL.createObjectURL = createObjectURL as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL
}

afterEach(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  revokeObjectURL.mockReset()
  createObjectURL.mockReset()
})

describe('normalizeImageResponse', () => {
  it('converts base64 to blob object URLs with mime type', () => {
    stubObjectURL()
    const response: ImageGenerationResponse = {
      created: 1,
      data: [{ b64_json: 'aGVsbG8=', mime_type: 'image/png' }],
    }
    const images = normalizeImageResponse(response, 'gemini', undefined)
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('blob:test-url')
    expect(images[0].mimeType).toBe('image/png')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('derives mime type from output_format when upstream omits it', () => {
    stubObjectURL()
    const response: ImageGenerationResponse = {
      created: 1,
      data: [{ b64_json: 'aGVsbG8=' }],
    }
    const images = normalizeImageResponse(response, 'openai', 'jpeg')
    expect(images[0].mimeType).toBe('image/jpeg')
  })

  it('falls back to png for unknown mime types', () => {
    stubObjectURL()
    const response: ImageGenerationResponse = {
      created: 1,
      data: [{ b64_json: 'aGVsbG8=', mime_type: 'application/octet-stream' }],
    }
    const images = normalizeImageResponse(response, 'grok', undefined)
    expect(images[0].mimeType).toBe('image/png')
  })

  it('accepts url items and creates no object URLs for them', () => {
    stubObjectURL()
    const response: ImageGenerationResponse = {
      created: 1,
      data: [{ url: 'https://example.com/a.png', mime_type: 'image/png' }],
    }
    const images = normalizeImageResponse(response, 'openai', undefined)
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('https://example.com/a.png')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('drops invalid items', () => {
    stubObjectURL()
    const response: ImageGenerationResponse = {
      created: 1,
      data: [{ b64_json: '' }, { b64_json: '  ' }, { url: '' }],
    }
    const images = normalizeImageResponse(response, 'openai', undefined)
    expect(images).toHaveLength(0)
  })
})

describe('buildDownloadName', () => {
  it('formats the unified filename with provider, timestamp and index', () => {
    const date = new Date(2026, 7, 12, 10, 15, 0) // 2026-08-12 10:15:00
    expect(buildDownloadName('gemini', 'image/png', 0, date)).toBe(
      'sub2api-gemini-20260812-101500-0.png',
    )
    expect(buildDownloadName('grok', 'image/jpeg', 2, date)).toBe(
      'sub2api-grok-20260812-101500-2.jpg',
    )
    expect(buildDownloadName('openai', 'image/webp', 1, date)).toBe(
      'sub2api-openai-20260812-101500-1.webp',
    )
  })
})

describe('mimeTypeFromOutputFormat', () => {
  it('maps known formats', () => {
    expect(mimeTypeFromOutputFormat('png')).toBe('image/png')
    expect(mimeTypeFromOutputFormat('jpeg')).toBe('image/jpeg')
    expect(mimeTypeFromOutputFormat('webp')).toBe('image/webp')
  })
  it('defaults to png for unknown/empty', () => {
    expect(mimeTypeFromOutputFormat(undefined)).toBe('image/png')
    expect(mimeTypeFromOutputFormat('gif')).toBe('image/png')
  })
})

describe('extractImageGenerationError', () => {
  it('extracts message, status and request id', () => {
    const err = extractImageGenerationError({
      message: 'boom',
      status: 429,
      requestId: 'req-123',
    })
    expect(err).toEqual({ message: 'boom', status: 429, requestId: 'req-123' })
  })
  it('handles unknown errors with a default message', () => {
    const err = extractImageGenerationError(null)
    expect(err.message).toBe('Image generation failed')
  })
})
