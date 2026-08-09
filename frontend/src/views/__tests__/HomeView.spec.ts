import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import HomeView from '../HomeView.vue'

const { authStore, appStore } = vi.hoisted(() => ({
  authStore: {
    isAuthenticated: false,
    isAdmin: false,
    user: null as { email: string } | null,
    checkAuth: vi.fn()
  },
  appStore: {
    cachedPublicSettings: null as Record<string, unknown> | null,
    siteName: 'Sub2API',
    siteLogo: '',
    docUrl: '',
    apiBaseUrl: '',
    publicSettingsLoaded: true,
    fetchPublicSettings: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn()
  }
}))

const messages: Record<string, string> = {
  'home.navigation': 'Home navigation',
  'home.capabilities': 'Platform capabilities',
  'home.viewDocs': 'View docs',
  'home.switchToLight': 'Switch to light',
  'home.switchToDark': 'Switch to dark',
  'home.dashboard': 'Dashboard',
  'home.login': 'Login',
  'home.getStarted': 'Get started',
  'home.goToDashboard': 'Go to dashboard',
  'home.heroHeadline': 'One Key, All AI Models',
  'home.heroDescription': 'One API key for every connected model.',
  'home.steps.title': 'Live in three steps',
  'home.steps.subtitle': 'From sign-up to first request in minutes.',
  'home.footer.links': 'Footer links',
  'home.tags.subscriptionToApi': 'Unified routing',
  'home.tags.stickySession': 'Session persistence',
  'home.tags.realtimeBilling': 'Live metering',
  'home.solutions.title': 'Core capabilities',
  'home.solutions.subtitle': 'A reliable control plane for AI traffic.',
  'home.features.unifiedGateway': 'Unified gateway',
  'home.features.unifiedGatewayDesc': 'One endpoint for connected models.',
  'home.features.multiAccount': 'Reliable routing',
  'home.features.multiAccountDesc': 'Automatic upstream failover.',
  'home.features.balanceQuota': 'Usage controls',
  'home.features.balanceQuotaDesc': 'Metering and quota visibility.',
  'home.providers.title': 'Supported providers',
  'home.providers.description': 'One API, multiple providers.',
  'home.providers.supported': 'Supported',
  'home.providers.soon': 'Soon',
  'home.providers.more': 'More',
  'home.comparison.title': 'Why choose us?',
  'home.comparison.headers.feature': 'Comparison',
  'home.comparison.headers.official': 'Official subscriptions',
  'home.comparison.headers.us': 'Our platform',
  'home.comparison.items.pricing.feature': 'Pricing',
  'home.comparison.items.pricing.official': 'Fixed monthly fee',
  'home.comparison.items.pricing.us': 'Pay only for usage',
  'home.comparison.items.models.feature': 'Model selection',
  'home.comparison.items.models.official': 'Single provider',
  'home.comparison.items.models.us': 'Switch freely',
  'home.comparison.items.management.feature': 'Account management',
  'home.comparison.items.management.official': 'Manage separately',
  'home.comparison.items.management.us': 'Unified dashboard',
  'home.comparison.items.stability.feature': 'Stability',
  'home.comparison.items.stability.official': 'Single account limits',
  'home.comparison.items.stability.us': 'Auto failover',
  'home.comparison.items.control.feature': 'Usage control',
  'home.comparison.items.control.official': 'Not available',
  'home.comparison.items.control.us': 'Quotas and analytics',
  'home.cta.title': 'Ready to get started?',
  'home.cta.description': 'Sign up and start with free credits.',
  'home.cta.button': 'Sign up free',
  'home.footer.allRightsReserved': 'All rights reserved.',
  'home.docs': 'Docs'
}

vi.mock('@/stores', () => ({
  useAuthStore: () => authStore,
  useAppStore: () => appStore
}))

// useClipboard pulls the store from '@/stores/app' directly.
vi.mock('@/stores/app', () => ({
  useAppStore: () => appStore
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => messages[key] ?? key
    })
  }
})

const routerLinkStub = {
  props: ['to'],
  template: '<a :data-to="to"><slot /></a>'
}

function mountHome() {
  return mount(HomeView, {
    global: {
      stubs: {
        RouterLink: routerLinkStub,
        LocaleSwitcher: true,
        PlatformIcon: true,
        Icon: true
      }
    }
  })
}

