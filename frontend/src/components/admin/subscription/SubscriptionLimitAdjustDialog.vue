<template>
  <BaseDialog
    :show="show"
    :title="t('admin.subscriptions.adjustLimitsTitle')"
    width="wide"
    :close-on-escape="!submitting"
    :show-close-button="!submitting"
    @close="closeDialog"
  >
    <div class="divide-y divide-gray-200 dark:divide-dark-700">
      <section
        v-for="period in periods"
        :key="period.key"
        class="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[9rem_minmax(0,1fr)]"
        :data-test="`limit-period-${period.key}`"
      >
        <div>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ t(period.labelKey) }}
          </h4>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ t('admin.subscriptions.groupLimit') }}:
            {{ formatLimit(groupLimit(period.key)) }}
          </div>
          <div class="mt-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            {{ t('admin.subscriptions.effectiveLimit') }}:
            {{ formatLimit(resolvedLimit(period.key)) }}
          </div>
        </div>

        <div class="min-w-0 space-y-4">
          <div
            class="grid grid-cols-3 overflow-hidden rounded-md border border-gray-300 dark:border-dark-600"
            role="group"
          >
            <button
              v-for="mode in modes"
              :key="mode.value"
              type="button"
              class="min-h-9 border-r border-gray-300 px-2 text-xs font-medium transition-colors last:border-r-0 dark:border-dark-600 sm:text-sm"
              :class="drafts[period.key].mode === mode.value
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-dark-700'"
              :disabled="submitting || (mode.value === 'percentage' && !canUsePercentage(period.key))"
              :data-test="`limit-mode-${period.key}-${mode.value}`"
              @click="setMode(period.key, mode.value)"
            >
              {{ t(mode.labelKey) }}
            </button>
          </div>

          <div v-if="drafts[period.key].mode === 'percentage'" class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem] sm:items-center">
            <input
              v-model.number="drafts[period.key].percentage"
              type="range"
              min="0"
              max="200"
              step="5"
              class="h-2 w-full cursor-pointer accent-primary-600"
              :disabled="submitting"
              :aria-label="t('admin.subscriptions.percentage')"
              :data-test="`limit-percentage-${period.key}`"
            />
            <div class="input flex h-10 items-center justify-center font-mono text-sm">
              {{ drafts[period.key].percentage }}%
            </div>
          </div>

          <div v-else-if="drafts[period.key].mode === 'custom'" class="relative max-w-xs">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
            <input
              v-model.number="drafts[period.key].custom"
              type="number"
              min="0"
              step="0.01"
              class="input pl-7"
              :disabled="submitting"
              :aria-label="t('admin.subscriptions.customAmount')"
              :data-test="`limit-custom-${period.key}`"
            />
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="btn btn-secondary" :disabled="submitting" @click="closeDialog">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="submitting || !subscription || !isValid"
          data-test="save-subscription-limits"
          @click="save"
        >
          <Icon v-if="submitting" name="refresh" size="sm" class="animate-spin" />
          <Icon v-else name="check" size="sm" />
          {{ submitting ? t('common.saving') : t('common.save') }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores/app'
import type { UserSubscription } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'

type PeriodKey = 'daily' | 'weekly' | 'monthly'
type LimitMode = 'inherit' | 'percentage' | 'custom'

interface LimitDraft {
  mode: LimitMode
  percentage: number
  custom: number
}

const props = defineProps<{
  show: boolean
  subscription: UserSubscription | null
}>()

const emit = defineEmits<{
  close: []
  updated: [subscription: UserSubscription]
}>()

const { t } = useI18n()
const appStore = useAppStore()
const periods: Array<{ key: PeriodKey; labelKey: string }> = [
  { key: 'daily', labelKey: 'admin.subscriptions.dailyLimit' },
  { key: 'weekly', labelKey: 'admin.subscriptions.weeklyLimit' },
  { key: 'monthly', labelKey: 'admin.subscriptions.monthlyLimit' }
]
const modes: Array<{ value: LimitMode; labelKey: string }> = [
  { value: 'inherit', labelKey: 'admin.subscriptions.inheritGroup' },
  { value: 'percentage', labelKey: 'admin.subscriptions.percentage' },
  { value: 'custom', labelKey: 'admin.subscriptions.customAmount' }
]
const drafts = reactive<Record<PeriodKey, LimitDraft>>({
  daily: { mode: 'inherit', percentage: 100, custom: 0 },
  weekly: { mode: 'inherit', percentage: 100, custom: 0 },
  monthly: { mode: 'inherit', percentage: 100, custom: 0 }
})
const submitting = ref(false)

const groupLimit = (period: PeriodKey): number | null => {
  const value = props.subscription?.[`group_${period}_limit_usd`]
  return typeof value === 'number' ? value : null
}

const overrideLimit = (period: PeriodKey): number | null => {
  const value = props.subscription?.[`${period}_limit_override_usd`]
  return typeof value === 'number' ? value : null
}

const canUsePercentage = (period: PeriodKey) => {
  const base = groupLimit(period)
  return base !== null && base > 0
}

const resolvedLimit = (period: PeriodKey): number | null => {
  const draft = drafts[period]
  if (draft.mode === 'inherit') return groupLimit(period)
  if (draft.mode === 'custom') return Number.isFinite(draft.custom) ? draft.custom : null
  const base = groupLimit(period)
  if (base === null) return null
  return Number((base * draft.percentage / 100).toFixed(10))
}

const formatLimit = (value: number | null) => {
  if (value === null || value === 0) return t('admin.subscriptions.unlimited')
  return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}`
}

const resetDrafts = () => {
  for (const period of periods) {
    const override = overrideLimit(period.key)
    drafts[period.key].mode = override === null ? 'inherit' : 'custom'
    drafts[period.key].percentage = 100
    drafts[period.key].custom = override ?? groupLimit(period.key) ?? 0
  }
}

watch(
  () => [props.show, props.subscription?.id],
  ([show]) => {
    if (show) resetDrafts()
  },
  { immediate: true }
)

const setMode = (period: PeriodKey, mode: LimitMode) => {
  if (mode === 'percentage' && !canUsePercentage(period)) return
  drafts[period].mode = mode
}

const isValid = computed(() => periods.every(({ key }) => {
  const draft = drafts[key]
  if (draft.mode === 'inherit') return true
  if (draft.mode === 'percentage') {
    return canUsePercentage(key) && Number.isFinite(draft.percentage) && draft.percentage >= 0 && draft.percentage <= 200
  }
  return Number.isFinite(draft.custom) && draft.custom >= 0
}))

const closeDialog = () => {
  if (submitting.value) return
  emit('close')
}

const save = async () => {
  if (!props.subscription || submitting.value || !isValid.value) return
  submitting.value = true
  try {
    const updated = await adminAPI.subscriptions.updateLimits(props.subscription.id, {
      daily_limit_usd: drafts.daily.mode === 'inherit' ? null : resolvedLimit('daily'),
      weekly_limit_usd: drafts.weekly.mode === 'inherit' ? null : resolvedLimit('weekly'),
      monthly_limit_usd: drafts.monthly.mode === 'inherit' ? null : resolvedLimit('monthly')
    })
    appStore.showSuccess(t('admin.subscriptions.adjustLimitsSuccess'))
    emit('updated', updated)
    emit('close')
  } catch (error: unknown) {
    appStore.showError(extractApiErrorMessage(error, t('admin.subscriptions.failedToAdjustLimits')))
    console.error('Error adjusting subscription limits:', error)
  } finally {
    submitting.value = false
  }
}
</script>
