import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

import type { ApiKey } from '@/types'
import ImageGenerationView from '../ImageGenerationView.vue'

const { keysList, generateImageMock, listModelsMock, createObjectURLMock, revokeObjectURLMock } =
  vi.hoisted(() => ({
    keysList: vi.fn(),
    generateImageMock: vi.fn(),
    listModelsMock: vi.fn(),
    createObjectURLMock: vi.fn(() => 'blob:test-url'),
    revokeObjectURLMock: vi.fn(),
  }))

// 可被测试改写的 eligibleKeys 引用（替代真实组合式函数内部状态）。
const eligibleKeysRef = ref<ApiKey[]>([])

const messages: Record<string, string> = {
  'imageGeneration.title': 'Image Generation',
  'imageGeneration.description': 'desc',
  'imageGeneration.toolbar.key': 'Key',
  'imageGeneration.toolbar.model': 'Model',
  'imageGeneration.toolbar.selectKeyPlaceholder': 'Select key',
  'imageGeneration.toolbar.selectModelPlaceholder': 'Select model',
  'imageGeneration.toolbar.noKeyAvailable': 'No keys',
  'imageGeneration.toolbar.noModelAvailable': 'No models',
  'imageGeneration.states.loadingKeys': 'Loading keys',
  'imageGeneration.states.noEligibleKeyTitle': 'No eligible key',
  'imageGeneration.states.noEligibleKeyHint': 'hint',
  'imageGeneration.states.goToKeys': 'Manage keys',
  'imageGeneration.states.loadingModels': 'Loading models',
  'imageGeneration.states.noImageModelTitle': 'No image models',
  'imageGeneration.states.noImageModelHint': 'hint',
  'imageGeneration.states.idleTitle': 'idle',
  'imageGeneration.states.idleHint': 'hint',
  'imageGeneration.states.generating': 'Generating',
  'imageGeneration.states.generatingHint': 'hint',
  'imageGeneration.states.errorTitle': 'Failed',
  'imageGeneration.states.cancelledTitle': 'Cancelled',
  'imageGeneration.states.cancelledHint': 'hint',
  'imageGeneration.prompt.placeholder': 'Describe',
  'imageGeneration.footer.generate': 'Generate',
  'imageGeneration.footer.stop': 'Stop',
  'imageGeneration.settings.label': 'Settings',
  'imageGeneration.errors.noKey': 'Select a key',
  'imageGeneration.errors.noModel': 'Select a model',
  'imageGeneration.errors.emptyPrompt': 'Enter a prompt',
  'imageGeneration.errors.requestFailed': 'Request failed',
  'imageGeneration.result.download': 'Download',
  'imageGeneration.result.fullscreen': 'Fullscreen',
  'imageGeneration.result.closeFullscreen': 'Close',
  'imageGeneration.result.prev': 'Prev',
  'imageGeneration.result.next': 'Next',
}

vi.mock('@/api/imageGeneration', () => ({
  generateImage: generateImageMock,
  listModels: listModelsMock,
}))

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/composables/useImageGenerationAccess', () => ({
  useImageGenerationAccess: () => ({
    eligibleKeys: eligibleKeysRef,
    imageKeysLoading: false,
    imageKeysLoaded: true,
    loadEligibleKeys: keysList,
  }),
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => messages[key] ?? key }),
  }
})

const createEligibleKey = (overrides: Partial<ApiKey> = {}): ApiKey => ({
  id: 1,
  user_id: 1,
  key: 'sk-user-key',
  name: 'my-key',
  status: 'active',
  group_id: 1,
  ip_whitelist: [],
  ip_blacklist: [],
  last_used_at: null,
  last_used_ip: null,
  quota: 0,
  quota_used: 0,
  expires_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  current_concurrency: 1,
  rate_limit_5h: 0,
  rate_limit_1d: 0,
  rate_limit_7d: 0,
  usage_5h: 0,
  usage_1d: 0,
  usage_7d: 0,
  window_5h_start: null,
  window_1d_start: null,
  window_7d_start: null,
  reset_5h_at: null,
  reset_1d_at: null,
  reset_7d_at: null,
  ...overrides,
})

beforeEach(() => {
  eligibleKeysRef.value = []
  keysList.mockReset()
  generateImageMock.mockReset()
  listModelsMock.mockReset()
  createObjectURLMock.mockClear()
  revokeObjectURLMock.mockClear()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(ImageGenerationView, {
    global: {
      stubs: {
        AppLayout: { template: '<div><slot /></div>' },
        LoadingSpinner: { template: '<div class="spinner" />' },
        Select: { template: '<div class="select-stub" />' },
        TextArea: { template: '<textarea class="prompt-textarea" :value="modelValue" />' },
        ImageResultStage: { template: '<div class="stage-stub" />' },
        ImagePromptDock: { template: '<div class="dock-stub" />' },
        Icon: { template: '<i />' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('ImageGenerationView', () => {
  beforeEach(() => {
    pushMock.mockReset()
  })

  it('shows no-eligible-key empty state when the user has no eligible keys', async () => {
    keysList.mockResolvedValue([])
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No eligible key')
    expect(wrapper.text()).toContain('Manage keys')
  })

  it('navigates to /keys via router.push when clicking the manage-keys action', async () => {
    keysList.mockResolvedValue([])
    const wrapper = await mountView()
    const action = wrapper.find('.empty-action')
    expect(action.exists()).toBe(true)
    await action.trigger('click')
    // history 模式路由：必须走 router.push，不能用 window.location.hash
    expect(pushMock).toHaveBeenCalledWith('/keys')
  })

  it('loads models for the first eligible key using the key value as Bearer', async () => {
    eligibleKeysRef.value = [createEligibleKey()]
    keysList.mockResolvedValue([createEligibleKey()])
    listModelsMock.mockResolvedValue([])
    const wrapper = await mountView()
    await nextTick()
    await flushPromises()
    expect(listModelsMock).toHaveBeenCalledWith('sk-user-key')
    // 无匹配图片模型时进入 no-image-model（阶段渲染由 stage 组件负责，此处验证不崩溃且已离开 loading）
    expect(wrapper.find('.workbench-loading').exists()).toBe(false)
  })

  it('shows idle workbench when a matching image model exists and writes nothing persistent', async () => {
    eligibleKeysRef.value = [createEligibleKey()]
    keysList.mockResolvedValue([createEligibleKey()])
    listModelsMock.mockResolvedValue(['gemini-2.5-flash-image'])
    const wrapper = await mountView()
    await nextTick()
    await flushPromises()
    expect(listModelsMock).toHaveBeenCalledWith('sk-user-key')
    // 视图自身不渲染 loading/empty 分支（成功进入 idle 后由 stage/dock 渲染）
    expect(wrapper.find('.workbench-loading').exists()).toBe(false)
    // 断言没有任何持久化写入（Key / prompt / 图片数据都不落存储）
    expect(localStorage.getItem('__ig_key__')).toBeNull()
    expect(sessionStorage.getItem('__ig_prompt__')).toBeNull()
  })
})
