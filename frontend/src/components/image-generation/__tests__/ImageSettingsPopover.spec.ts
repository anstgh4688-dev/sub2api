import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ImageSettingsPopover from '../ImageSettingsPopover.vue'
import type { ImageModelProfile } from '@/features/image-generation/types'
import type { ImageGenerationSettings } from '@/features/image-generation/types'

const messages: Record<string, string> = {
  'imageGeneration.settings.label': 'Settings',
  'imageGeneration.settings.close': 'Close',
  'imageGeneration.settings.size': 'Size',
  'imageGeneration.settings.quality': 'Quality',
  'imageGeneration.settings.outputFormat': 'Output format',
  'imageGeneration.settings.aspectRatio': 'Aspect ratio',
  'imageGeneration.settings.resolution': 'Resolution',
  'imageGeneration.settings.count': 'Count',
  'imageGeneration.settings.qualityLow': 'Low',
  'imageGeneration.settings.qualityMedium': 'Medium',
  'imageGeneration.settings.qualityHigh': 'High',
  'imageGeneration.settings.qualityAuto': 'Auto',
  'imageGeneration.toolbar.noModelAvailable': 'No models',
}

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => messages[key] ?? key }),
  }
})

const SelectStub = {
  props: ['modelValue', 'options', 'placeholder'],
  emits: ['update:modelValue'],
  template:
    '<select class="select-stub" @change="$emit(\'update:modelValue\', $event.target.value)">' +
    '<option v-for="o in options" :key="String(o.value)" :value="String(o.value)">{{ o.label }}</option>' +
    '</select>',
}

const openaiProfile: ImageModelProfile = {
  provider: 'openai',
  matches: () => true,
  supportedSizes: ['1024x1024', '1536x1024'],
  supportedQualities: ['low', 'high'],
  maxImages: 2,
  defaultValues: { n: 1, size: '1024x1024', quality: 'auto' },
}

const geminiProfile: ImageModelProfile = {
  provider: 'gemini',
  matches: () => true,
  supportedAspectRatios: ['1:1', '16:9'],
  supportedResolutions: ['1K', '2K'],
  maxImages: 1,
  defaultValues: { n: 1 },
}

function makeWrapper(props: Record<string, unknown> = {}) {
  return mount(ImageSettingsPopover, {
    props: {
      profile: null,
      settings: {} as ImageGenerationSettings,
      open: true,
      ...props,
    },
    global: { stubs: { Select: SelectStub } },
  })
}

describe('ImageSettingsPopover', () => {
  it('renders nothing when closed', () => {
    const wrapper = makeWrapper({ open: false })
    expect(wrapper.find('.image-settings-popover').exists()).toBe(false)
  })

  it('renders the settings title and a close button when open', () => {
    const wrapper = makeWrapper()
    expect(wrapper.text()).toContain('Settings')
    const close = wrapper.find('.settings-popover-close')
    expect(close.exists()).toBe(true)
  })

  it('emits close when the close button is clicked', async () => {
    const wrapper = makeWrapper()
    await wrapper.find('.settings-popover-close').trigger('click')
    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')![0][0]).toBe(false)
  })

  it('renders only the fields the profile supports (规格 5.3 参数随模型能力)', () => {
    // GPT：size/quality/count + output_format = 4 个
    const gpt = makeWrapper({ profile: openaiProfile, settings: { n: 1, size: '1024x1024', quality: 'high' } })
    expect(gpt.findAll('.select-stub').length).toBe(4) // size/quality/count/output_format
    // Gemini：aspect_ratio/resolution（maxImages=1 不渲染 count）
    const gemini = makeWrapper({ profile: geminiProfile, settings: { n: 1 } })
    expect(gemini.findAll('.select-stub').length).toBe(2)
    expect(gemini.text()).toContain('Aspect ratio')
    expect(gemini.text()).toContain('Resolution')
    expect(gemini.text()).not.toContain('Size')
  })

  it('emits update:settings when a field changes without mutating props in place', async () => {
    const wrapper = makeWrapper({
      profile: openaiProfile,
      settings: { n: 1, size: '1024x1024' },
    })
    const selects = wrapper.findAll('.select-stub')
    // 第一个 select 是 size
    await selects[0].setValue('1536x1024')
    expect(wrapper.emitted('update:settings')).toBeTruthy()
    const next = wrapper.emitted('update:settings')![0][0] as ImageGenerationSettings
    expect(next.size).toBe('1536x1024')
    expect(next.n).toBe(1) // 其它字段保留
  })

  it('shows an empty state instead of fields when no profile is available', () => {
    const wrapper = makeWrapper()
    expect(wrapper.find('.settings-empty').exists()).toBe(true)
  })
})
