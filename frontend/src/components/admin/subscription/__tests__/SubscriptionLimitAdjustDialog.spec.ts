import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSubscription } from '@/types'
import SubscriptionLimitAdjustDialog from '../SubscriptionLimitAdjustDialog.vue'

const updateLimits = vi.hoisted(() => vi.fn())
const showSuccess = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())

vi.mock('@/api/admin', () => ({
  adminAPI: {
    subscriptions: { updateLimits }
  }
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showSuccess, showError })
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key })
  }
})

const subscription: UserSubscription = {
  id: 42,
  user_id: 7,
  group_id: 3,
  status: 'active',
  starts_at: '2026-07-01T00:00:00Z',
  daily_usage_usd: 2,
  weekly_usage_usd: 10,
  monthly_usage_usd: 30,
  daily_limit_usd: 100,
  weekly_limit_usd: 250,
  monthly_limit_usd: 1000,
  group_daily_limit_usd: 100,
  group_weekly_limit_usd: 500,
  group_monthly_limit_usd: 1000,
  daily_limit_override_usd: null,
  weekly_limit_override_usd: 250,
  monthly_limit_override_usd: null,
  daily_window_start: '2026-07-20T00:00:00Z',
  weekly_window_start: '2026-07-14T00:00:00Z',
  monthly_window_start: '2026-07-01T00:00:00Z',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
  expires_at: '2026-08-01T00:00:00Z'
}

const BaseDialogStub = defineComponent({
  props: {
    show: Boolean,
    closeOnEscape: Boolean,
    showCloseButton: Boolean
  },
  emits: ['close'],
  template: `
    <section v-if="show" data-test="base-dialog" :data-close-on-escape="String(closeOnEscape)">
      <button type="button" data-test="dialog-close" @click="$emit('close')">close</button>
      <slot />
      <footer><slot name="footer" /></footer>
    </section>
  `
})

const mountDialog = () => mount(SubscriptionLimitAdjustDialog, {
  props: { show: true, subscription },
  global: {
    stubs: {
      BaseDialog: BaseDialogStub,
      Icon: true
    }
  }
})

describe('SubscriptionLimitAdjustDialog', () => {
  beforeEach(() => {
    updateLimits.mockReset().mockResolvedValue(subscription)
    showSuccess.mockReset()
    showError.mockReset()
  })

  it('submits percentage, custom, and inherited limits together', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-test="limit-mode-daily-percentage"]').trigger('click')
    await wrapper.get('[data-test="limit-percentage-daily"]').setValue('50')
    await wrapper.get('[data-test="limit-custom-weekly"]').setValue('420')
    await wrapper.get('[data-test="save-subscription-limits"]').trigger('click')
    await flushPromises()

    expect(updateLimits).toHaveBeenCalledWith(subscription.id, {
      daily_limit_usd: 50,
      weekly_limit_usd: 420,
      monthly_limit_usd: null
    })
    expect(showSuccess).toHaveBeenCalledWith('admin.subscriptions.adjustLimitsSuccess')
    expect(wrapper.emitted('updated')).toEqual([[subscription]])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('disables percentage mode when the group has no finite base limit', async () => {
    const wrapper = mount(SubscriptionLimitAdjustDialog, {
      props: {
        show: true,
        subscription: { ...subscription, group_monthly_limit_usd: null }
      },
      global: { stubs: { BaseDialog: BaseDialogStub, Icon: true } }
    })

    expect(wrapper.get('[data-test="limit-mode-monthly-percentage"]').attributes()).toHaveProperty('disabled')
  })

  it('blocks duplicate saves and closing while the request is pending', async () => {
    let resolveUpdate!: (value: UserSubscription) => void
    updateLimits.mockImplementationOnce(() => new Promise<UserSubscription>((resolve) => {
      resolveUpdate = resolve
    }))
    const wrapper = mountDialog()

    await wrapper.get('[data-test="save-subscription-limits"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-test="save-subscription-limits"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('[data-test="base-dialog"]').attributes('data-close-on-escape')).toBe('false')
    await wrapper.get('[data-test="save-subscription-limits"]').trigger('click')
    await wrapper.get('[data-test="dialog-close"]').trigger('click')
    expect(updateLimits).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeUndefined()

    resolveUpdate(subscription)
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps the dialog open after an API failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    updateLimits.mockRejectedValueOnce({ status: 409, message: 'Limit update conflicted' })
    const wrapper = mountDialog()

    await wrapper.get('[data-test="save-subscription-limits"]').trigger('click')
    await flushPromises()

    expect(showError).toHaveBeenCalledWith('Limit update conflicted')
    expect(wrapper.emitted('updated')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get('[data-test="save-subscription-limits"]').attributes()).not.toHaveProperty('disabled')
    consoleError.mockRestore()
  })
})
