import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSubscription } from '@/types'
import SubscriptionQuotaResetDialog from '../SubscriptionQuotaResetDialog.vue'

const resetQuota = vi.hoisted(() => vi.fn())
const showSuccess = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())

vi.mock('@/api/admin', () => ({
  adminAPI: {
    subscriptions: { resetQuota }
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
  daily_window_start: '2026-07-20T00:00:00Z',
  weekly_window_start: '2026-07-14T00:00:00Z',
  monthly_window_start: '2026-07-01T00:00:00Z',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
  expires_at: '2026-08-01T00:00:00Z',
  user: { id: 7, email: 'member@example.com' } as UserSubscription['user']
}

const BaseDialogStub = defineComponent({
  props: {
    show: Boolean,
    closeOnEscape: Boolean,
    showCloseButton: Boolean
  },
  emits: ['close'],
  template: `
    <section
      v-if="show"
      data-test="base-dialog"
      :data-close-on-escape="String(closeOnEscape)"
      :data-show-close-button="String(showCloseButton)"
    >
      <button type="button" data-test="dialog-close" @click="$emit('close')">close</button>
      <slot />
      <footer><slot name="footer" /></footer>
    </section>
  `
})

const mountDialog = (scopes?: Array<'daily' | 'weekly' | 'monthly' | 'all'>) =>
  mount(SubscriptionQuotaResetDialog, {
    props: {
      show: true,
      subscription,
      ...(scopes ? { scopes } : {})
    },
    global: {
      stubs: {
        BaseDialog: BaseDialogStub,
        Icon: true
      }
    }
  })

describe('SubscriptionQuotaResetDialog', () => {
  beforeEach(() => {
    resetQuota.mockReset().mockResolvedValue(subscription)
    showSuccess.mockReset()
    showError.mockReset()
  })

  it.each([
    ['reset-quota-daily', { daily: true, weekly: false, monthly: false }],
    ['reset-quota-weekly', { daily: false, weekly: true, monthly: false }],
    ['reset-quota-monthly', { daily: false, weekly: false, monthly: true }],
    ['reset-quota-all', { daily: true, weekly: true, monthly: true }]
  ])('submits the %s payload', async (selector, payload) => {
    const wrapper = mountDialog()

    await wrapper.get(`[data-test="${selector}"]`).trigger('click')
    await flushPromises()

    expect(resetQuota).toHaveBeenCalledOnce()
    expect(resetQuota).toHaveBeenCalledWith(subscription.id, payload)
    expect(showSuccess).toHaveBeenCalledWith('admin.subscriptions.quotaResetSuccess')
    expect(wrapper.emitted('reset')).toEqual([[subscription]])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('can restrict the available reset scopes', () => {
    const wrapper = mountDialog(['daily', 'weekly'])

    expect(wrapper.find('[data-test="reset-quota-daily"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="reset-quota-weekly"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="reset-quota-monthly"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="reset-quota-all"]').exists()).toBe(false)
  })

  it('blocks duplicate submissions and closing while a reset is pending', async () => {
    let resolveReset!: (value: UserSubscription) => void
    resetQuota.mockImplementationOnce(
      () => new Promise<UserSubscription>((resolve) => {
        resolveReset = resolve
      })
    )
    const wrapper = mountDialog()

    await wrapper.get('[data-test="reset-quota-daily"]').trigger('click')
    await nextTick()

    for (const selector of [
      'reset-quota-cancel',
      'reset-quota-daily',
      'reset-quota-weekly',
      'reset-quota-monthly',
      'reset-quota-all'
    ]) {
      expect(wrapper.get(`[data-test="${selector}"]`).attributes()).toHaveProperty('disabled')
    }
    expect(wrapper.get('[data-test="base-dialog"]').attributes('data-close-on-escape')).toBe('false')

    await wrapper.get('[data-test="reset-quota-weekly"]').trigger('click')
    await wrapper.get('[data-test="dialog-close"]').trigger('click')
    expect(resetQuota).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeUndefined()

    resolveReset(subscription)
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps actions available after a failed reset', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    resetQuota.mockRejectedValueOnce({ status: 409, message: 'Reset conflicted with newer usage' })
    const wrapper = mountDialog()

    await wrapper.get('[data-test="reset-quota-weekly"]').trigger('click')
    await flushPromises()

    expect(showError).toHaveBeenCalledWith('Reset conflicted with newer usage')
    expect(wrapper.emitted('reset')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get('[data-test="reset-quota-weekly"]').attributes()).not.toHaveProperty('disabled')

    consoleError.mockRestore()
  })
})
