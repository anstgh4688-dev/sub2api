import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ImagePromptDock from '../ImagePromptDock.vue'
import ImageSettingsPopover from '../ImageSettingsPopover.vue'
import type { ImageModelProfile } from '@/features/image-generation/types'

const messages: Record<string, string> = {
  'imageGeneration.prompt.placeholder': 'Describe',
  'imageGeneration.footer.generate': 'Generate',
  'imageGeneration.footer.stop': 'Stop',
  'imageGeneration.settings.label': 'Settings',
  'imageGeneration.toolbar.noModelAvailable': 'No models',
}

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => messages[key] ?? key }),
  }
})

const IconStub = { template: '<i class="icon-stub" />' }
const TextAreaStub = {
  props: ['modelValue', 'placeholder', 'rows', 'disabled'],
  emits: ['update:modelValue', 'keydown'],
  template:
    '<textarea class="real-textarea" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
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
  return mount(ImagePromptDock, {
    props: {
      prompt: '',
      generating: false,
      disabled: false,
      profile: null,
      settings: {},
      settingsOpen: false,
      ...props,
    },
    global: {
      stubs: { Icon: IconStub, TextArea: TextAreaStub, ImageSettingsPopover },
    },
  })
}

describe('ImagePromptDock', () => {
  it('emits generate when the generate button is clicked (not generating)', async () => {
    const wrapper = makeWrapper({ prompt: 'a cat' })
    expect(wrapper.text()).toContain('Generate')
    await wrapper.find('.prompt-submit-go').trigger('click')
    expect(wrapper.emitted('generate')).toBeTruthy()
  })

  it('emits stop instead of generate while generating', async () => {
    const wrapper = makeWrapper({ generating: true })
    expect(wrapper.find('.prompt-submit-stop').exists()).toBe(true)
    expect(wrapper.text()).toContain('Stop')
    await wrapper.find('.prompt-submit-stop').trigger('click')
    expect(wrapper.emitted('stop')).toBeTruthy()
    expect(wrapper.emitted('generate')).toBeUndefined()
  })

  it('emits update:prompt from the textarea input', async () => {
    const wrapper = makeWrapper()
    const textarea = wrapper.find('.real-textarea')
    await textarea.setValue('hello')
    expect(wrapper.emitted('update:prompt')).toBeTruthy()
    expect(wrapper.emitted('update:prompt')![0][0]).toBe('hello')
  })

  it('emits generate on Enter without Shift and not on Shift+Enter', async () => {
    const wrapper = makeWrapper()
    const textarea = wrapper.find('.real-textarea')

    const enter = { key: 'Enter', shiftKey: false, isComposing: false, preventDefault: vi.fn() }
    await textarea.trigger('keydown', enter)
    expect(wrapper.emitted('generate')).toBeTruthy()
    expect(enter.preventDefault).toHaveBeenCalled()

    // Shift+Enter 换行，不触发生成
    const shiftEnter = { key: 'Enter', shiftKey: true, isComposing: false, preventDefault: vi.fn() }
    await textarea.trigger('keydown', shiftEnter)
    expect(wrapper.emitted('generate')!.length).toBe(1) // 未增加
  })

  it('toggles the settings popover open state', async () => {
    const wrapper = makeWrapper()
    await wrapper.find('.prompt-settings-btn').trigger('click')
    expect(wrapper.emitted('update:settings-open')).toBeTruthy()
    expect(wrapper.emitted('update:settings-open')![0][0]).toBe(true)
  })

  it('renders the settings popover when open with the active profile', () => {
    const wrapper = makeWrapper({ settingsOpen: true, profile: geminiProfile })
    expect(wrapper.findComponent(ImageSettingsPopover).exists()).toBe(true)
    const profileProp = wrapper.findComponent(ImageSettingsPopover).props('profile')
    expect(profileProp).toMatchObject({ provider: 'gemini', maxImages: 1 })
  })
})
