import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ImageResultStage from '../ImageResultStage.vue'
import type { GeneratedImage, ImageGenerationError } from '@/features/image-generation/types'

const messages: Record<string, string> = {
  'imageGeneration.states.idleTitle': 'idle',
  'imageGeneration.states.idleHint': 'hint',
  'imageGeneration.states.generating': 'Generating',
  'imageGeneration.states.generatingHint': 'hint',
  'imageGeneration.states.errorTitle': 'Failed',
  'imageGeneration.states.cancelledTitle': 'Cancelled',
  'imageGeneration.states.cancelledHint': 'hint',
  'imageGeneration.states.noImageModelTitle': 'No image models',
  'imageGeneration.states.noImageModelHint': 'hint',
  'imageGeneration.errors.requestFailed': 'Request failed',
  'imageGeneration.result.currentOf': '{current} / {total}',
  'imageGeneration.result.prev': 'Prev',
  'imageGeneration.result.next': 'Next',
  'imageGeneration.result.download': 'Download',
  'imageGeneration.result.fullscreen': 'Fullscreen',
}

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) =>
        (messages[key] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) =>
          params && params[k] !== undefined ? String(params[k]) : '',
        ),
    }),
  }
})

const IconStub = { template: '<i class="icon-stub" />' }
const SpinnerStub = { template: '<div class="spinner-stub" />' }

const image: GeneratedImage = {
  url: 'blob:test',
  mimeType: 'image/png',
  downloadName: 'sub2api-gemini-20260812-101500-0.png',
}

function makeWrapper(props: Record<string, unknown> = {}) {
  return mount(ImageResultStage, {
    props: {
      phase: 'idle',
      images: [],
      currentIndex: 0,
      error: null,
      aspectRatio: '1:1',
      fullscreen: false,
      ...props,
    },
    global: { stubs: { Icon: IconStub, LoadingSpinner: SpinnerStub } },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ImageResultStage phases', () => {
  it('renders idle empty state with a stable canvas (not text-pushed)', () => {
    const wrapper = makeWrapper()
    expect(wrapper.find('.stage-idle').exists()).toBe(true)
    expect(wrapper.find('.stage-empty-canvas').exists()).toBe(true)
    expect(wrapper.text()).toContain('idle')
  })

  it('renders a skeleton during generating with an aspect-matched stage', () => {
    const wrapper = makeWrapper({ phase: 'generating' })
    expect(wrapper.find('.stage-skeleton').exists()).toBe(true)
    // 舞台带目标宽高比类，占稳定画布尺寸（规格 5.1/5.2）
    expect(wrapper.find('.result-stage').classes()).toContain('aspect-1:1')
    expect(wrapper.text()).toContain('Generating')
  })

  it('applies the aspect ratio class to the stage root', () => {
    const wrapper = makeWrapper({ phase: 'generating', aspectRatio: '16:9' })
    expect(wrapper.find('.result-stage').classes()).toContain('aspect-16:9')
  })

  it('falls back to aspect-auto when the ratio is unknown', () => {
    const wrapper = makeWrapper({ phase: 'generating', aspectRatio: 'auto' })
    expect(wrapper.find('.result-stage').classes()).toContain('aspect-auto')
  })

  it('shows the error message and request id on error', () => {
    const error: ImageGenerationError = { message: 'boom', status: 429, requestId: 'req-1' }
    const wrapper = makeWrapper({ phase: 'error', error })
    expect(wrapper.find('.stage-error').text()).toContain('boom')
    expect(wrapper.text()).toContain('HTTP 429')
    expect(wrapper.text()).toContain('req-1')
  })

  it('shows a neutral cancelled state without an error message', () => {
    const wrapper = makeWrapper({ phase: 'cancelled' })
    expect(wrapper.text()).toContain('Cancelled')
    expect(wrapper.text()).not.toContain('Failed')
    expect(wrapper.find('.stage-error').exists()).toBe(false)
  })
})

describe('ImageResultStage success interactions', () => {
  it('renders the current image and emits download on the download button', async () => {
    const wrapper = makeWrapper({
      phase: 'success',
      images: [image],
      currentIndex: 0,
    })
    const img = wrapper.find('.stage-image')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:test')

    await wrapper.find('.stage-action-btn').trigger('click')
    expect(wrapper.emitted('download')).toBeTruthy()
    expect(wrapper.emitted('download')![0][0]).toMatchObject({ url: 'blob:test' })
  })

  it('shows pager with current/total and emits select on pager clicks', async () => {
    const wrapper = makeWrapper({
      phase: 'success',
      images: [image, image],
      currentIndex: 0,
    })
    expect(wrapper.text()).toContain('1 / 2')

    const buttons = wrapper.findAll('.stage-pager-btn')
    // 上一张（index 0 禁用）
    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(true)
    await buttons[1].trigger('click') // 下一张
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0][0]).toBe(1)
  })

  it('emits toggle-fullscreen from the fullscreen button', async () => {
    const wrapper = makeWrapper({
      phase: 'success',
      images: [image],
      currentIndex: 0,
    })
    const buttons = wrapper.findAll('.stage-action-btn')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('toggle-fullscreen')).toBeTruthy()
  })
})
