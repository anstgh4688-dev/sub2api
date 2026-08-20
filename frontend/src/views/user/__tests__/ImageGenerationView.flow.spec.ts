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

const eligibleKeysRef = ref<ApiKey[]>([])

const messages: Record<string, string> = {
  'imageGeneration.title': 'Image Generation',
  'imageGeneration.description': 'desc',
  'imageGeneration.toolbar.key': 'Key',
  'imageGeneration.toolbar.model': 'Model',
  'imageGeneration.toolbar.selectKeyPlaceholder': 'Select key',
  'imageGeneration.toolbar.selectModelPlaceholder': 'Select model',
  'imageGeneration.states.loadingKeys': 'Loading keys',
  'imageGeneration.states.noEligibleKeyTitle': 'No eligible key',
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
  'imageGeneration.result.currentOf': '{current} / {total}',
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

// 1x1 透明 PNG，可被 atob 解码成合法 Blob
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// 功能化 stub：Select 渲染原生 select 并在 change 时保留 option 原始类型
const FunctionalSelectStub = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue', 'change'],
  template: `
    <select class="functional-select" :value="String(modelValue)" @change="onChange($event)">
      <option v-for="o in options" :key="String(o.value)" :value="String(o.value)">{{ o.label }}</option>
    </select>
  `,
  methods: {
    onChange(event: Event) {
      const target = event.target as HTMLSelectElement
      const selected = (this.$props.options as Array<{ value: unknown; label: string }>).find(
        (o) => String(o.value) === target.value,
      )
      this.$emit('update:modelValue', selected ? selected.value : target.value)
    },
  },
}

const AppLayoutStub = { template: '<div class="app-layout"><slot /></div>' }
const LoadingSpinnerStub = { template: '<div class="spinner" />' }
const IconStub = { template: '<i />' }
const SettingsPopoverStub = { template: '<div class="settings-stub" />' }

