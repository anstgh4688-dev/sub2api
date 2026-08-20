<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/common/Select.vue'
import type { ImageModelProfile } from '@/features/image-generation/types'
import type { ImageGenerationSettings } from '@/features/image-generation/types'

const props = defineProps<{
  profile: ImageModelProfile | null
  settings: ImageGenerationSettings
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update:settings', value: ImageGenerationSettings): void
}>()

const { t } = useI18n()
const containerRef = ref<HTMLElement | null>(null)

const OUTPUT_FORMAT_OPTIONS = ['png', 'jpeg', 'webp'] as const

function option(value: string | number, label: string) {
  return { value, label }
}

const sizeOptions = computed(() =>
  (props.profile?.supportedSizes ?? []).map((size) => option(size, size)),
)
const qualityOptions = computed(() =>
  (props.profile?.supportedQualities ?? []).map((q) => option(q, t(`imageGeneration.settings.quality${q}`).startsWith('imageGeneration') ? q : q)),
)
const aspectOptions = computed(() =>
  (props.profile?.supportedAspectRatios ?? []).map((ratio) => option(ratio, ratio)),
)
const resolutionOptions = computed(() =>
  (props.profile?.supportedResolutions ?? []).map((res) => option(res, res)),
)
const countOptions = computed(() => {
  const max = props.profile?.maxImages ?? 1
  const list: { value: number; label: string }[] = []
  for (let i = 1; i <= max; i += 1) {
    list.push({ value: i, label: String(i) })
  }
  return list
})

function patch(patch: Partial<ImageGenerationSettings>) {
  emit('update:settings', { ...props.settings, ...patch })
}

const qualityLabels: Record<string, string> = {
  low: 'imageGeneration.settings.qualityLow',
  medium: 'imageGeneration.settings.qualityMedium',
  high: 'imageGeneration.settings.qualityHigh',
  auto: 'imageGeneration.settings.qualityAuto',
}

function qualityLabel(value: string): string {
  return t(qualityLabels[value] || value)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <div
    ref="containerRef"
    v-if="open"
    class="image-settings-popover border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800"
  >
    <div class="settings-popover-header">
      <span class="settings-popover-title">{{ t('imageGeneration.settings.label') }}</span>
      <button type="button" class="settings-popover-close" :aria-label="t('imageGeneration.settings.close')" @click="close">
        ×
      </button>
    </div>
    <div class="settings-popover-body">
      <template v-if="profile">
        <div v-if="sizeOptions.length" class="settings-field">
          <label class="settings-label">{{ t('imageGeneration.settings.size') }}</label>
          <Select :model-value="settings.size" :options="sizeOptions" :placeholder="t('imageGeneration.settings.size')" @update:model-value="(v) => patch({ size: String(v ?? '') })" />
        </div>
        <div v-if="qualityOptions.length" class="settings-field">
          <label class="settings-label">{{ t('imageGeneration.settings.quality') }}</label>
          <Select :model-value="settings.quality" :options="qualityOptions.map((o) => ({ ...o, label: qualityLabel(String(o.value)) }))" :placeholder="t('imageGeneration.settings.quality')" @update:model-value="(v) => patch({ quality: String(v ?? '') })" />
        </div>
        <div v-if="profile.provider === 'openai'" class="settings-field">
          <label class="settings-label">{{ t('imageGeneration.settings.outputFormat') }}</label>
          <Select :model-value="settings.output_format" :options="OUTPUT_FORMAT_OPTIONS.map((f) => option(f, f))" :placeholder="t('imageGeneration.settings.outputFormat')" @update:model-value="(v) => patch({ output_format: (v as ImageGenerationSettings['output_format']) ?? undefined })" />
        </div>
        <div v-if="aspectOptions.length" class="settings-field">
          <label class="settings-label">{{ t('imageGeneration.settings.aspectRatio') }}</label>
          <Select :model-value="settings.aspect_ratio" :options="aspectOptions" :placeholder="t('imageGeneration.settings.aspectRatio')" @update:model-value="(v) => patch({ aspect_ratio: String(v ?? '') })" />
        </div>
        <div v-if="resolutionOptions.length" class="settings-field">
          <label class="settings-label">{{ t('imageGeneration.settings.resolution') }}</label>
          <Select :model-value="settings.resolution" :options="resolutionOptions" :placeholder="t('imageGeneration.settings.resolution')" @update:model-value="(v) => patch({ resolution: String(v ?? '') })" />
        </div>
        <div v-if="profile.maxImages > 1" class="settings-field">
          <label class="settings-label">{{ t('imageGeneration.settings.count') }}</label>
          <Select :model-value="settings.n ?? 1" :options="countOptions" :placeholder="t('imageGeneration.settings.count')" @update:model-value="(v) => patch({ n: Number(v ?? 1) })" />
        </div>
      </template>
      <p v-else class="settings-empty">{{ t('imageGeneration.toolbar.noModelAvailable') }}</p>
    </div>
  </div>
</template>

<style scoped>
.image-settings-popover {
  position: absolute;
  z-index: 30;
  right: 0;
  bottom: calc(100% + 8px);
  width: 16rem;
  max-height: 60vh;
  overflow-y: auto;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.settings-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}
.settings-popover-title {
  font-size: 0.8125rem;
  font-weight: 600;
}
.settings-popover-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.125rem;
  line-height: 1;
  color: inherit;
  opacity: 0.7;
}
.settings-popover-body {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.settings-label {
  font-size: 0.75rem;
  opacity: 0.75;
}
.settings-empty {
  font-size: 0.8125rem;
  opacity: 0.6;
}
</style>
