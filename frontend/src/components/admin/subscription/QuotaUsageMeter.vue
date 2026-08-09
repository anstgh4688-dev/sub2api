<template>
  <div class="w-44 space-y-1.5">
    <div class="flex items-baseline justify-between gap-3 text-xs">
      <span class="font-semibold tabular-nums text-gray-900 dark:text-white">
        {{ formatCurrency(used) }}
      </span>
      <span class="truncate text-gray-500 dark:text-gray-400">
        {{ limitLabel }}
      </span>
    </div>
    <div v-if="hasLimit" class="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
      <div
        class="h-full rounded-full transition-[width] duration-300"
        :class="barClass"
        :style="{ width: `${percentage}%` }"
      />
    </div>
    <div v-else class="h-1.5 rounded-full bg-gray-100 dark:bg-dark-800" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatCurrency } from '@/utils/format'

const props = defineProps<{
  used: number
  limit?: number | null
}>()

const { t } = useI18n()
const hasLimit = computed(() => props.limit !== null && props.limit !== undefined && props.limit > 0)
const percentage = computed(() => {
  if (!hasLimit.value || !props.limit) return 0
  return Math.min(100, Math.max(0, (props.used / props.limit) * 100))
})
const limitLabel = computed(() =>
  hasLimit.value
    ? t('admin.subscriptions.quotaResetPage.ofLimit', { limit: formatCurrency(props.limit) })
    : t('admin.subscriptions.unlimited')
)
const barClass = computed(() => {
  if (percentage.value >= 100) return 'bg-red-500'
  if (percentage.value >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
})
</script>
