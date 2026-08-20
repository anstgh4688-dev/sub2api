<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import type { GeneratedImage, ImageGenerationError } from '@/features/image-generation/types'

const props = defineProps<{
  phase:
    | 'idle'
    | 'loading'
    | 'generating'
    | 'success'
    | 'error'
    | 'cancelled'
    | 'no-model'
  images: GeneratedImage[]
  currentIndex: number
  error: ImageGenerationError | null
  aspectRatio: string
  fullscreen: boolean
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'download', image: GeneratedImage): void
  (e: 'download-all'): void
  (e: 'toggle-fullscreen'): void
}>()

const { t } = useI18n()

const currentImage = computed<GeneratedImage | null>(() => props.images[props.currentIndex] ?? null)

function download(image: GeneratedImage) {
  emit('download', image)
}
</script>

<template>
  <div class="result-stage glass-card" :class="`aspect-${aspectRatio}`">
    <!-- idle -->
    <div v-if="phase === 'idle'" class="stage-state stage-idle">
      <div class="stage-idle-icon">
        <Icon name="sparkles" size="lg" />
      </div>
      <div class="stage-empty-canvas" />
      <p class="stage-title">{{ t('imageGeneration.states.idleTitle') }}</p>
      <p class="stage-hint">{{ t('imageGeneration.states.idleHint') }}</p>
    </div>

    <!-- loading -->
    <div v-else-if="phase === 'loading'" class="stage-state">
      <LoadingSpinner />
      <p class="stage-hint">{{ t('imageGeneration.states.generatingHint') }}</p>
    </div>

    <!-- generating -->
    <div v-else-if="phase === 'generating'" class="stage-state">
      <div class="stage-skeleton" />
      <p class="stage-title">{{ t('imageGeneration.states.generating') }}</p>
      <p class="stage-hint">{{ t('imageGeneration.states.generatingHint') }}</p>
    </div>

    <!-- error -->
    <div v-else-if="phase === 'error'" class="stage-state">
      <p class="stage-title">{{ t('imageGeneration.states.errorTitle') }}</p>
      <p class="stage-error">{{ error?.message || t('imageGeneration.errors.requestFailed') }}</p>
      <p v-if="error?.status || error?.requestId" class="stage-hint">
        {{ error?.status ? `HTTP ${error.status}` : '' }}
        {{ error?.requestId ? ` · ${error.requestId}` : '' }}
      </p>
    </div>

    <!-- cancelled -->
    <div v-else-if="phase === 'cancelled'" class="stage-state">
      <p class="stage-title">{{ t('imageGeneration.states.cancelledTitle') }}</p>
      <p class="stage-hint">{{ t('imageGeneration.states.cancelledHint') }}</p>
    </div>

    <!-- no model -->
    <div v-else-if="phase === 'no-model'" class="stage-state">
      <p class="stage-title">{{ t('imageGeneration.states.noImageModelTitle') }}</p>
      <p class="stage-hint">{{ t('imageGeneration.states.noImageModelHint') }}</p>
    </div>

    <!-- success -->
    <div v-else-if="phase === 'success' && currentImage" class="stage-image-wrap">
      <img :src="currentImage.url" :alt="currentImage.downloadName" class="stage-image" />

      <div v-if="images.length > 1" class="stage-pager">
        <span class="stage-page-info">
          {{ t('imageGeneration.result.currentOf', { current: currentIndex + 1, total: images.length }) }}
        </span>
        <button
          type="button"
          class="stage-pager-btn"
          :disabled="currentIndex <= 0"
          :aria-label="t('imageGeneration.result.prev')"
          @click="emit('select', currentIndex - 1)"
        >
          <Icon name="chevronLeft" size="sm" />
        </button>
        <button
          type="button"
          class="stage-pager-btn"
          :disabled="currentIndex >= images.length - 1"
          :aria-label="t('imageGeneration.result.next')"
          @click="emit('select', currentIndex + 1)"
        >
          <Icon name="chevronRight" size="sm" />
        </button>
      </div>

      <div class="stage-actions">
        <button
          type="button"
          class="stage-action-btn"
          :title="t('imageGeneration.result.download')"
          @click="download(currentImage)"
        >
          <Icon name="download" size="sm" />
        </button>
        <button
          type="button"
          class="stage-action-btn"
          :title="t('imageGeneration.result.fullscreen')"
          @click="emit('toggle-fullscreen')"
        >
          <Icon name="eye" size="sm" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
/* aspect 比例不再约束舞台本身（舞台始终全高 contain），只作为骨架占位符的形状提示 */
.result-stage.aspect-1\:1 {
  --stage-ratio: 1 / 1;
}
.result-stage.aspect-16\:9 {
  --stage-ratio: 16 / 9;
}
.result-stage.aspect-9\:16 {
  --stage-ratio: 9 / 16;
}
.result-stage.aspect-4\:3 {
  --stage-ratio: 4 / 3;
}
.result-stage.aspect-3\:4 {
  --stage-ratio: 3 / 4;
}
.result-stage.aspect-auto {
  --stage-ratio: 4 / 3;
}
.stage-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
  min-height: 16rem;
  padding: 1.5rem;
  text-align: center;
}
.stage-idle-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background-image: linear-gradient(135deg, #14b8a6, #0d9488);
  box-shadow: 0 8px 24px rgba(20, 184, 166, 0.35);
  margin-bottom: 0.5rem;
}
.stage-empty-canvas {
  width: min(50%, 18rem);
  aspect-ratio: 1 / 1;
  border-radius: 1.5rem;
  border: 1.5px dashed rgba(20, 184, 166, 0.4);
  background: linear-gradient(135deg, rgba(20, 184, 166, 0.08), rgba(13, 148, 136, 0.03));
}
.stage-skeleton {
  width: min(60%, 26rem);
  aspect-ratio: var(--stage-ratio, 1 / 1);
  max-height: 65%;
  border-radius: 1rem;
  background: linear-gradient(100deg, #e5e7eb 30%, #f8fafc 50%, #e5e7eb 70%);
  background-size: 200% 100%;
  animation: stage-shimmer 1.8s ease-in-out infinite;
}
:global(html.dark) .stage-skeleton {
  background: linear-gradient(100deg, #334155 30%, #1e293b 50%, #334155 70%);
  background-size: 200% 100%;
}
@keyframes stage-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
.stage-title {
  font-weight: 600;
}
.stage-hint {
  font-size: 0.8125rem;
  opacity: 0.65;
}
.stage-error {
  font-size: 0.875rem;
  color: #dc2626;
  max-width: 90%;
  overflow-wrap: anywhere;
}
.stage-image-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.stage-pager {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.stage-page-info {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
  color: #fff;
}
.stage-pager-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: auto;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #0f172a;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}
:global(html.dark) .stage-pager-btn {
  background: rgba(30, 41, 59, 0.8);
  color: #f1f5f9;
}
.stage-pager-btn:first-of-type {
  left: 0.75rem;
}
.stage-pager-btn:last-of-type {
  right: 0.75rem;
}
.stage-pager-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.stage-actions {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  gap: 0.375rem;
}
.stage-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  border: none;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  color: #0f172a;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}
:global(html.dark) .stage-action-btn {
  background: rgba(30, 41, 59, 0.8);
  color: #f1f5f9;
}
</style>
