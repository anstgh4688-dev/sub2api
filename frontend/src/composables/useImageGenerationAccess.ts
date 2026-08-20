/**
 * 加载当前登录用户可用于生图工作台的本人 Key 列表。
 *
 * 数据只来自 JWT 保护的 /api/v1/keys；页面不做任何自由 Key 输入。
 * 页面状态中只保存所选 ApiKey 对象，禁止把 Key 复制到持久化 store / URL /
 * DOM data attribute / 日志 / 埋点。
 */

import { computed, ref } from 'vue'
import { keysAPI } from '@/api/keys'
import type { ApiKey } from '@/types'
import { isEligibleImageKey } from '@/features/image-generation/types'

const loading = ref(false)
const keys = ref<ApiKey[]>([])
const loaded = ref(false)
let pendingLoad: Promise<ApiKey[]> | null = null
const pageSize = 100

async function loadEligibleKeys(force = false): Promise<ApiKey[]> {
  if (loaded.value && !force) {
    return keys.value
  }
  if (pendingLoad && !force) {
    return pendingLoad
  }

  loading.value = true
  pendingLoad = (async () => {
    const result: ApiKey[] = []
    let page = 1
    while (true) {
      const response = await keysAPI.list(page, pageSize, {
        status: 'active',
        sort_by: 'created_at',
        sort_order: 'desc',
      })
      const items = response.items || []
      result.push(...items.filter(isEligibleImageKey))
      if (page >= response.pages || items.length === 0) {
        break
      }
      page += 1
    }
    keys.value = result
    loaded.value = true
    return result
  })()
    .catch((err: unknown) => {
      keys.value = []
      loaded.value = true
      throw err
    })
    .finally(() => {
      loading.value = false
      pendingLoad = null
    })

  return pendingLoad
}

export function useImageGenerationAccess() {
  const eligibleKeys = computed(() => keys.value)

  return {
    eligibleKeys,
    imageKeysLoading: computed(() => loading.value),
    imageKeysLoaded: computed(() => loaded.value),
    loadEligibleKeys,
  }
}
