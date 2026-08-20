<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import Select, { type SelectOption } from '@/components/common/Select.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import ImageResultStage from '@/components/image-generation/ImageResultStage.vue'
import ImagePromptDock from '@/components/image-generation/ImagePromptDock.vue'
import { generateImage, listModels } from '@/api/imageGeneration'
import { useImageGenerationAccess } from '@/composables/useImageGenerationAccess'
import {
  filterImageModels,
  resolveImageModelProfile,
} from '@/features/image-generation/modelProfiles'
import {
  extractImageGenerationError,
  normalizeImageResponse,
} from '@/features/image-generation/normalizeResponse'
import type {
  GeneratedImage,
  ImageGenerationError,
  ImageGenerationSettings,
  ImageModelProfile,
} from '@/features/image-generation/types'
import type { ApiKey } from '@/types'

const { t } = useI18n()
const router = useRouter()
const { eligibleKeys, imageKeysLoading, loadEligibleKeys } = useImageGenerationAccess()

type Phase =
  | 'loading-keys'
  | 'no-eligible-key'
  | 'loading-models'
  | 'no-image-model'
  | 'idle'
  | 'generating'
  | 'success'
  | 'error'
  | 'cancelled'

const phase = ref<Phase>('loading-keys')
const selectedKeyId = ref<number | null>(null)
const selectedModel = ref<string>('')
const models = ref<string[]>([])
const prompt = ref('')
const settings = reactive<ImageGenerationSettings>({ n: 1 })
const settingsOpen = ref(false)
const images = ref<GeneratedImage[]>([])
const currentIndex = ref(0)
const error = ref<ImageGenerationError | null>(null)
const fullscreen = ref(false)

let abortController: AbortController | null = null
let keyLoadSeq = 0
let modelLoadSeq = 0

const selectedKey = computed<ApiKey | null>(
  () => eligibleKeys.value.find((k) => k.id === selectedKeyId.value) ?? null,
)
const profile = computed<ImageModelProfile | null>(() => {
  const resolved = resolveImageModelProfile(selectedModel.value)
  return resolved ?? null
})
const keyOptions = computed<SelectOption[]>(() =>
  eligibleKeys.value.map((key) => ({
    value: key.id,
    label: key.name || `#${key.id}`,
  })),
)
const modelOptions = computed<SelectOption[]>(() =>
  models.value.map((model) => ({ value: model, label: model })),
)
const aspectRatio = computed(() => {
  const ratio = settings.aspect_ratio || profile.value?.defaultValues?.aspect_ratio
  if (ratio && ['1:1', '16:9', '9:16', '4:3', '3:4'].includes(ratio)) return ratio
  return 'auto'
})

// generationSeq 单调递增，用于区分在途请求。每次发起新生成或切换 Key/模型时递增，
// 旧请求的迟到 catch/finally 因 token 不匹配而被忽略，不会污染新请求状态
// （规格 5.4 的"取消后忽略迟到响应"要求）。
let generationSeq = 0

function cancelInFlight() {
  generationSeq += 1
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

function clearResults() {
  images.value.forEach((img) => {
    if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url)
  })
  images.value = []
  currentIndex.value = 0
}

function applyProfileDefaults() {
  const p = profile.value
  Object.keys(settings).forEach((k) => {
    delete (settings as Record<string, unknown>)[k]
  })
  if (p) {
    Object.assign(settings, { ...p.defaultValues })
  } else {
    settings.n = 1
  }
}

async function loadModelsForKey(key: ApiKey) {
  const seq = ++modelLoadSeq
  phase.value = 'loading-models'
  try {
    const all = await listModels(key.key)
    if (seq !== modelLoadSeq) return
    models.value = filterImageModels(all, undefined)
    const next = models.value[0] ?? ''
    selectedModel.value = next
    if (!next) {
      phase.value = 'no-image-model'
      return
    }
    phase.value = 'idle'
  } catch (e) {
    if (seq !== modelLoadSeq) return
    models.value = []
    selectedModel.value = ''
    error.value = extractImageGenerationError(e)
    phase.value = 'error'
  }
}

async function bootstrap() {
  const seq = ++keyLoadSeq
  phase.value = 'loading-keys'
  try {
    const keys = await loadEligibleKeys(true)
    if (seq !== keyLoadSeq) return
    if (keys.length === 0) {
      phase.value = 'no-eligible-key'
      return
    }
    selectedKeyId.value = keys[0].id
    await loadModelsForKey(keys[0])
  } catch (e) {
    if (seq !== keyLoadSeq) return
    error.value = extractImageGenerationError(e)
    phase.value = 'error'
  }
}

onMounted(() => {
  void bootstrap()
})

