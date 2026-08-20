import { defineComponent } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSubscription } from '@/types'
import SubscriptionQuotaResetDialog from '@/components/admin/subscription/SubscriptionQuotaResetDialog.vue'
import SubscriptionQuotaResetView from '../SubscriptionQuotaResetView.vue'

const listSubscriptions = vi.hoisted(() => vi.fn())

vi.mock('@/api/admin', () => ({
  adminAPI: {
    subscriptions: { list: listSubscriptions },
    usage: { searchUsers: vi.fn() }
  }
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showError: vi.fn() })
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key })
  }
})

vi.mock('@/composables/usePersistedPageSize', () => ({
  getPersistedPageSize: () => 20
}))

const subscription: UserSubscription = {
  id: 11,
  user_id: 21,
  group_id: 5,
  status: 'active',
  starts_at: '2026-08-01T00:00:00Z',
  daily_usage_usd: 150.711478,
  weekly_usage_usd: 255.970793,
  monthly_usage_usd: 255.970793,
  daily_window_start: '2026-08-04T00:00:00Z',
  weekly_window_start: '2026-08-03T00:00:00Z',
  monthly_window_start: '2026-08-03T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-04T00:00:00Z',
  expires_at: '2026-09-01T00:00:00Z',
  user: { id: 21, email: 'diablo@zuike.com' } as UserSubscription['user'],
  group: {
    id: 5,
    name: 'open订阅',
    daily_limit_usd: 150,
    weekly_limit_usd: 300,
    monthly_limit_usd: 900
  } as UserSubscription['group']
}

const DataTableStub = defineComponent({
  props: {
    columns: { type: Array, default: () => [] },
    data: { type: Array, default: () => [] }
  },
  template: `
    <div>
      <div v-for="row in data" :key="row.id">
        <slot name="cell-monthly" :row="row" />
        <slot name="cell-actions" :row="row" />
      </div>
    </div>
  `
})

const QuotaUsageMeterStub = defineComponent({
  props: { used: Number, limit: Number },
  template: '<div data-test="quota-usage-meter" :data-used="used" :data-limit="limit" />'
})

describe('SubscriptionQuotaResetView', () => {
  beforeEach(() => {
    listSubscriptions.mockReset().mockResolvedValue({
      items: [subscription],
      total: 1,
      pages: 1
    })
  })

  it('shows monthly usage and exposes daily, weekly, and monthly reset scopes', async () => {
    const wrapper = shallowMount(SubscriptionQuotaResetView, {
      global: {
        stubs: {
          AppLayout: { template: '<main><slot /></main>' },
          TablePageLayout: {
            template: '<section><slot name="filters" /><slot name="table" /><slot name="pagination" /></section>'
          },
          DataTable: DataTableStub,
          Pagination: true,
          EmptyState: true,
          Icon: true,
          QuotaUsageMeter: QuotaUsageMeterStub
        }
      }
    })

    await flushPromises()
    expect(listSubscriptions).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({ status: 'active' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    await wrapper.get('[data-test="open-quota-reset"]').trigger('click')
    const table = wrapper.findComponent(DataTableStub)
    expect(table.props('columns')).toContainEqual(
      expect.objectContaining({
        key: 'monthly',
        label: 'admin.subscriptions.quotaResetPage.monthlyUsage'
      })
    )
    expect(wrapper.get('[data-test="quota-usage-meter"]').attributes()).toMatchObject({
      'data-used': String(subscription.monthly_usage_usd),
      'data-limit': String(subscription.group?.monthly_limit_usd)
    })

    const dialog = wrapper.findComponent(SubscriptionQuotaResetDialog)
    expect(dialog.props('show')).toBe(true)
    expect(dialog.props('subscription')).toEqual(subscription)
    expect(dialog.props('scopes')).toEqual(['daily', 'weekly', 'monthly'])

    dialog.vm.$emit('reset', subscription)
    await flushPromises()
    expect(listSubscriptions).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
