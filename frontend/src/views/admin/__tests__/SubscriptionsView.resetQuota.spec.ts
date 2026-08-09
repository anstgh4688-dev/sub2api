import { defineComponent, nextTick } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSubscription } from '@/types'
import SubscriptionQuotaResetDialog from '@/components/admin/subscription/SubscriptionQuotaResetDialog.vue'
import SubscriptionsView from '../SubscriptionsView.vue'

const listSubscriptions = vi.hoisted(() => vi.fn())
const getAllGroups = vi.hoisted(() => vi.fn())

vi.mock('@/api/admin', () => ({
  adminAPI: {
    subscriptions: {
      list: listSubscriptions
    },
    groups: {
      getAll: getAllGroups
    },
    usage: {
      searchUsers: vi.fn()
    }
  }
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn()
  })
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
  user: {
    id: 7,
    email: 'member@example.com'
  } as UserSubscription['user']
}

const DataTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  template: `
    <div>
      <div v-for="row in data" :key="row.id">
        <slot name="cell-actions" :row="row" />
      </div>
    </div>
  `
})

describe('SubscriptionsView quota reset entry', () => {
  beforeEach(() => {
    listSubscriptions.mockReset().mockResolvedValue({
      items: [subscription],
      total: 1,
      pages: 1
    })
    getAllGroups.mockReset().mockResolvedValue([])
    localStorage.clear()
  })

  it('opens the shared reset dialog and refreshes after a successful reset', async () => {
    const wrapper = shallowMount(SubscriptionsView, {
      global: {
        stubs: {
          AppLayout: { template: '<main><slot /></main>' },
          TablePageLayout: {
            template: '<section><slot name="filters" /><slot name="table" /><slot name="pagination" /></section>'
          },
          DataTable: DataTableStub,
          Pagination: true,
          BaseDialog: true,
          ConfirmDialog: true,
          EmptyState: true,
          Select: true,
          GroupBadge: true,
          GroupOptionItem: true,
          Icon: true,
          RouterLink: true,
          Teleport: true,
          Transition: false
        }
      }
    })

    await flushPromises()
    await wrapper.get('[data-test="reset-quota-open"]').trigger('click')
    await nextTick()

    const dialog = wrapper.findComponent(SubscriptionQuotaResetDialog)
    expect(dialog.props('show')).toBe(true)
    expect(dialog.props('subscription')).toEqual(subscription)

    dialog.vm.$emit('reset', subscription)
    await flushPromises()
    expect(listSubscriptions).toHaveBeenCalledTimes(2)

    dialog.vm.$emit('close')
    await nextTick()
    expect(dialog.props('show')).toBe(false)

    wrapper.unmount()
  })
})
