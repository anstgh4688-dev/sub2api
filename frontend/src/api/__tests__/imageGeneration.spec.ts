import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateImage, ImageGenerationHttpError, listModels } from '../imageGeneration'

const fetchMock = vi.fn()

vi.mock('../client', () => ({ buildGatewayUrl: (path: string) => `https://gw.test${path}` }))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('generateImage', () => {
  it('posts to the gateway with the selected key as Bearer and fixed b64_json', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 1, data: [{ b64_json: 'aGVsbG8=' }] }),
    })
    const res = await generateImage('sk-user-key', {
      model: 'gemini-2.5-flash-image',
      prompt: 'a cat',
    })
    expect(res.data[0].b64_json).toBe('aGVsbG8=')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gw.test/v1/images/generations')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-user-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('gemini-2.5-flash-image')
    expect(body.prompt).toBe('a cat')
    expect(body.response_format).toBe('b64_json')
    expect(body.n).toBeUndefined()
  })

  it('only sends supported fields and omits undefined/empty ones', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ created: 1, data: [] }) })
    await generateImage('sk', {
      model: 'gpt-image-2',
      prompt: 'x',
      size: '1024x1024',
      quality: 'high',
      n: 2,
      background: undefined,
      output_format: undefined,
      aspect_ratio: undefined,
      resolution: undefined,
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.size).toBe('1024x1024')
    expect(body.quality).toBe('high')
    expect(body.n).toBe(2)
    expect(body.background).toBeUndefined()
    expect(body.aspect_ratio).toBeUndefined()
    expect(body.resolution).toBeUndefined()
    expect(body.output_format).toBeUndefined()
  })

  it('sends aspect_ratio/resolution for gemini/grok models', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ created: 1, data: [] }) })
    await generateImage('sk', {
      model: 'grok-imagine',
      prompt: 'x',
      aspect_ratio: '16:9',
      resolution: '1K',
      n: 1,
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.aspect_ratio).toBe('16:9')
    expect(body.resolution).toBe('1K')
    expect(body.n).toBe(1)
  })

  it('preserves abort signal for cancellation', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ created: 1, data: [] }) })
    await generateImage('sk', { model: 'gemini-2.5-flash-image', prompt: 'x' }, { signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('surfaces upstream error message, status and request id', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => 'req-xyz' },
      json: async () => ({ error: { message: 'rate limited' } }),
    })
    const err = await generateImage('sk', { model: 'gemini-2.5-flash-image', prompt: 'x' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ImageGenerationHttpError)
    const httpErr = err as ImageGenerationHttpError
    expect(httpErr.message).toBe('rate limited')
    expect(httpErr.status).toBe(429)
    expect(httpErr.requestId).toBe('req-xyz')
  })

  it('does not swallow fetch failures (network errors propagate)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      generateImage('sk', { model: 'gemini-2.5-flash-image', prompt: 'x' }),
    ).rejects.toThrow('Failed to fetch')
  })
})

describe('listModels', () => {
  it('lists model ids with the selected key as Bearer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gemini-2.5-flash-image' }, { id: 'gemini-2.5-pro' }, { id: 'gpt-image-2' }],
      }),
    })
    const models = await listModels('sk-user-key')
    expect(models).toEqual(['gemini-2.5-flash-image', 'gemini-2.5-pro', 'gpt-image-2'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gw.test/v1/models')
    expect(init.headers.Authorization).toBe('Bearer sk-user-key')
  })

  it('returns empty list for malformed responses', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    expect(await listModels('sk')).toEqual([])
  })
})
