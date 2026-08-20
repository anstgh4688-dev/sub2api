<template>
  <AppLayout>
    <TablePageLayout>
      <template #filters>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="relative w-full sm:w-80" data-quota-user-search>
            <Icon
              name="search"
              size="md"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              v-model="userKeyword"
              type="text"
              class="input pl-10 pr-9"
              :placeholder="t('admin.subscriptions.quotaResetPage.searchPlaceholder')"
              @input="debounceUserSearch"
              @focus="showUserDropdown = true"
            />
            <button
              v-if="selectedUser"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              :title="t('common.clear')"
              @click="clearUser"
            >
              <Icon name="x" size="sm" />
            </button>

            <div
              v-if="showUserDropdown && (userResults.length > 0 || userKeyword)"
              class="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800"
            >
              <div
                v-if="userSearchLoading"
                class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
              >
                {{ t('common.loading') }}
              </div>
              <div
                v-else-if="userResults.length === 0"
                class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
              >
                {{ t('common.noOptionsFound') }}
              </div>
              <button
                v-for="user in userResults"
                :key="user.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-700"
                @click="selectUser(user)"
              >
                <span class="min-w-0 truncate font-medium text-gray-900 dark:text-white">
                  {{ user.email }}
                </span>
                <span class="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  #{{ user.id }}
                </span>
              </button>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-secondary"
            :disabled="loading"
            :title="t('common.refresh')"
            @click="loadSubscriptions"
          >
            <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
          </button>
        </div>
      </template>

      <template #table>
        <DataTable
          :columns="columns"
          :data="subscriptions"
          :loading="loading"
          row-key="id"
        >
          <template #cell-user="{ row }">
            <div class="min-w-0">
              <div class="max-w-64 truncate font-medium text-gray-900 dark:text-white">
                {{ row.user?.email || `#${row.user_id}` }}
              </div>
              <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                #{{ row.user_id }}
              </div>
            </div>
          </template>

          <template #cell-group="{ row }">
            <div class="min-w-36">
              <div class="font-medium text-gray-800 dark:text-gray-200">
                {{ row.group?.name || `#${row.group_id}` }}
              </div>
              <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                #{{ row.group_id }}
              </div>
            </div>
          </template>

          <template #cell-daily="{ row }">
            <QuotaUsageMeter
              :used="row.daily_usage_usd"
              :limit="row.group?.daily_limit_usd"
            />
          </template>

          <template #cell-weekly="{ row }">
            <QuotaUsageMeter
              :used="row.weekly_usage_usd"
              :limit="row.group?.weekly_limit_usd"
            />
          </template>

          <template #cell-monthly="{ row }">
            <QuotaUsageMeter
              :used="row.monthly_usage_usd"
              :limit="row.group?.monthly_limit_usd"
            />
          </template>

          <template #cell-expires="{ row }">
            <span v-if="row.expires_at" class="whitespace-nowrap text-gray-700 dark:text-gray-300">
              {{ formatDateOnly(row.expires_at) }}
            </span>
            <span v-else class="text-gray-500 dark:text-gray-400">
              {{ t('admin.subscriptions.noExpiration') }}
            </span>
          </template>

          <template #cell-actions="{ row }">
            <button
              type="button"
              class="btn btn-secondary btn-sm whitespace-nowrap"
              data-test="open-quota-reset"
              @click="openResetDialog(row)"
            >
              <Icon name="refresh" size="sm" />
              {{ t('admin.subscriptions.resetQuota') }}
            </button>
          </template>

          <template #empty>
            <EmptyState
              :title="t('admin.subscriptions.quotaResetPage.noActiveSubscriptions')"
            />
          </template>
        </DataTable>
      </template>

      <template #pagination>
        <Pagination
          v-if="pagination.total > 0"
          :page="pagination.page"
          :total="pagination.total"
          :page-size="pagination.pageSize"
          @update:page="handlePageChange"
          @update:pageSize="handlePageSizeChange"
        />
      </template>
    </TablePageLayout>

    <SubscriptionQuotaResetDialog
      :show="showResetDialog"
      :subscription="resettingSubscription"
      :scopes="quotaScopes"
      @close="closeResetDialog"
      @reset="handleResetSuccess"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { SimpleUser } from '@/api/admin/usage'