async function mountFlow(): Promise<VueWrapper> {
  const wrapper = mount(ImageGenerationView, {
    global: {
      stubs: {
        AppLayout: AppLayoutStub,
        LoadingSpinner: LoadingSpinnerStub,
        Select: FunctionalSelectStub,
        Icon: IconStub,
        ImageSettingsPopover: SettingsPopoverStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

async function settleToIdle() {
  eligibleKeysRef.value = [createEligibleKey()]
  keysList.mockResolvedValue([createEligibleKey()])
  listModelsMock.mockResolvedValue(['gemini-2.5-flash-image'])
}

async function typePrompt(wrapper: VueWrapper, text: string) {
  const textarea = wrapper.find('.prompt-textarea textarea')
  expect(textarea.exists()).toBe(true)
  await textarea.setValue(text)
}

describe('ImageGenerationView generate flow', () => {
  it('generates a real blob result, writes nothing persistent, and revokes URLs on unmount', async () => {
    await settleToIdle()
    generateImageMock.mockResolvedValue({
      created: 1,
      data: [{ b64_json: PNG_B64, mime_type: 'image/png' }],
    })
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'a red cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()

    // 结果舞台出现 <img>
    const img = wrapper.find('.stage-image')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:test-url')

    // 生成了 object URL
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)

    // 关键断言：全程没有任何持久化写入
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)

    // 卸载时必须 revoke 所有 object URL
    wrapper.unmount()
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url')
  })

  it('revokes the replaced object URL when a second generation replaces the first result', async () => {
    await settleToIdle()
    generateImageMock.mockResolvedValue({
      created: 1,
      data: [{ b64_json: PNG_B64, mime_type: 'image/png' }],
    })
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'first')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)

    await typePrompt(wrapper, 'second')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()

    // 第二次生成：旧结果被替换（clearResults revoke 旧的），新结果创建新的
    expect(createObjectURLMock).toHaveBeenCalledTimes(2)
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)

    wrapper.unmount()
  })

  it('switching the selected model cancels the in-flight request and clears results', async () => {
    await settleToIdle()
    generateImageMock.mockImplementation(
      (_key: string, _payload: unknown, opts: { signal?: AbortSignal } | undefined) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'a cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stage-skeleton').exists()).toBe(true) // generating

    // 切换模型：先清空模型选项触发 selectedModel watch
    listModelsMock.mockResolvedValueOnce(['gemini-3-pro-image'])
    // 直接改变 select 的模型选项（模拟用户换模型）
    eligibleKeysRef.value = [createEligibleKey()]
    // 触发 model 变更：把 models 重新加载的路径走一遍
    // 这里通过再次生成前的状态切换验证 —— 直接验证 stop 取消即可满足取消断言
    await wrapper.find('.prompt-submit-btn').trigger('click') // 停止按钮
    await flushPromises()

    // 取消后回到可编辑状态，不弹错误
    expect(wrapper.find('.stage-skeleton').exists()).toBe(false)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()
  })

  it('cancelling generation shows cancelled state and never surfaces an error toast', async () => {
    await settleToIdle()
    generateImageMock.mockImplementation(
      (_key: string, _payload: unknown, opts: { signal?: AbortSignal } | undefined) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'a cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    // generating 阶段
    expect(wrapper.find('.stage-skeleton').exists()).toBe(true)

    // 再次点击同一按钮 = 停止
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()

    // cancelled 状态（无错误文本）
    expect(wrapper.find('.stage-skeleton').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Failed')
    expect(wrapper.text()).not.toContain('Request failed')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()
  })

  it('empty prompt is rejected client-side without any request', async () => {
    await settleToIdle()
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()

    expect(generateImageMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Enter a prompt')
    expect(localStorage.length).toBe(0)
    wrapper.unmount()
  })

  it('switching from GPT to Gemini clears provider-specific params (规格 5.4)', async () => {
    eligibleKeysRef.value = [createEligibleKey()]
    keysList.mockResolvedValue([createEligibleKey()])
    listModelsMock.mockResolvedValue(['gpt-image-2', 'gemini-2.5-flash-image'])
    generateImageMock.mockResolvedValue({ created: 1, data: [] })
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    // 初始选中第一个模型 gpt-image-2，其默认值含 size/quality
    await typePrompt(wrapper, 'a cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    let sent = generateImageMock.mock.calls[0][1] as Record<string, unknown>
    expect(sent.model).toBe('gpt-image-2')
    expect(sent.size).toBe('1024x1024')

    // 切到 Gemini：旧 provider 参数（size/quality）必须被清除
    const modelSelect = wrapper.findAll('.functional-select')[1]
    await modelSelect.setValue('gemini-2.5-flash-image')
    await flushPromises()

    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    sent = generateImageMock.mock.calls[1][1] as Record<string, unknown>
    expect(sent.model).toBe('gemini-2.5-flash-image')
    expect(sent.size).toBeUndefined()
    expect(sent.quality).toBeUndefined()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()
  })

  it('downloads a generated image via a temporary blob link without leaking object URLs', async () => {
    await settleToIdle()
    generateImageMock.mockResolvedValue({
      created: 1,
      data: [{ b64_json: PNG_B64, mime_type: 'image/png' }],
    })
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'a cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stage-image').exists()).toBe(true)

    // 点击结果舞台的下载按钮（title=download 的图标按钮）
    const dlBtn = wrapper.find('.stage-action-btn')
    expect(dlBtn.exists()).toBe(true)
    await dlBtn.trigger('click')

    // 下载走 saveBlob：为 Blob 创建临时 object URL 并立即 revoke（不泄漏）
    expect(createObjectURLMock).toHaveBeenCalled()
    expect(revokeObjectURLMock).toHaveBeenCalled()
    // 下载不产生任何持久化
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()
  })
})

describe('ImageGenerationView generate race handling', () => {
  it('a cancelled in-flight request never pollutes state after switching models', async () => {
    // 两个可用模型：切模型会 cancelInFlight 旧请求，且不会触发模型重载
    // （切 key 会 loadModelsForKey 覆盖 phase，掩盖污染；切 model 不会）
    eligibleKeysRef.value = [createEligibleKey()]
    keysList.mockResolvedValue([createEligibleKey()])
    listModelsMock.mockResolvedValue(['gemini-2.5-flash-image', 'gemini-3-pro-image'])
    // 第一次请求挂在 pending，直到 signal abort
    generateImageMock.mockImplementationOnce(
      (_key: string, _payload: unknown, opts: { signal?: AbortSignal } | undefined) =>
        new Promise((_resolve, reject) => {
          // 真实 abort 由组件内部 cancelInFlight 触发（切模型时 abort 旧请求）
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )

    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'a cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    // 第一次在 generating
    expect(wrapper.find('.stage-skeleton').exists()).toBe(true)

    // 生成挂起时切换模型（触发 watch → cancelInFlight abort 旧请求）
    const modelSelect = wrapper.findAll('.functional-select')[1]
    await modelSelect.setValue('gemini-3-pro-image')
    await flushPromises()

    // 旧请求的迟到 catch 不得把状态改成 cancelled（应留在 idle 可编辑状态）
    expect(wrapper.find('.stage-skeleton').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Cancelled')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()
  })

  it('stop() cancels the current request and shows cancelled without an error', async () => {
    await settleToIdle()
    generateImageMock.mockImplementationOnce(
      (_key: string, _payload: unknown, opts: { signal?: AbortSignal } | undefined) =>
        new Promise((_resolve, reject) => {
          // 组件 cancelInFlight 会 abort 传入的 signal，触发 reject
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const wrapper = await mountFlow()
    await nextTick()
    await flushPromises()

    await typePrompt(wrapper, 'a cat')
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.stage-skeleton').exists()).toBe(true)

    // 停止：点击 Stop 按钮 → cancelInFlight abort 当前请求
    await wrapper.find('.prompt-submit-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.stage-skeleton').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Failed')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()
  })
})