describe('HomeView', () => {
  beforeEach(() => {
    authStore.isAuthenticated = false
    authStore.isAdmin = false
    authStore.user = null
    authStore.checkAuth.mockReset()

    appStore.cachedPublicSettings = null
    appStore.siteName = 'Sub2API'
    appStore.siteLogo = ''
    appStore.docUrl = ''
    appStore.apiBaseUrl = ''
    appStore.publicSettingsLoaded = true
    appStore.fetchPublicSettings.mockReset()

    localStorage.clear()
    document.documentElement.classList.remove('dark')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    })
  })

  it('leads with the localized value proposition and keeps branding in the eyebrow', () => {
    appStore.cachedPublicSettings = {
      site_name: 'Sub2API Edge',
      site_subtitle: 'AI traffic control plane',
      site_logo: '/logo.png',
      doc_url: 'https://docs.example.com',
      home_content: '',
      registration_enabled: true
    }

    const wrapper = mountHome()

    expect(wrapper.find('.home-shell').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('One Key, All AI Models')
    expect(wrapper.get('.hero-eyebrow').text()).toBe('Sub2API Edge')
    expect(wrapper.get('.hero-subtitle').text()).toContain('AI traffic control plane')
    expect(wrapper.get('.secondary-action').attributes('href')).toBe('https://docs.example.com/')
    expect(authStore.checkAuth).toHaveBeenCalledOnce()

    wrapper.unmount()
  })

  it('omits the tagline line when no site subtitle is configured', () => {
    const wrapper = mountHome()

    expect(wrapper.find('.hero-subtitle').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('One Key, All AI Models')

    wrapper.unmount()
  })

  it('points sign-up calls to action at registration, and login at login', () => {
    appStore.cachedPublicSettings = { registration_enabled: true, home_content: '' }

    const wrapper = mountHome()

    expect(wrapper.findAll('[data-to="/register"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-to="/login"]')).toHaveLength(1)

    wrapper.unmount()
  })

  it('falls back to the login route when registration is disabled', () => {
    appStore.cachedPublicSettings = { registration_enabled: false, home_content: '' }

    const wrapper = mountHome()

    expect(wrapper.findAll('[data-to="/register"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-to="/login"]')).toHaveLength(3)

    wrapper.unmount()
  })

  it('renders the comparison table and legal links', () => {
    appStore.cachedPublicSettings = {
      home_content: '',
      login_agreement_documents: [
        { id: 'terms', title: 'Terms of Service', content_md: '' },
        { id: 'privacy', title: 'Privacy Policy', content_md: '' }
      ]
    }

    const wrapper = mountHome()

    expect(wrapper.findAll('.compare-table tbody tr')).toHaveLength(5)
    expect(wrapper.get('[data-to="/legal/terms"]').text()).toBe('Terms of Service')
    expect(wrapper.get('[data-to="/legal/privacy"]').text()).toBe('Privacy Policy')

    wrapper.unmount()
  })

  it('routes authenticated administrators to the admin dashboard', () => {
    authStore.isAuthenticated = true
    authStore.isAdmin = true
    authStore.user = { email: 'admin@example.com' }

    const wrapper = mountHome()

    expect(wrapper.findAll('[data-to="/admin/dashboard"]')).toHaveLength(3)
    expect(wrapper.get('.user-initial').text()).toBe('A')

    wrapper.unmount()
  })

  it('renders configured URL content in a full-page iframe', () => {
    appStore.cachedPublicSettings = {
      home_content: ' https://portal.example.com/home '
    }

    const wrapper = mountHome()

    expect(wrapper.find('.home-shell').exists()).toBe(false)
    expect(wrapper.get('iframe').attributes('src')).toBe('https://portal.example.com/home')

    wrapper.unmount()
  })

  it('renders configured HTML instead of the default home page', () => {
    appStore.cachedPublicSettings = {
      home_content: '<section id="custom-home">Custom portal</section>'
    }

    const wrapper = mountHome()

    expect(wrapper.find('.home-shell').exists()).toBe(false)
    expect(wrapper.get('#custom-home').text()).toBe('Custom portal')

    wrapper.unmount()
  })

  it('defaults to the dark theme without an explicit preference', () => {
    const wrapper = mountHome()

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    wrapper.unmount()
  })

  it('persists the theme selected from the header', async () => {
    // With no explicit preference the landing page is dark-first, so the
    // toggle sequence is dark → light → dark.
    const wrapper = mountHome()

    await wrapper.get('button.header-icon').trigger('click')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')

    await wrapper.get('button.header-icon').trigger('click')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')

    wrapper.unmount()
  })
})