watch(selectedKeyId, async (id) => {
  cancelInFlight()
  clearResults()
  error.value = null
  fullscreen.value = false
  settingsOpen.value = false
  const key = eligibleKeys.value.find((k) => k.id === id)
  if (key) {
    await loadModelsForKey(key)
  } else {
    phase.value = 'no-eligible-key'
  }
})

watch(selectedModel, () => {
  cancelInFlight()
  clearResults()
  error.value = null
  fullscreen.value = false
  applyProfileDefaults()
  if (selectedModel.value && phase.value !== 'loading-models') {
    phase.value = 'idle'
  }
})

async function generate() {
  const key = selectedKey.value
  if (!key) {
    error.value = { message: t('imageGeneration.errors.noKey') }
    phase.value = 'error'
    return
  }
  if (!selectedModel.value) {
    error.value = { message: t('imageGeneration.errors.noModel') }
    phase.value = 'error'
    return
  }
  const trimmed = prompt.value.trim()
  if (!trimmed) {
    error.value = { message: t('imageGeneration.errors.emptyPrompt') }
    phase.value = 'error'
    return
  }

  cancelInFlight()
  const seq = generationSeq
  clearResults()
  error.value = null
  fullscreen.value = false
  const controller = new AbortController()
  abortController = controller
  phase.value = 'generating'

  try {
    const payload = {
      model: selectedModel.value,
      prompt: trimmed,
      ...serializeSettings(profile.value?.provider ?? '', settings),
    }
    const response = await generateImage(key.key, payload, { signal: controller.signal })
    if (seq !== generationSeq) return // 已被后续请求/切换取代，忽略迟到响应
    const normalized = normalizeImageResponse(
      response,
      profile.value?.provider ?? '',
      settings.output_format,
    )
    if (!normalized.length) {
      error.value = { message: t('imageGeneration.states.noImageModelHint') }
      phase.value = 'error'
      return
    }
    images.value = normalized
    currentIndex.value = 0
    phase.value = 'success'
  } catch (e) {
    if (seq !== generationSeq) return // 已被后续请求取代，忽略迟到的取消
    if (controller.signal.aborted) {
      // 用户取消：不弹错误 toast，回到可编辑状态
      phase.value = 'cancelled'
      return
    }
    error.value = extractImageGenerationError(e)
    phase.value = 'error'
  } finally {
    if (seq === generationSeq) {
      abortController = null
    }
  }
}

function stop() {
  // 仅 abort 当前请求、不递增 token：让在途 catch 进入 cancelled 分支。
  if (abortController) {
    abortController.abort()
  }
}

function selectImage(index: number) {
  if (index >= 0 && index < images.value.length) {
    currentIndex.value = index
  }
}

function downloadImage(image: GeneratedImage) {
  if (image.blob) {
    saveBlob(image.blob, image.downloadName)
    return
  }
  // url 类型结果：用临时 <a> 触发下载
  const link = document.createElement('a')
  link.href = image.url
  link.download = image.downloadName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function downloadAll() {
  images.value.forEach((img) => downloadImage(img))
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}

function goToKeys() {
  // 项目使用 history 模式路由，window.location.hash 不会触发导航
  void router.push('/keys')
}

function serializeSettings(provider: string, s: ImageGenerationSettings) {
  const out: Record<string, string | number> = {}
  if (provider === 'openai') {
    if (s.size) out.size = s.size
    if (s.quality) out.quality = s.quality
    if (s.background) out.background = s.background
    if (s.output_format) out.output_format = s.output_format
    if (s.n && s.n > 0) out.n = s.n
  } else if (provider === 'gemini') {
    if (s.aspect_ratio) out.aspect_ratio = s.aspect_ratio
    if (s.resolution) out.resolution = s.resolution
    // Gemini n 固定为 1
  } else if (provider === 'grok') {
    if (s.aspect_ratio) out.aspect_ratio = s.aspect_ratio
    if (s.resolution) out.resolution = s.resolution
    if (s.n && s.n > 0) out.n = s.n
  }
  return out
}

onBeforeUnmount(() => {
  cancelInFlight()
  images.value.forEach((img) => {
    if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url)
  })
})
</script>

