import { describe, expect, it } from 'vitest'
import {
  filterImageModels,
  imageModelProfiles,
  resolveImageModelProfile,
} from '../modelProfiles'

describe('modelProfiles', () => {
  it('matches GPT, Gemini and Grok image models exactly', () => {
    expect(resolveImageModelProfile('gpt-image-2')?.provider).toBe('openai')
    expect(resolveImageModelProfile('gpt-image-1')?.provider).toBe('openai')

    expect(resolveImageModelProfile('gemini-2.5-flash-image')?.provider).toBe('gemini')
    expect(resolveImageModelProfile('gemini-2.5-flash-image-preview')?.provider).toBe('gemini')
    expect(resolveImageModelProfile('gemini-3-pro-image')?.provider).toBe('gemini')
    expect(resolveImageModelProfile('gemini-3.1-flash-image')?.provider).toBe('gemini')
    expect(resolveImageModelProfile('gemini-3.1-flash-image-preview')?.provider).toBe('gemini')

    expect(resolveImageModelProfile('grok-imagine')?.provider).toBe('grok')
    expect(resolveImageModelProfile('grok-imagine-image')?.provider).toBe('grok')
    expect(resolveImageModelProfile('grok-imagine-image-quality')?.provider).toBe('grok')
  })

  it('does not misclassify plain text models or unknown *image* names', () => {
    expect(resolveImageModelProfile('gemini-2.5-pro')).toBeUndefined()
    expect(resolveImageModelProfile('gemini-2.5-flash')).toBeUndefined()
    expect(resolveImageModelProfile('gpt-5')).toBeUndefined()
    expect(resolveImageModelProfile('grok-4.3')).toBeUndefined()
    expect(resolveImageModelProfile('text-embedding-3-small')).toBeUndefined()
    // Grok 视频模型（同 grok-imagine 前缀）不得误判为图片模型（规格 6.2）
    expect(resolveImageModelProfile('grok-imagine-video')).toBeUndefined()
    expect(resolveImageModelProfile('grok-imagine-video-1.5')).toBeUndefined()
    expect(resolveImageModelProfile('grok-imagine-video-1.5-preview')).toBeUndefined()
    // 宽泛的 "包含 image" 判断不得生效
    expect(resolveImageModelProfile('my-custom-image-model')).toBeUndefined()
    expect(resolveImageModelProfile('imagen-3')).toBeUndefined()
  })

  it('isolates provider capabilities and defaults', () => {
    const profiles = imageModelProfiles
    const openai = profiles.find((p) => p.provider === 'openai')
    const gemini = profiles.find((p) => p.provider === 'gemini')
    const grok = profiles.find((p) => p.provider === 'grok')

    expect(openai?.supportedSizes).toContain('1024x1024')
    expect(openai?.supportedQualities).toContain('high')
    expect(gemini?.supportedAspectRatios).toContain('1:1')
    expect(gemini?.supportedResolutions).toContain('1K')
    expect(grok?.supportedAspectRatios).toContain('9:16')

    // 参数互不泄漏
    expect(gemini?.supportedSizes).toBeUndefined()
    expect(openai?.supportedAspectRatios).toBeUndefined()

    // 数量上限
    expect(openai?.maxImages).toBe(10)
    expect(gemini?.maxImages).toBe(1)
    expect(grok?.maxImages).toBe(10)
  })

  it('filters model lists with provider isolation', () => {
    const all = [
      'gpt-image-2',
      'gemini-2.5-flash-image',
      'grok-imagine',
      'gemini-2.5-pro',
      'gpt-5',
    ]
    expect(filterImageModels(all)).toEqual(['gpt-image-2', 'gemini-2.5-flash-image', 'grok-imagine'])
    expect(filterImageModels(all, 'openai')).toEqual(['gpt-image-2'])
    expect(filterImageModels(all, 'gemini')).toEqual(['gemini-2.5-flash-image'])
    expect(filterImageModels(all, 'grok')).toEqual(['grok-imagine'])
    expect(filterImageModels(['gpt-5', 'gemini-2.5-pro'])).toEqual([])
    expect(filterImageModels([])).toEqual([])
    expect(filterImageModels(undefined as unknown as string[])).toEqual([])
  })
})
