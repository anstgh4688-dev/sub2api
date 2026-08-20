<template>
  <BaseDialog
    :show="show"
    :title="t('admin.subscriptions.resetQuotaTitle')"
    width="normal"
    :close-on-escape="!submitting"
    :show-close-button="!submitting"
    @close="closeDialog"
  >
    <p class="text-sm leading-6 text-gray-600 dark:text-gray-400">
      {{
        t('admin.subscriptions.resetQuotaConfirm', {
          user: subscription?.user?.email || `#${subscription?.user_id ?? ''}`
        })
      }}
    </p>

    <template #footer>
      <div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          class="btn btn-secondary w-full"
          :disabled="submitting"
          data-test="reset-quota-cancel"
          @click="closeDialog"
        >
          <Icon name="x" size="sm" />
          {{ t('common.cancel') }}
        </button>
        <button
          v-for="action in actions"
          :key="action.scope"
          type="button"
          :class="['btn w-full', action.buttonClass]"
          :disabled="submitting || !subscription"
          :data-test="action.testId"
          @click="resetQuota(action.scope)"
        >
          <Icon :name="action.icon" size="sm" />
          {{ t(action.labelKey) }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores/app'
import type { UserSubscription } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'

type ResetQuotaScope = 'daily' | 'weekly' | 'monthly' | 'all'

interface Props {
  show: boolean
  subscription: UserSubscription | null
  scopes?: ResetQuotaScope[]
}

const props = withDefaults(defineProps<Props>(), {
  scopes: () => ['daily', 'weekly', 'monthly', 'all']
})

const emit = defineEmits<{
  close: []
  reset: [subscription: UserSubscription]
}>()

const { t } = useI18n()
const appStore = useAppStore()
const submitting = ref(false)

const actionConfig = {
  daily: {
    scope: 'daily',
    labelKey: 'admin.subscriptions.resetDailyQuota',
    icon: 'sun',
    buttonClass: 'btn-secondary',
    testId: 'reset-quota-daily',
    payload: { daily: true, weekly: false, monthly: false }
  },
  weekly: {
    scope: 'weekly',
    labelKey: 'admin.subscriptions.resetWeeklyQuota',
    icon: 'calendar',
    buttonClass: 'btn-secondary',
    testId: 'reset-quota-weekly',
    payload: { daily: false, weekly: true, monthly: false }
  },
  monthly: {
    scope: 'monthly',
    labelKey: 'admin.subscriptions.resetMonthlyQuota',
    icon: 'calendar',
    buttonClass: 'btn-secondary',
    testId: 'reset-quota-monthly',
    payload: { daily: false, weekly: false, monthly: true }
  },
  all: {
    scope: 'all',
    labelKey: 'admin.subscriptions.resetAllQuota',
    icon: 'refresh',
    buttonClass: 'btn-warning',
    testId: 'reset-quota-all',
    payload: { daily: true, weekly: true, monthly: true }
  }
} as const

const actions = computed(() => props.scopes.map((scope) => actionConfig[scope]))

const closeDialog = () => {
  if (submitting.value) return
  emit('close')
}

const resetQuota = async (scope: ResetQuotaScope) => {
  if (!props.subscription || submitting.value) return

  submitting.value = true
  try {
    const updated = await adminAPI.subscriptions.resetQuota(
      props.subscription.id,
      actionConfig[scope].payload
    )
    appStore.showSuccess(t('admin.subscriptions.quotaResetSuccess'))
    emit('reset', updated)
    emit('close')
  } catch (error: unknown) {
    appStore.showError(extractApiErrorMessage(error, t('admin.subscriptions.failedToResetQuota')))
    console.error('Error resetting quota:', error)
  } finally {
    submitting.value = false
  }
}
</script>
