import { beforeEach, describe, expect, it, vi } from 'vitest'

const routerHarness = vi.hoisted(() => ({
  createRouterMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  createWebHistory: vi.fn(() => ({})),
  createRouter: routerHarness.createRouterMock,
  useRoute: vi.fn(() => ({ meta: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  RouterView: { template: '<div />' },
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    checkAuth: vi.fn(),
    isAuthenticated: true,
    isAdmin: false,
    isSimpleMode: false,
    hasPendingAuthSession: false,
  }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    siteName: 'Sub2API',
    backendModeEnabled: false,
    publicSettingsLoaded: true,
    cachedPublicSettings: {},
    fetchPublicSettings: vi.fn(),
  }),
}))

vi.mock('@/stores/adminSettings', () => ({
  useAdminSettingsStore: () => ({ opsMonitoringEnabled: false, paymentEnabled: false }),
}))

vi.mock('@/stores/adminCompliance', () => ({
  useAdminComplianceStore: () => ({ initialized: true, complianceEnabled: false }),
}))

vi.mock('@/composables/useNavigationLoading', () => ({
  useNavigationLoadingState: () => ({
    startNavigation: vi.fn(),
    endNavigation: vi.fn(),
    isLoading: { value: false },
  }),
  useNavigationLoading: () => ({
    startNavigation: vi.fn(),
    endNavigation: vi.fn(),
    isLoading: { value: false },
  }),
}))

vi.mock('@/composables/useRoutePrefetch', () => ({
  useRoutePrefetch: () => ({
    triggerPrefetch: vi.fn(),
    cancelPendingPrefetch: vi.fn(),
    resetPrefetchState: vi.fn(),
  }),
}))

vi.mock('@/api/setup', () => ({
  getSetupStatus: vi.fn(),
}))

function capturedRoutes(): Array<Record<string, unknown>> {
  const call = routerHarness.createRouterMock.mock.calls[0]
  const options = call && call[0] ? (call[0] as { routes?: unknown }) : {}
  return Array.isArray(options.routes) ? (options.routes as Array<Record<string, unknown>>) : []
}

describe('image-generation route registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a requiresAuth /image-generation route for authenticated users', async () => {
    routerHarness.createRouterMock.mockImplementation(() => ({
      beforeEach: vi.fn(),
      afterEach: vi.fn(),
      onError: vi.fn(),
    }))

    await import('@/router')

    const route = capturedRoutes().find((r) => r.path === '/image-generation')
    expect(route).toBeDefined()
    const meta = route?.meta as { requiresAuth?: boolean; requiresAdmin?: boolean } | undefined
    expect(meta?.requiresAuth).toBe(true)
    expect(meta?.requiresAdmin).toBe(false)
    expect((route?.component as unknown) ?? '').toBeTruthy()
  })
})
