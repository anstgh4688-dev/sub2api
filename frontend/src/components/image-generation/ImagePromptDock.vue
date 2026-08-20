<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TextArea from '@/components/common/TextArea.vue'
import Icon from '@/components/icons/Icon.vue'
import ImageSettingsPopover from './ImageSettingsPopover.vue'
import type { ImageModelProfile } from '@/features/image-generation/types'
import type { ImageGenerationSettings } from '@/features/image-generation/types'

defineProps<{
  prompt: string
  generating: boolean
  disabled: boolean
  profile: ImageModelProfile | null
  settings: ImageGenerationSettings
  settingsOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'update:prompt', value: string): void
  (e: 'update:settings', value: ImageGenerationSettings): void
  (e: 'update:settings-open', value: boolean): void
  (e: 'generate'): void
  (e: 'stop'): void
}>()

const { t } = useI18n()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    emit('generate')
  }
}
</script>

<template>
  <div class="prompt-dock border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
    <div class="prompt-settings-anchor">
      <ImageSettingsPopover
        :profile="profile"
        :settings="settings"
        :open="settingsOpen"
        @update:open="emit('update:settings-open', $event)"
        @update:settings="emit('update:settings', $event)"
      />
    </div>

    <div class="prompt-input-row">
      <TextArea
        class="prompt-textarea"
        :model-value="prompt"
        :placeholder="t('imageGeneration.prompt.placeholder')"
        :rows="3"
        :disabled="generating"
        @update:model-value="emit('update:prompt', $event)"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="prompt-settings-btn"
        :title="t('imageGeneration.settings.label')"
        :aria-expanded="settingsOpen"
        :aria-label="t('imageGeneration.settings.label')"
        @click="emit('update:settings-open', !settingsOpen)"
      >
        <Icon name="cog" size="sm" />
      </button>
      <button
        type="button"
        class="prompt-submit-btn"
        :class="generating ? 'prompt-submit-stop' : 'prompt-submit-go'"
        :disabled="disabled && !generating"
        @click="generating ? emit('stop') : emit('generate')"
      >
        <span v-if="!generating">{{ t('imageGeneration.footer.generate') }}</span>
        <span v-else>{{ t('imageGeneration.footer.stop') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt-dock {
  position: relative;
  border-radius: 8px;
  padding: 0.625rem;
}
.prompt-settings-anchor {
  position: relative;
}
.prompt-input-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}
.prompt-textarea {
  flex: 1;
  min-width: 0;
}
.prompt-settings-btn,
.prompt-submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  border-radius: 8px;
  cursor: pointer;
}
.prompt-settings-btn {
  width: 2.25rem;
  background: none;
  color: inherit;
}
.prompt-submit-btn {
  padding: 0 1rem;
  border: none;
  font-weight: 600;
  white-space: nowrap;
}
.prompt-submit-go {
  background: #2563eb;
  color: #fff;
}
.prompt-submit-stop {
  background: #dc2626;
  color: #fff;
}
.prompt-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