import type { UserSubscription } from '@/types'
import type { Column } from '@/components/common/types'
import { useAppStore } from '@/stores/app'
import { getPersistedPageSize } from '@/composables/usePersistedPageSize'
import { formatDateOnly } from '@/utils/format'
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
import DataTable from '@/components/common/DataTable.vue'
import Pagination from '@/components/common/Pagination.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Icon from '@/components/icons/Icon.vue'
import QuotaUsageMeter from '@/components/admin/subscription/QuotaUsageMeter.vue'
import SubscriptionQuotaResetDialog from '@/components/admin/subscription/SubscriptionQuotaResetDialog.vue'

const { t } = useI18n()
const appStore = useAppStore()

const quotaScopes: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly']
const subscriptions = ref<UserSubscription[]>([])
const loading = ref(false)
const userKeyword = ref('')
const userResults = ref<SimpleUser[]>([])
const userSearchLoading = ref(false)
const showUserDropdown = ref(false)
const selectedUser = ref<SimpleUser | null>(null)
const showResetDialog = ref(false)
const resettingSubscription = ref<UserSubscription | null>(null)
let userSearchTimer: ReturnType<typeof setTimeout> | null = null
let requestController: AbortController | null = null

const pagination = reactive({
  page: 1,
  pageSize: getPersistedPageSize(),
  total: 0
})

const columns = computed<Column[]>(() => [
  { key: 'user', label: t('admin.subscriptions.columns.user') },
  { key: 'group', label: t('admin.subscriptions.columns.group') },
  { key: 'daily', label: t('admin.subscriptions.quotaResetPage.dailyUsage') },
  { key: 'weekly', label: t('admin.subscriptions.quotaResetPage.weeklyUsage') },
  { key: 'monthly', label: t('admin.subscriptions.quotaResetPage.monthlyUsage') },
  { key: 'expires', label: t('admin.subscriptions.columns.expires') },
  { key: 'actions', label: t('admin.subscriptions.columns.actions'), class: 'text-right' }
])

const loadSubscriptions = async () => {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  loading.value = true

  try {
    const response = await adminAPI.subscriptions.list(
      pagination.page,
      pagination.pageSize,
      {
        status: 'active',
        user_id: selectedUser.value?.id,
        sort_by: 'updated_at',
        sort_order: 'desc'
      },
      { signal: controller.signal }
    )
    subscriptions.value = response.items
    pagination.total = response.total
  } catch (error: any) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
      return
    }
    appStore.showError(t('admin.subscriptions.failedToLoad'))
    console.error('Error loading subscriptions for quota reset:', error)
  } finally {
    if (requestController === controller) {
      requestController = null
      loading.value = false
    }
  }
}

const debounceUserSearch = () => {
  if (userSearchTimer) clearTimeout(userSearchTimer)

  if (selectedUser.value && userKeyword.value.trim() !== selectedUser.value.email) {
    selectedUser.value = null
    pagination.page = 1
    void loadSubscriptions()
  }

  userSearchTimer = setTimeout(searchUsers, 300)
}

const searchUsers = async () => {
  const keyword = userKeyword.value.trim()
  if (!keyword) {
    userResults.value = []
    return
  }

  userSearchLoading.value = true
  try {
    const results = await adminAPI.usage.searchUsers(keyword)
    userResults.value = results.filter((user) => !user.deleted)
  } catch (error) {
    userResults.value = []
    console.error('Failed to search users for quota reset:', error)
  } finally {
    userSearchLoading.value = false
  }
}

const selectUser = (user: SimpleUser) => {
  selectedUser.value = user
  userKeyword.value = user.email
  userResults.value = []
  showUserDropdown.value = false
  pagination.page = 1
  void loadSubscriptions()
}

const clearUser = () => {
  selectedUser.value = null
  userKeyword.value = ''
  userResults.value = []
  showUserDropdown.value = false
  pagination.page = 1
  void loadSubscriptions()
}

const handlePageChange = (page: number) => {
  pagination.page = page
  void loadSubscriptions()
}

const handlePageSizeChange = (pageSize: number) => {
  pagination.pageSize = pageSize
  pagination.page = 1
  void loadSubscriptions()
}

const openResetDialog = (subscription: UserSubscription) => {
  resettingSubscription.value = subscription
  showResetDialog.value = true
}

const closeResetDialog = () => {
  showResetDialog.value = false
  resettingSubscription.value = null
}

const handleResetSuccess = () => {
  void loadSubscriptions()
}

const closeUserDropdown = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('[data-quota-user-search]')) showUserDropdown.value = false
}

onMounted(() => {
  document.addEventListener('click', closeUserDropdown)
  void loadSubscriptions()
})

onUnmounted(() => {
  document.removeEventListener('click', closeUserDropdown)
  if (userSearchTimer) clearTimeout(userSearchTimer)
  requestController?.abort()
})
</script>