<template>
  <AppLayout>
    <div class="page-container">
      <header class="page-header">
        <div class="page-heading">
          <h1 class="page-title">{{ t('imageGeneration.title') }}</h1>
          <p class="page-description">{{ t('imageGeneration.description') }}</p>
        </div>
      </header>

      <div class="workbench">
        <!-- toolbar -->
        <div class="workbench-toolbar">
          <div class="toolbar-field">
            <label class="toolbar-label" for="ig-key-select">{{ t('imageGeneration.toolbar.key') }}</label>
            <Select
              id="ig-key-select"
              class="toolbar-select"
              :model-value="selectedKeyId"
              :options="keyOptions"
              :placeholder="t('imageGeneration.toolbar.selectKeyPlaceholder')"
              :disabled="imageKeysLoading || keyOptions.length === 0"
              :empty-text="t('imageGeneration.toolbar.noKeyAvailable')"
              value-key="value"
              label-key="label"
              @update:model-value="selectedKeyId = $event as number"
            />
          </div>
          <div class="toolbar-field">
            <label class="toolbar-label" for="ig-model-select">{{ t('imageGeneration.toolbar.model') }}</label>
            <Select
              id="ig-model-select"
              class="toolbar-select"
              :model-value="selectedModel"
              :options="modelOptions"
              :placeholder="t('imageGeneration.toolbar.selectModelPlaceholder')"
              :disabled="models.length === 0"
              :empty-text="t('imageGeneration.toolbar.noModelAvailable')"
              value-key="value"
              label-key="label"
              @update:model-value="selectedModel = String($event ?? '')"
            />
          </div>
        </div>

        <!-- loading keys -->
        <div v-if="phase === 'loading-keys'" class="workbench-loading border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
          <LoadingSpinner />
          <p>{{ t('imageGeneration.states.loadingKeys') }}</p>
        </div>

        <!-- no eligible key -->
        <div v-else-if="phase === 'no-eligible-key'" class="workbench-empty border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
          <p class="empty-title">{{ t('imageGeneration.states.noEligibleKeyTitle') }}</p>
          <p class="empty-hint">{{ t('imageGeneration.states.noEligibleKeyHint') }}</p>
          <button type="button" class="empty-action border border-gray-200 dark:border-dark-700" @click="goToKeys">
            {{ t('imageGeneration.states.goToKeys') }}
          </button>
        </div>

        <!-- loading models -->
        <div v-else-if="phase === 'loading-models'" class="workbench-loading border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
          <LoadingSpinner />
          <p>{{ t('imageGeneration.states.loadingModels') }}</p>
        </div>

        <!-- main stage + dock -->
        <template v-else>
          <ImageResultStage
            class="workbench-stage"
            :phase="
              phase === 'generating'
                ? 'generating'
                : phase === 'success'
                  ? 'success'
                  : phase === 'error'
                    ? 'error'
                    : phase === 'cancelled'
                      ? 'cancelled'
                      : phase === 'no-image-model'
                        ? 'no-model'
                        : 'idle'
            "
            :images="images"
            :current-index="currentIndex"
            :error="error"
            :aspect-ratio="aspectRatio"
            :fullscreen="fullscreen"
            @select="selectImage"
            @download="downloadImage"
            @download-all="downloadAll"
            @toggle-fullscreen="toggleFullscreen"
          />

          <ImagePromptDock
            class="workbench-dock"
            :prompt="prompt"
            :generating="phase === 'generating'"
            :disabled="!selectedKey || !selectedModel"
            :profile="profile"
            :settings="settings"
            :settings-open="settingsOpen"
            @update:prompt="prompt = $event"
            @update:settings="Object.assign(settings, $event)"
            @update:settings-open="settingsOpen = $event"
            @generate="generate"
            @stop="stop"
          />
        </template>

        <!-- fullscreen overlay -->
        <div v-if="fullscreen && images[currentIndex]" class="fullscreen-overlay" @click="fullscreen = false">
          <img :src="images[currentIndex].url" :alt="images[currentIndex].downloadName" class="fullscreen-image" />
          <button type="button" class="fullscreen-close" :aria-label="t('imageGeneration.result.closeFullscreen')" @click.stop="fullscreen = false">
            ×
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.page-container {
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
.page-description {
  font-size: 0.875rem;
  opacity: 0.7;
  margin: 0.25rem 0 0;
}
.workbench {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.workbench-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}
.toolbar-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 12rem;
  flex: 1 1 14rem;
}
.toolbar-label {
  font-size: 0.75rem;
  opacity: 0.75;
}
.workbench-stage {
  min-height: 20rem;
}
.workbench-loading,
.workbench-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 20rem;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
}
.empty-title {
  font-weight: 600;
}
.empty-hint {
  font-size: 0.875rem;
  opacity: 0.7;
}
.empty-action {
  background: none;
  color: inherit;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
.fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}
.fullscreen-image {
  max-width: 96vw;
  max-height: 92vh;
  object-fit: contain;
}
.fullscreen-close {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  font-size: 2rem;
  line-height: 1;
  color: #fff;
  background: none;
  border: none;
  cursor: pointer;
}
</style>
