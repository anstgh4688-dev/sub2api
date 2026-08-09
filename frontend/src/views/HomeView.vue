<template>
  <!-- Custom Home Content: Full Page Mode -->
  <div v-if="hasHomeContent" class="min-h-screen">
    <!-- iframe mode -->
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <!-- SECURITY: homeContent is an admin-only setting and intentionally supports raw HTML. -->
    <div v-else v-html="homeContent"></div>
  </div>

  <!-- Compact Home Page -->
  <div
    v-else-if="compactHomeEnabled"
    data-testid="compact-home"
    class="flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-dark-950 dark:text-white"
  >
    <header class="border-b border-gray-200 px-4 py-4 sm:px-6 dark:border-dark-800">
      <nav class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <img
            :src="siteLogo || '/logo.svg'"
            alt="Logo"
            class="h-9 w-9 shrink-0 rounded-lg object-contain"
          />
          <span class="min-w-0 truncate text-base font-semibold">{{ siteName }}</span>
        </div>
        <div class="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
          <LocaleSwitcher />
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-dark-400 dark:hover:bg-dark-800"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>
          <button
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-dark-400 dark:hover:bg-dark-800"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
            @click="toggleTheme"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>
          <router-link
            :to="isAuthenticated ? dashboardPath : '/login'"
            class="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {{ isAuthenticated ? t('home.dashboard') : t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main class="flex min-w-0 flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <div class="min-w-0 max-w-2xl text-center">
        <img
          :src="siteLogo || '/logo.svg'"
          alt="Logo"
          class="mx-auto mb-6 h-20 w-20 rounded-2xl object-contain"
        />
        <h1 class="[overflow-wrap:anywhere] text-3xl font-bold md:text-4xl">{{ siteName }}</h1>
        <p class="mt-4 whitespace-pre-wrap [overflow-wrap:anywhere] text-base text-gray-600 dark:text-dark-300">{{ siteSubtitle }}</p>
        <router-link
          :to="isAuthenticated ? dashboardPath : '/login'"
          class="mt-8 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          {{ isAuthenticated ? t('home.goToDashboard') : t('home.login') }}
        </router-link>
      </div>
    </main>

    <footer class="min-w-0 border-t border-gray-200 px-4 py-5 text-center text-sm text-gray-500 [overflow-wrap:anywhere] sm:px-6 dark:border-dark-800 dark:text-dark-400">
      &copy; {{ currentYear }} {{ siteName }}
    </footer>
  </div>

  <!-- Default Home Page -->
  <div v-else class="home-shell">
    <div class="aurora-field" aria-hidden="true">
      <span class="aurora aurora--a"></span>
      <span class="aurora aurora--b"></span>
      <span class="aurora aurora--c"></span>
      <CosmicBackdrop />
    </div>

    <header class="home-header">
      <nav class="home-nav" :aria-label="t('home.navigation')">
        <router-link to="/home" class="brand-lockup" :aria-label="siteName">
          <span class="brand-mark">
            <img :src="siteLogo || '/logo.svg'" :alt="`${siteName} logo`" />
          </span>
          <span class="brand-copy">
            <span class="brand-name">{{ siteName }}</span>
            <span class="brand-chip">SELF-HOSTED POOL</span>
          </span>
        </router-link>

        <div class="header-actions">
          <LocaleSwitcher class="home-locale" />

          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="header-icon"
            :title="t('home.viewDocs')"
            :aria-label="t('home.viewDocs')"
          >
            <Icon name="book" size="sm" />
          </a>

          <button
            type="button"
            class="header-icon"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
            :aria-label="isDark ? t('home.switchToLight') : t('home.switchToDark')"
            @click="toggleTheme"
          >
            <Icon v-if="isDark" name="sun" size="sm" />
            <Icon v-else name="moon" size="sm" />
          </button>

          <router-link
            :to="isAuthenticated ? dashboardPath : '/login'"
            class="header-cta"
          >
            <span v-if="isAuthenticated" class="user-initial">{{ userInitial }}</span>
            <span>{{ isAuthenticated ? t('home.dashboard') : t('home.login') }}</span>
            <Icon name="arrowRight" size="xs" :stroke-width="2" />
          </router-link>
        </div>
      </nav>
    </header>

    <main>
      <!-- ============ HERO ============ -->
      <section
        class="hero-stage"
        @pointermove="handleScenePointerMove"
        @pointerleave="resetSceneOffset"
      >
        <div class="hero-grid-bg" aria-hidden="true"></div>

        <div class="hero-inner">
          <div class="hero-copy">
            <div class="hero-badges">
              <div class="hero-badge">
                <span class="badge-pulse"></span>
                <span>{{ t('home.poolBadge') }}</span>
              </div>
              <div class="hero-badge hero-badge--direct">
                <Icon name="bolt" size="xs" :stroke-width="2" />
                <span>{{ t('home.directBadge') }}</span>
              </div>
            </div>

            <p class="hero-eyebrow">{{ siteName }}</p>
            <h1>{{ t('home.heroHeadline') }}</h1>

            <p v-if="siteSubtitle" class="hero-subtitle">{{ siteSubtitle }}</p>
            <p class="hero-description">{{ t('home.heroDescription') }}</p>

            <div class="hero-actions">
              <router-link :to="primaryCtaTarget" class="primary-action">
                <span>{{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}</span>
                <Icon name="arrowRight" size="sm" :stroke-width="2" />
              </router-link>
              <a
                v-if="docUrl"
                :href="docUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="secondary-action"
              >
                <Icon name="terminal" size="sm" />
                <span>{{ t('home.viewDocs') }}</span>
              </a>
            </div>

            <div class="hero-stats">
              <div v-for="stat in heroStats" :key="stat.labelKey" class="hero-stat">
                <strong>{{ stat.value }}</strong>
                <span>{{ t(stat.labelKey) }}</span>
              </div>
            </div>
          </div>

          <div
            class="hero-visual"
            :style="{ transform: `translate3d(${sceneOffset.x}px, ${sceneOffset.y}px, 0)` }"
            aria-hidden="true"
          >
            <span class="visual-halo"></span>
            <span class="visual-ring visual-ring--outer"></span>
            <span class="visual-ring visual-ring--inner"></span>

            <div class="pool-console">
              <div class="console-head">
                <span class="console-lights"><i></i><i></i><i></i></span>
                <span class="console-title">ACCOUNT_POOL · LIVE</span>
                <span class="console-health"><i></i>HEALTHY</span>
              </div>

              <div class="console-body">
                <div
                  v-for="account in poolAccounts"
                  :key="account.id"
                  class="pool-row"
                  :class="{ 'pool-row--routed': account.state === 'routed', 'pool-row--standby': account.state === 'standby' }"
                >
                  <span class="pool-platform" :class="`pool-platform--${account.platform}`">
                    <PlatformIcon :platform="account.platform" size="sm" />
                  </span>
                  <span class="pool-meta">
                    <strong>{{ account.id }}</strong>
                    <small>{{ account.plan }}</small>
                  </span>
                  <span class="pool-health-bar">
                    <i :style="{ width: `${account.health}%`, animationDelay: `${account.delay}ms` }"></i>
                  </span>
                  <span class="pool-state">
                    <template v-if="account.state === 'routed'">● ROUTED</template>
                    <template v-else-if="account.state === 'standby'">STANDBY</template>
                    <template v-else>ACTIVE</template>
                  </span>
                </div>
              </div>

              <div class="console-foot">
                <span class="foot-label">ROUTE</span>
                <code>pool.select(healthy) → {{ routedAccount.id }}</code>
                <span class="foot-latency">{{ routeLatency }}ms</span>
              </div>
            </div>

            <div class="float-chip float-chip--failover">
              <Icon name="bolt" size="xs" :stroke-width="2" />
              <span>FAILOVER &lt; 1s</span>
            </div>
            <div class="float-chip float-chip--session">
              <Icon name="lock" size="xs" :stroke-width="2" />
              <span>SESSION STICKY</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ SIGNAL STRIP ============ -->
      <section class="signal-strip" :aria-label="t('home.capabilities')">
        <div v-for="signal in signalItems" :key="signal.labelKey" class="signal-item">
          <span class="signal-icon"><Icon :name="signal.icon" size="sm" /></span>
          <span class="signal-copy">
            <small>{{ signal.code }}</small>
            <strong>{{ t(signal.labelKey) }}</strong>
          </span>
        </div>
      </section>

      <!-- ============ SELF-HOSTED POOL ============ -->
      <section class="pool-section">
        <div class="pool-layout">
          <div class="pool-copy">
            <span class="section-index">01 / ACCOUNT POOL</span>
            <h2>{{ t('home.pool.title') }}</h2>
            <p class="pool-lede">{{ t('home.pool.subtitle') }}</p>

            <div class="pool-features">
              <div v-for="feature in poolFeatures" :key="feature.titleKey" class="pool-feature">
                <span class="pool-feature-icon">
                  <Icon :name="feature.icon" size="sm" />
                </span>
                <div>
                  <h3>{{ t(feature.titleKey) }}</h3>
                  <p>{{ t(feature.descKey) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ DIRECT CONNECT ============ -->
      <section class="direct-section">
        <div class="direct-layout">
          <div class="direct-copy">
            <span class="section-index">02 / DIRECT CONNECT</span>
            <h2>{{ t('home.direct.title') }}</h2>
            <p class="direct-lede">{{ t('home.direct.subtitle') }}</p>

            <div class="direct-features">
              <div v-for="feature in directFeatures" :key="feature.titleKey" class="pool-feature">
                <span class="pool-feature-icon">
                  <Icon :name="feature.icon" size="sm" />
                </span>
                <div>
                  <h3>{{ t(feature.titleKey) }}</h3>
                  <p>{{ t(feature.descKey) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ HOW IT WORKS ============ -->
      <section class="steps-section">
        <div class="section-heading section-heading--center">
          <span class="section-index">03 / QUICK START</span>
          <h2>{{ t('home.steps.title') }}</h2>
          <p>{{ t('home.steps.subtitle') }}</p>
        </div>

        <div class="steps-flow">
          <div v-for="(step, index) in stepItems" :key="step.titleKey" class="flow-node">
            <span class="flow-orb">
              <Icon :name="step.icon" size="md" />
              <i class="flow-orb-ring"></i>
            </span>
            <span class="flow-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3>{{ t(step.titleKey) }}</h3>
            <p>{{ t(step.descKey) }}</p>
            <span v-if="index < stepItems.length - 1" class="flow-link" aria-hidden="true">
              <i class="flow-link-beam"></i>
            </span>
          </div>
        </div>
      </section>

      <!-- ============ CAPABILITIES ============ -->
      <section class="capability-section">
        <div class="section-heading">
          <div>
            <span class="section-index">04 / CORE SYSTEM</span>
            <h2>{{ t('home.solutions.title') }}</h2>
          </div>
          <p>{{ t('home.solutions.subtitle') }}</p>
        </div>

        <div class="capability-grid">
          <article
            v-for="feature in featureItems"
            :key="feature.titleKey"
            class="capability-item"
            :class="`capability-item--${feature.accent}`"
          >
            <span class="capability-icon"><Icon :name="feature.icon" size="lg" /></span>
            <h3>{{ t(feature.titleKey) }}</h3>
            <p>{{ t(feature.descriptionKey) }}</p>
            <div class="capability-footer">
              <span>{{ feature.protocol }}</span>
              <i></i>
            </div>
          </article>
        </div>
      </section>

      <!-- ============ PROVIDERS ============ -->
      <section class="provider-section">
        <div class="section-heading">
          <div>
            <span class="section-index">05 / UPSTREAM NETWORK</span>
            <h2>{{ t('home.providers.title') }}</h2>
          </div>
          <p>{{ t('home.providers.description') }}</p>
        </div>

        <div class="provider-marquee">
          <div class="provider-marquee-track">
            <div
              v-for="copyIndex in 2"
              :key="copyIndex"
              class="provider-marquee-group"
              :aria-hidden="copyIndex === 2"
            >
              <div
                v-for="(chip, chipIndex) in providerChips"
                :key="`${copyIndex}-${chipIndex}`"
                class="provider-chip"
                :class="{ 'provider-chip--soon': chip.soon }"
              >
                <span class="provider-icon" :class="chip.platform ? `provider-icon--${chip.platform}` : ''">
                  <PlatformIcon v-if="chip.platform" :platform="chip.platform" size="lg" />
                  <Icon v-else name="plus" size="sm" />
                </span>
                <span class="provider-chip-copy">
                  <strong>{{ chip.labelKey ? t(chip.labelKey) : chip.label }}</strong>
                  <small>{{ chip.soon ? t('home.providers.soon') : t('home.providers.supported') }}</small>
                </span>
                <i class="provider-chip-dot"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ COMPARISON ============ -->
      <section class="compare-section">
        <div class="section-heading section-heading--center">
          <span class="section-index">06 / COMPARISON</span>
          <h2>{{ t('home.comparison.title') }}</h2>
        </div>

        <div class="compare-frame">
          <table class="compare-table">
            <caption class="sr-only">{{ t('home.comparison.title') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('home.comparison.headers.feature') }}</th>
                <th scope="col">{{ t('home.comparison.headers.official') }}</th>
                <th scope="col" class="compare-col-us">
                  <span class="compare-us-tag">{{ t('home.comparison.headers.us') }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparisonRows" :key="row">
                <th scope="row">{{ t(`home.comparison.items.${row}.feature`) }}</th>
                <td :data-label="t('home.comparison.headers.official')">
                  <Icon name="x" size="xs" :stroke-width="2" class="compare-mark compare-mark--no" />
                  <span>{{ t(`home.comparison.items.${row}.official`) }}</span>
                </td>
                <td class="compare-col-us" :data-label="t('home.comparison.headers.us')">
                  <Icon name="check" size="xs" :stroke-width="2" class="compare-mark compare-mark--yes" />
                  <span>{{ t(`home.comparison.items.${row}.us`) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ============ CTA ============ -->
      <section class="cta-section">
        <div class="cta-panel">
          <span class="cta-glow" aria-hidden="true"></span>
          <h2>{{ t('home.cta.title') }}</h2>
          <p>{{ t('home.cta.description') }}</p>
          <router-link :to="primaryCtaTarget" class="cta-action">
            <span>{{ isAuthenticated ? t('home.goToDashboard') : t('home.cta.button') }}</span>
            <Icon name="arrowRight" size="sm" :stroke-width="2" />
          </router-link>
        </div>
      </section>
    </main>

    <footer class="home-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <img :src="siteLogo || '/logo.svg'" alt="" />
          <span>&copy; {{ currentYear }} {{ siteName }}. {{ t('home.footer.allRightsReserved') }}</span>
        </div>
        <nav class="footer-links" :aria-label="t('home.footer.links')">
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('home.docs') }}
          </a>
          <router-link
            v-for="doc in legalDocuments"
            :key="doc.id"
            :to="`/legal/${doc.id}`"
          >
            {{ doc.title }}
          </router-link>
          <a :href="githubUrl" target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import CosmicBackdrop from '@/components/common/CosmicBackdrop.vue'
import Icon from '@/components/icons/Icon.vue'
import { sanitizeUrl } from '@/utils/url'
import type { GroupPlatform } from '@/types'

const { t } = useI18n()

const authStore = useAuthStore()
const appStore = useAppStore()

const comparisonRows = ['pricing', 'models', 'management', 'stability', 'control'] as const

const heroStats = [
  { value: '100%', labelKey: 'home.stats.selfOperated' },
  { value: '4+', labelKey: 'home.stats.platforms' },
  { value: '7×24', labelKey: 'home.stats.monitoring' },
  { value: '<1s', labelKey: 'home.stats.failover' }
] as const

type PoolAccount = {
  id: string
  platform: GroupPlatform
  plan: string
  health: number
  state: 'routed' | 'active' | 'standby'
  delay: number
}

const poolAccounts = ref<PoolAccount[]>([
  { id: 'acc_7f3a', platform: 'anthropic', plan: 'claude · max', health: 97, state: 'routed', delay: 0 },
  { id: 'acc_92k1', platform: 'openai', plan: 'gpt · pro', health: 92, state: 'active', delay: 120 },
  { id: 'acc_c4d8', platform: 'gemini', plan: 'gemini · ultra', health: 88, state: 'active', delay: 240 },
  { id: 'acc_5e2f', platform: 'anthropic', plan: 'claude · team', health: 81, state: 'active', delay: 360 },
  { id: 'acc_b7a3', platform: 'antigravity', plan: 'antigravity', health: 64, state: 'standby', delay: 480 }
])

// Rotate the ROUTED highlight across healthy accounts and jitter the health
// bars so the console reads as a live control plane, not a static mock.
const routeLatency = ref(48)
const routedAccount = computed(
  () => poolAccounts.value.find((account) => account.state === 'routed') ?? poolAccounts.value[0]
)

let routerTimer: number | undefined

function startRouteRotation() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  routerTimer = window.setInterval(() => {
    const candidates = poolAccounts.value.filter(
      (account) => account.state !== 'standby' && account.state !== 'routed'
    )
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    if (!next) return

    poolAccounts.value = poolAccounts.value.map((account) => {
      const state =
        account.id === next.id ? 'routed' : account.state === 'routed' ? 'active' : account.state
      const health =
        account.state === 'standby'
          ? account.health
          : Math.min(99, Math.max(62, account.health + Math.round((Math.random() - 0.5) * 5)))
      return { ...account, state, health }
    })
    routeLatency.value = 28 + Math.round(Math.random() * 60)
  }, 2800)
}

const signalItems = [
  { code: 'POOL', labelKey: 'home.tags.selfHostedPool', icon: 'database' },
  { code: 'ROUTING', labelKey: 'home.tags.subscriptionToApi', icon: 'swap' },
  { code: 'SESSION', labelKey: 'home.tags.stickySession', icon: 'shield' },
  { code: 'METERING', labelKey: 'home.tags.realtimeBilling', icon: 'chart' }
] as const

const poolFeatures = [
  { titleKey: 'home.pool.features.owned.title', descKey: 'home.pool.features.owned.desc', icon: 'shield' },
  { titleKey: 'home.pool.features.monitor.title', descKey: 'home.pool.features.monitor.desc', icon: 'chart' },
  { titleKey: 'home.pool.features.schedule.title', descKey: 'home.pool.features.schedule.desc', icon: 'swap' },
  { titleKey: 'home.pool.features.scale.title', descKey: 'home.pool.features.scale.desc', icon: 'server' }
] as const

const directFeatures = [
  { titleKey: 'home.direct.features.noProxy.title', descKey: 'home.direct.features.noProxy.desc', icon: 'globe' },
  { titleKey: 'home.direct.features.bgp.title', descKey: 'home.direct.features.bgp.desc', icon: 'bolt' },
  { titleKey: 'home.direct.features.clients.title', descKey: 'home.direct.features.clients.desc', icon: 'terminal' }
] as const

const stepItems = [
  { titleKey: 'home.steps.items.key.title', descKey: 'home.steps.items.key.desc', icon: 'key' },
  { titleKey: 'home.steps.items.call.title', descKey: 'home.steps.items.call.desc', icon: 'terminal' },
  { titleKey: 'home.steps.items.route.title', descKey: 'home.steps.items.route.desc', icon: 'cpu' }
] as const

const featureItems = [
  {
    titleKey: 'home.features.unifiedGateway',
    descriptionKey: 'home.features.unifiedGatewayDesc',
    icon: 'server',
    protocol: 'UNIFIED ENDPOINT',
    accent: 'cyan'
  },
  {
    titleKey: 'home.features.multiAccount',
    descriptionKey: 'home.features.multiAccountDesc',
    icon: 'cpu',
    protocol: 'SMART FAILOVER',
    accent: 'violet'
  },
  {
    titleKey: 'home.features.balanceQuota',
    descriptionKey: 'home.features.balanceQuotaDesc',
    icon: 'chart',
    protocol: 'LIVE METERING',
    accent: 'blue'
  }
] as const

const providerItems: Array<{ platform: GroupPlatform; label: string }> = [
  { platform: 'anthropic', label: 'Claude' },
  { platform: 'openai', label: 'GPT' },
  { platform: 'gemini', label: 'Gemini' },
  { platform: 'antigravity', label: 'Antigravity' }
]

// The marquee group must be wider than the viewport for a seamless loop, so
// the provider set is repeated three times with a "more" chip at the tail.
const providerChips: Array<{
  platform: GroupPlatform | null
  label: string
  labelKey?: string
  soon?: boolean
}> = [
  ...providerItems,
  ...providerItems,
  ...providerItems,
  { platform: null, label: '', labelKey: 'home.providers.more', soon: true }
]

const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API')
const siteLogo = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '', { allowRelative: true, allowDataUrl: true }))
// Optional admin-configured tagline. Intentionally has no hard-coded fallback:
// the localized headline (home.heroHeadline) already carries the value proposition.
const siteSubtitle = computed(() => (appStore.cachedPublicSettings?.site_subtitle || '').trim())
const docUrl = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.doc_url || appStore.docUrl || ''))
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')
const hasHomeContent = computed(() => homeContent.value.trim().length > 0)
const compactHomeEnabled = computed(() => appStore.cachedPublicSettings?.compact_home_enabled === true)
const legalDocuments = computed(() => appStore.cachedPublicSettings?.login_agreement_documents ?? [])
const registrationEnabled = computed(() => appStore.cachedPublicSettings?.registration_enabled !== false)

const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

const isDark = ref(document.documentElement.classList.contains('dark'))
const sceneOffset = ref({ x: 0, y: 0 })

const githubUrl = 'https://github.com/Wei-Shaw/sub2api'

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => isAdmin.value ? '/admin/dashboard' : '/dashboard')

// "Get started" / "Sign up free" should land on registration, not the login form.
const primaryCtaTarget = computed(() => {
  if (isAuthenticated.value) return dashboardPath.value
  return registrationEnabled.value ? '/register' : '/login'
})
const userInitial = computed(() => {
  const user = authStore.user
  if (!user || !user.email) return ''
  return user.email.charAt(0).toUpperCase()
})

const currentYear = computed(() => new Date().getFullYear())

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  // The landing page is designed dark-first (cosmic backdrop, meteors); only
  // an explicit light preference from the toggle opts out.
  if (savedTheme !== 'light') {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

function handleScenePointerMove(event: PointerEvent) {
  if (
    event.pointerType !== 'mouse' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }

  const stage = event.currentTarget as HTMLElement
  const bounds = stage.getBoundingClientRect()
  const horizontalProgress = (event.clientX - bounds.left) / bounds.width - 0.5
  const verticalProgress = (event.clientY - bounds.top) / bounds.height - 0.5

  sceneOffset.value = {
    x: horizontalProgress * -10,
    y: verticalProgress * -8
  }
}

function resetSceneOffset() {
  sceneOffset.value = { x: 0, y: 0 }
}

onMounted(() => {
  initTheme()
  startRouteRotation()
  authStore.checkAuth()

  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})

onBeforeUnmount(() => {
  if (routerTimer !== undefined) window.clearInterval(routerTimer)
})
</script>

<style scoped>
html.dark .home-shell {
  --home-bg: #020409;
  --home-bg-soft: #050a16;
  --home-surface: rgba(10, 16, 32, 0.6);
  --home-surface-solid: #0a1122;
  --home-surface-strong: rgba(8, 13, 28, 0.9);
  /* Opaque-enough card fill: replaces backdrop-filter on the repeated grids. */
  --home-card: rgba(10, 16, 32, 0.88);
  --home-text: #eef3ff;
  --home-muted: #a8b6d4;
  /* 6.0:1 on --home-bg, 5.5:1 on --home-surface-solid (was #5f6f92 → 4.0:1) */
  --home-faint: #8494b6;
  --home-border: rgba(125, 165, 255, 0.12);
  --home-border-strong: rgba(125, 165, 255, 0.24);
  --home-grid: rgba(125, 165, 255, 0.06);
  --home-accent-a: #38bdf8;
  --home-accent-fill: #38bdf8;
  --home-accent-b: #818cf8;
  /* White on this gradient is only 2.1:1 — the gradient is far too bright in
     dark mode, so accent buttons get dark ink instead (8.8:1 / 6.3:1). */
  --home-on-accent: #06121f;
  --home-accent-soft: rgba(56, 189, 248, 0.12);
  --home-accent-glow: rgba(56, 189, 248, 0.3);
  --home-accent-b-soft: rgba(129, 140, 248, 0.14);
  --home-accent-b-glow: rgba(129, 140, 248, 0.3);
  --home-ok: #34d399;
  --home-ok-soft: rgba(52, 211, 153, 0.14);
  --home-code: #dbeaff;
  --home-title-from: #f4f8ff;
  --home-title-mid: #b8ccf5;
  --home-title-to: #7da5ff;
  --home-shadow: 0 30px 90px rgba(1, 3, 10, 0.7);
  --home-aurora-a: rgba(56, 189, 248, 0.16);
  --home-aurora-b: rgba(129, 140, 248, 0.15);
  --home-aurora-c: rgba(45, 212, 191, 0.1);
  --home-inset-hi: rgba(255, 255, 255, 0.06);
}

html.dark .home-shell .pool-platform--openai,
html.dark .home-shell .orbit-node-badge--openai,
html.dark .home-shell .provider-icon--openai {
  color: #f4f7f6;
}

.home-shell {
  --home-bg: #f5f8fd;
  --home-bg-soft: #eef3fb;
  --home-surface: rgba(255, 255, 255, 0.72);
  --home-surface-solid: #ffffff;
  --home-surface-strong: rgba(255, 255, 255, 0.92);
  /* Opaque-enough card fill: replaces backdrop-filter on the repeated grids. */
  --home-card: rgba(255, 255, 255, 0.88);
  --home-text: #0d1830;
  --home-muted: #49597c;
  /* 5.0:1 on --home-bg, 5.4:1 on white (was #7d8cab → 3.2:1) */
  --home-faint: #5b6b8c;
  --home-border: rgba(37, 78, 160, 0.13);
  --home-border-strong: rgba(37, 78, 160, 0.24);
  --home-grid: rgba(37, 78, 160, 0.07);
  /* --home-accent-a is also used as text; --home-accent-fill keeps the brighter
     original hue for gradients/glows where contrast rules do not apply. */
  --home-accent-a: #0369a1;
  --home-accent-fill: #0284c7;
  --home-accent-b: #4f46e5;
  /* Text colour placed on top of the accent gradient. */
  --home-on-accent: #ffffff;
  --home-accent-soft: rgba(2, 132, 199, 0.1);
  --home-accent-glow: rgba(2, 132, 199, 0.2);
  --home-accent-b-soft: rgba(99, 102, 241, 0.1);
  --home-accent-b-glow: rgba(99, 102, 241, 0.2);
  --home-ok: #047857;
  --home-ok-soft: rgba(5, 150, 105, 0.12);
  --home-code: #12294a;
  --home-title-from: #0d1830;
  --home-title-mid: #24448c;
  --home-title-to: #3d63e0;
  --home-shadow: 0 30px 80px rgba(13, 38, 76, 0.1);
  --home-aurora-a: rgba(2, 132, 199, 0.1);
  --home-aurora-b: rgba(99, 102, 241, 0.09);
  --home-aurora-c: rgba(13, 148, 136, 0.07);
  --home-inset-hi: rgba(255, 255, 255, 0.8);
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: var(--home-bg);
  color: var(--home-text);
  font-family: 'Avenir Next', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  letter-spacing: 0;
}

.home-shell *,
.home-shell *::before,
.home-shell *::after {
  box-sizing: border-box;
  letter-spacing: 0;
}

/* ============ Ambient ============ */
.aurora-field {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  contain: layout paint style;
}

/* Deep-space gradient only exists in the dark theme; the light theme keeps
   its clean flat background. */
html.dark .aurora-field {
  background:
    radial-gradient(1100px 760px at 80% -12%, rgba(56, 189, 248, 0.09), transparent 62%),
    radial-gradient(900px 640px at 6% 110%, rgba(129, 140, 248, 0.08), transparent 60%),
    radial-gradient(720px 520px at 46% 54%, rgba(45, 212, 191, 0.05), transparent 65%),
    linear-gradient(180deg, #020409 0%, #04081a 42%, #020409 100%);
}

.aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  animation: aurora-drift 26s ease-in-out infinite;
  will-change: transform;
}

.aurora--a {
  top: -16%;
  left: -8%;
  width: 640px;
  height: 640px;
  background: var(--home-aurora-a);
}

.aurora--b {
  top: 4%;
  right: -12%;
  width: 560px;
  height: 560px;
  background: var(--home-aurora-b);
  animation-delay: -8s;
}

.aurora--c {
  bottom: -18%;
  left: 30%;
  width: 620px;
  height: 620px;
  background: var(--home-aurora-c);
  animation-delay: -14s;
}

/* ============ Header ============ */
.home-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 72px;
  border-bottom: 1px solid var(--home-border);
  background: color-mix(in srgb, var(--home-surface-strong) 86%, transparent);
  backdrop-filter: blur(20px) saturate(1.3);
}

.home-nav {
  display: flex;
  width: min(1200px, calc(100% - 48px));
  height: 100%;
  margin: 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand-lockup {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  color: var(--home-text);
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--home-border-strong);
  border-radius: 11px;
  background: linear-gradient(150deg, var(--home-accent-soft), var(--home-accent-b-soft)), var(--home-surface-solid);
  box-shadow: inset 0 1px 0 var(--home-inset-hi), 0 6px 18px rgba(10, 24, 60, 0.14);
}

.brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.brand-name {
  max-width: 220px;
  overflow: hidden;
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-chip {
  width: fit-content;
  background: linear-gradient(90deg, var(--home-accent-a), var(--home-accent-b));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.header-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

:deep(.home-locale > button) {
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--home-muted);
}

:deep(.home-locale > button:hover) {
  border-color: var(--home-border);
  background: var(--home-accent-soft);
  color: var(--home-text);
}

.header-icon {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--home-muted);
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.header-icon:hover {
  border-color: var(--home-border);
  background: var(--home-accent-soft);
  color: var(--home-text);
}

.header-cta,
.primary-action,
.secondary-action,
.cta-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
}

.header-cta {
  min-height: 36px;
  gap: 8px;
  padding: 0 15px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--home-accent-a), var(--home-accent-b));
  color: var(--home-on-accent);
  font-size: 12px;
  box-shadow: 0 6px 20px var(--home-accent-glow);
}

.header-cta:hover,
.primary-action:hover,
.secondary-action:hover,
.cta-action:hover {
  transform: translateY(-1px);
}

.user-initial {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--home-on-accent) 18%, transparent);
  color: var(--home-on-accent);
  font-size: 10px;
}

main {
  position: relative;
  z-index: 1;
}

/* ============ Focus ============ */
.home-shell :is(a, button, [tabindex]):focus-visible {
  outline: 2px solid var(--home-accent-a);
  outline-offset: 3px;
  border-radius: 10px;
}

.home-shell :is(.header-cta, .primary-action, .cta-action):focus-visible {
  outline-color: var(--home-text);
  outline-offset: 3px;
}

:deep(.home-locale > button:focus-visible) {
  outline: 2px solid var(--home-accent-a);
  outline-offset: 3px;
}

/* ============ Hero ============ */
.hero-stage {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--home-border);
}

.hero-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--home-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--home-grid) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 90% 80% at 50% 30%, black 25%, transparent 78%);
  pointer-events: none;
}

.hero-inner {
  display: grid;
  width: min(1200px, calc(100% - 48px));
  margin: 0 auto;
  padding: 88px 0 132px;
  grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
  align-items: center;
  gap: 56px;
}

.hero-copy > * {
  opacity: 0;
  animation: rise-in 720ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.hero-copy > :nth-child(2) { animation-delay: 60ms; }
.hero-copy > :nth-child(3) { animation-delay: 120ms; }
.hero-copy > :nth-child(4) { animation-delay: 180ms; }
.hero-copy > :nth-child(5) { animation-delay: 240ms; }
.hero-copy > :nth-child(6) { animation-delay: 300ms; }
.hero-copy > :nth-child(7) { animation-delay: 360ms; }

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 26px;
}

.hero-badge {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
  border: 1px solid var(--home-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--home-surface) 85%, transparent);
  color: var(--home-muted);
  font-size: 12px;
  font-weight: 650;
  box-shadow: inset 0 1px 0 var(--home-inset-hi), 0 8px 24px rgba(10, 24, 60, 0.06);
  backdrop-filter: blur(12px);
}

.hero-badge--direct {
  border-color: color-mix(in srgb, var(--home-accent-a) 42%, var(--home-border-strong));
  color: var(--home-accent-a);
  background: color-mix(in srgb, var(--home-accent-soft) 55%, transparent);
}

.hero-eyebrow {
  margin: 0 0 10px;
  color: var(--home-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.badge-pulse {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: var(--home-ok);
  box-shadow: 0 0 0 4px var(--home-ok-soft);
  animation: pulse-soft 2.2s ease-in-out infinite;
}

.hero-copy h1 {
  margin: 0;
  font-size: clamp(34px, 4.6vw, 56px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.14;
  /* keep-all stops CJK from breaking mid-word; the headline then wraps at
     punctuation/spaces. overflow-wrap stays as the overflow safety net. */
  word-break: keep-all;
  overflow-wrap: anywhere;
  text-wrap: balance;
  background: linear-gradient(135deg, var(--home-title-from) 18%, var(--home-title-mid) 56%, var(--home-title-to) 96%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-subtitle {
  margin: 22px 0 0;
  color: var(--home-text);
  font-size: 21px;
  font-weight: 650;
  line-height: 1.42;
}

.hero-description {
  max-width: 520px;
  margin: 14px 0 0;
  color: var(--home-muted);
  font-size: 15px;
  line-height: 1.8;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.primary-action,
.secondary-action {
  min-height: 50px;
  gap: 11px;
  padding: 0 22px;
  font-size: 13.5px;
}

.primary-action {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--home-accent-a), var(--home-accent-b));
  color: var(--home-on-accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 10px 32px var(--home-accent-glow),
    0 4px 14px var(--home-accent-b-glow);
}

.primary-action::after {
  position: absolute;
  top: 0;
  left: -45%;
  width: 45%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  content: '';
  transform: skewX(-18deg);
  animation: sheen 4.2s ease-in-out infinite;
}

.primary-action:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 14px 38px var(--home-accent-glow),
    0 6px 18px var(--home-accent-b-glow);
}

.secondary-action {
  border: 1px solid var(--home-border-strong);
  background: color-mix(in srgb, var(--home-surface) 88%, transparent);
  color: var(--home-text);
  backdrop-filter: blur(12px);
}

.secondary-action:hover {
  border-color: color-mix(in srgb, var(--home-accent-a) 45%, var(--home-border-strong));
  box-shadow: 0 0 0 4px var(--home-accent-soft);
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  margin-top: 40px;
  border-top: 1px solid var(--home-border);
}

.hero-stat {
  display: grid;
  min-width: 118px;
  gap: 3px;
  padding: 18px 26px 0 0;
  margin-right: 26px;
}

.hero-stat strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 22px;
  font-weight: 750;
  background: linear-gradient(120deg, var(--home-accent-a), var(--home-accent-b));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-stat span {
  color: var(--home-faint);
  font-size: 12px;
  font-weight: 600;
}

/* ============ Hero visual: pool console ============ */
.hero-visual {
  position: relative;
  display: grid;
  place-items: center;
  padding: 24px 0;
  transition: transform 260ms ease-out;
  will-change: transform;
  opacity: 0;
  animation: rise-in 800ms cubic-bezier(0.22, 1, 0.36, 1) 220ms forwards;
}

.visual-halo {
  position: absolute;
  width: 78%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, var(--home-accent-soft) 0%, var(--home-accent-b-soft) 40%, transparent 70%);
  filter: blur(28px);
  animation: pulse-soft 5s ease-in-out infinite;
}

.visual-ring {
  position: absolute;
  border: 1px solid var(--home-border-strong);
  border-radius: 50%;
  aspect-ratio: 1;
}

.visual-ring--outer {
  width: 108%;
  border-style: dashed;
  opacity: 0.5;
  animation: spin-slow 60s linear infinite;
}

.visual-ring--inner {
  width: 88%;
  opacity: 0.4;
  animation: spin-slow 42s linear infinite reverse;
}

.pool-console {
  position: relative;
  z-index: 2;
  width: min(480px, 100%);
  overflow: hidden;
  border: 1px solid var(--home-border-strong);
  border-radius: 20px;
  background: color-mix(in srgb, var(--home-surface-strong) 94%, transparent);
  box-shadow:
    inset 0 1px 0 var(--home-inset-hi),
    var(--home-shadow),
    0 0 60px var(--home-accent-soft);
  backdrop-filter: blur(20px);
}

.console-head {
  display: flex;
  min-height: 46px;
  align-items: center;
  gap: 14px;
  padding: 0 18px;
  border-bottom: 1px solid var(--home-border);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.console-lights {
  display: inline-flex;
  gap: 6px;
}

.console-lights i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--home-faint);
  opacity: 0.4;
}

.console-lights i:first-child { background: #f87171; opacity: 0.75; }
.console-lights i:nth-child(2) { background: #fbbf24; opacity: 0.75; }
.console-lights i:last-child { background: #34d399; opacity: 0.75; }

.console-title {
  color: var(--home-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.console-health {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  color: var(--home-ok);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.console-health i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--home-ok);
  box-shadow: 0 0 0 4px var(--home-ok-soft);
  animation: pulse-soft 2s ease-in-out infinite;
}

.console-body {
  display: grid;
}

.pool-row {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 13px;
  padding: 0 18px;
  border-bottom: 1px solid var(--home-border);
  transition: background-color 350ms ease, box-shadow 350ms ease, opacity 350ms ease;
}

.pool-row--routed {
  background:
    linear-gradient(90deg, var(--home-accent-soft), transparent 70%);
  box-shadow: inset 2px 0 0 var(--home-accent-a);
}

.pool-row--standby {
  opacity: 0.55;
}

.pool-platform {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid var(--home-border);
  border-radius: 9px;
  background: var(--home-surface-solid);
  color: var(--home-text);
}

.pool-platform--anthropic { color: #d97706; }
.pool-platform--gemini { color: #4285f4; }
.pool-platform--antigravity { color: #e04c8a; }

.pool-meta {
  display: grid;
  min-width: 96px;
  gap: 1px;
}

.pool-meta strong {
  color: var(--home-code);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  font-weight: 700;
}

.pool-meta small {
  color: var(--home-faint);
  font-size: 11px;
}

.pool-health-bar {
  position: relative;
  min-width: 0;
  flex: 1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--home-border) 70%, transparent);
}

.pool-health-bar i {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--home-accent-fill), var(--home-accent-b));
  transform-origin: left center;
  animation: bar-grow 900ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  transition: width 600ms ease;
}

.pool-row--standby .pool-health-bar i {
  background: var(--home-faint);
}

.pool-state {
  flex: 0 0 auto;
  min-width: 64px;
  color: var(--home-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: right;
}

.pool-row--routed .pool-state {
  color: var(--home-accent-a);
  animation: pulse-soft 1.6s ease-in-out infinite;
}

.console-foot {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  background: color-mix(in srgb, var(--home-accent-soft) 40%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.foot-label {
  color: var(--home-accent-a);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.console-foot code {
  min-width: 0;
  overflow: hidden;
  color: var(--home-code);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foot-latency {
  margin-left: auto;
  color: var(--home-ok);
  font-size: 11px;
  font-weight: 700;
}

.float-chip {
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border: 1px solid var(--home-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--home-surface-strong) 92%, transparent);
  color: var(--home-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  box-shadow: inset 0 1px 0 var(--home-inset-hi), 0 12px 30px rgba(6, 16, 40, 0.18);
  backdrop-filter: blur(12px);
  animation: float-bob 5.5s ease-in-out infinite;
}

.float-chip--failover {
  top: -4px;
  right: 8px;
  color: var(--home-accent-a);
}

.float-chip--session {
  bottom: -6px;
  left: -10px;
  color: var(--home-accent-b);
  animation-delay: -2.6s;
}

/* ============ Signal strip ============ */
.signal-strip {
  position: relative;
  z-index: 8;
  display: grid;
  width: min(1200px, calc(100% - 48px));
  min-height: 88px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: -44px auto 0;
  overflow: hidden;
  border: 1px solid var(--home-border-strong);
  border-radius: 18px;
  background: color-mix(in srgb, var(--home-surface-strong) 92%, transparent);
  box-shadow: inset 0 1px 0 var(--home-inset-hi), var(--home-shadow);
  backdrop-filter: blur(20px);
}

.signal-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 13px;
  padding: 18px 22px;
  border-right: 1px solid var(--home-border);
}

.signal-item:last-child {
  border-right: 0;
}

.signal-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border: 1px solid var(--home-border);
  border-radius: 12px;
  background: linear-gradient(150deg, var(--home-accent-soft), var(--home-accent-b-soft));
  color: var(--home-accent-a);
}

.signal-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.signal-copy small {
  color: var(--home-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.signal-copy strong {
  overflow: hidden;
  color: var(--home-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ============ Sections shared ============ */
.pool-section,
.direct-section,
.steps-section,
.capability-section,
.provider-section,
.compare-section,
.cta-section {
  width: min(1200px, calc(100% - 48px));
  margin: 0 auto;
}

.section-index {
  display: block;
  margin-bottom: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  background: linear-gradient(90deg, var(--home-accent-a), var(--home-accent-b));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 40px;
}

.section-heading h2,
.pool-copy h2,
.direct-copy h2,
.cta-panel h2 {
  margin: 0;
  color: var(--home-text);
  font-size: clamp(28px, 3.4vw, 38px);
  font-weight: 780;
  letter-spacing: -0.025em;
  line-height: 1.16;
}

.section-heading p {
  max-width: 420px;
  margin: 0 0 6px;
  color: var(--home-muted);
  font-size: 14px;
  line-height: 1.7;
  text-align: right;
}

.section-heading--center {
  display: block;
  margin-bottom: 48px;
  text-align: center;
}

.section-heading--center p {
  max-width: 520px;
  margin: 14px auto 0;
  text-align: center;
}

/* ============ Pool section ============ */
.pool-section {
  padding: 120px 0 110px;
}

.pool-layout {
  display: block;
}

.pool-lede {
  max-width: 520px;
  margin: 18px 0 0;
  color: var(--home-muted);
  font-size: 15px;
  line-height: 1.8;
}

.pool-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 36px;
}

.pool-feature {
  display: flex;
  gap: 13px;
  padding: 18px;
  border: 1px solid var(--home-border);
  border-radius: 16px;
  background: var(--home-card);
  box-shadow: inset 0 1px 0 var(--home-inset-hi);
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
}

.pool-feature:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--home-accent-a) 40%, var(--home-border));
  box-shadow: inset 0 1px 0 var(--home-inset-hi), 0 14px 34px rgba(8, 22, 52, 0.1);
}

.pool-feature-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid var(--home-border);
  border-radius: 10px;
  background: linear-gradient(150deg, var(--home-accent-soft), var(--home-accent-b-soft));
  color: var(--home-accent-a);
}

.pool-feature h3 {
  margin: 2px 0 6px;
  color: var(--home-text);
  font-size: 14.5px;
  font-weight: 720;
}

.pool-feature p {
  margin: 0;
  color: var(--home-muted);
  font-size: 12.5px;
  line-height: 1.65;
}

/* ============ Direct connect section ============ */
.direct-section {
  padding: 0 0 120px;
}

.direct-layout {
  display: block;
}

.direct-lede {
  max-width: 520px;
  margin: 18px 0 0;
  color: var(--home-muted);
  font-size: 15px;
  line-height: 1.8;
}

.direct-features {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
  margin-top: 36px;
}

/* ============ Steps ============ */
.steps-section {
  padding: 0 0 120px;
}

.steps-flow {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.flow-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 34px 24px 30px;
  text-align: center;
}

.flow-orb {
  position: relative;
  display: grid;
  width: 68px;
  height: 68px;
  place-items: center;
  border: 1px solid var(--home-border-strong);
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 28%, var(--home-inset-hi), transparent 52%),
    linear-gradient(150deg, var(--home-accent-soft), var(--home-accent-b-soft));
  color: var(--home-accent-a);
  box-shadow:
    0 0 0 8px color-mix(in srgb, var(--home-accent-soft) 45%, transparent),
    0 0 34px var(--home-accent-glow);
}

.flow-orb-ring {
  position: absolute;
  inset: -8px;
  border: 1px dashed color-mix(in srgb, var(--home-accent-a) 38%, transparent);
  border-radius: 50%;
  animation: spin-slow 14s linear infinite;
}

.flow-index {
  margin-top: 20px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  background: linear-gradient(90deg, var(--home-accent-a), var(--home-accent-b));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.flow-node h3 {
  margin: 8px 0 9px;
  color: var(--home-text);
  font-size: 17px;
  font-weight: 730;
}

.flow-node p {
  max-width: 300px;
  margin: 0;
  color: var(--home-muted);
  font-size: 13.5px;
  line-height: 1.7;
}

/* Energy conduit between orbs: a faint rail with a light pulse travelling
   from this node to the next, looping. */
.flow-link {
  position: absolute;
  top: 34px;
  left: calc(50% + 46px);
  right: calc(-50% + 46px);
  height: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--home-accent-a) 18%, transparent);
}

.flow-link-beam {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -48px;
  width: 46px;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--home-accent-fill) 55%, #ffffff);
  filter: drop-shadow(0 0 6px var(--home-accent-glow));
  animation: beam-travel 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.flow-node:nth-child(2) .flow-link-beam {
  animation-delay: 1.3s;
}

/* ============ Comparison ============ */
.compare-section {
  padding: 0 0 120px;
}

.compare-frame {
  overflow-x: auto;
  border: 1px solid var(--home-border-strong);
  border-radius: 20px;
  background: var(--home-surface-solid);
  box-shadow: inset 0 1px 0 var(--home-inset-hi), var(--home-shadow);
}

.compare-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  text-align: left;
}

.compare-table thead th {
  padding: 20px 24px;
  border-bottom: 1px solid var(--home-border-strong);
  color: var(--home-muted);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.compare-us-tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--home-accent-a), var(--home-accent-b));
  color: var(--home-on-accent);
  font-size: 12.5px;
  font-weight: 700;
}

.compare-table tbody th {
  padding: 18px 24px;
  border-bottom: 1px solid var(--home-border);
  color: var(--home-text);
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.compare-table tbody td {
  padding: 18px 24px;
  border-bottom: 1px solid var(--home-border);
  color: var(--home-muted);
  font-size: 13.5px;
  line-height: 1.6;
  vertical-align: top;
}

.compare-table tbody tr:last-child :is(th, td) {
  border-bottom: 0;
}

.compare-mark {
  margin-right: 8px;
  vertical-align: -2px;
}

.compare-mark--no {
  color: var(--home-faint);
}

.compare-mark--yes {
  color: var(--home-ok);
}

.compare-table .compare-col-us {
  background: color-mix(in srgb, var(--home-accent-soft) 55%, transparent);
}

.compare-table tbody .compare-col-us {
  color: var(--home-text);
  font-weight: 650;
}

/* ============ Capabilities ============ */
.capability-section {
  padding: 0 0 120px;
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.capability-item {
  position: relative;
  display: flex;
  min-height: 264px;
  flex-direction: column;
  padding: 28px;
  overflow: hidden;
  border: 1px solid var(--home-border);
  border-radius: 20px;
  background: var(--home-card);
  box-shadow: inset 0 1px 0 var(--home-inset-hi);
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
}

.capability-item:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--capability-accent) 45%, var(--home-border));
  box-shadow:
    inset 0 1px 0 var(--home-inset-hi),
    0 22px 50px rgba(8, 22, 52, 0.14),
    0 0 30px color-mix(in srgb, var(--capability-accent) 14%, transparent);
}

.capability-item::after {
  position: absolute;
  top: -46%;
  right: -24%;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--capability-accent) 16%, transparent), transparent 70%);
  content: '';
  pointer-events: none;
}

.capability-item--cyan { --capability-accent: #38bdf8; }
.capability-item--violet { --capability-accent: #a78bfa; }
.capability-item--blue { --capability-accent: #60a5fa; }

.capability-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--capability-accent) 36%, transparent);
  border-radius: 13px;
  background: color-mix(in srgb, var(--capability-accent) 12%, transparent);
  color: var(--capability-accent);
}

.capability-item h3 {
  position: relative;
  z-index: 1;
  margin: 24px 0 11px;
  color: var(--home-text);
  font-size: 19px;
  font-weight: 740;
}

.capability-item p {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--home-muted);
  font-size: 13.5px;
  line-height: 1.75;
}

.capability-footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 22px;
  color: var(--home-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.capability-footer i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--capability-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--capability-accent) 16%, transparent);
}

/* ============ Providers ============ */
.provider-section {
  padding: 0 0 120px;
}

.provider-marquee {
  overflow: hidden;
  padding: 6px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
}

.provider-marquee-track {
  display: flex;
  width: max-content;
  animation: ticker-scroll 30s linear infinite;
}

.provider-marquee:hover .provider-marquee-track {
  animation-play-state: paused;
}

.provider-marquee-group {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-right: 14px;
}

.provider-chip {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 13px;
  padding: 15px 20px;
  border: 1px solid var(--home-border);
  border-radius: 16px;
  background: var(--home-card);
  box-shadow: inset 0 1px 0 var(--home-inset-hi);
  transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;
}

.provider-chip:hover {
  border-color: color-mix(in srgb, var(--home-accent-a) 42%, var(--home-border));
  box-shadow: inset 0 1px 0 var(--home-inset-hi), 0 0 26px var(--home-accent-soft);
  transform: translateY(-2px);
}

.provider-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  border: 1px solid var(--home-border);
  border-radius: 12px;
  background: var(--home-surface-solid);
  color: var(--home-text);
}

.provider-icon--anthropic { color: #d97706; }
.provider-icon--gemini { color: #4285f4; }
.provider-icon--antigravity { color: #e04c8a; }

.provider-chip-copy {
  display: grid;
  gap: 3px;
  padding-right: 18px;
}

.provider-chip-copy strong {
  overflow: hidden;
  color: var(--home-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-chip-copy small {
  color: var(--home-faint);
  font-size: 11.5px;
  white-space: nowrap;
}

.provider-chip-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--home-ok);
  box-shadow: 0 0 0 3px var(--home-ok-soft);
  animation: pulse-soft 2.2s ease-in-out infinite;
}

.provider-chip--soon {
  border-style: dashed;
  opacity: 0.72;
}

.provider-chip--soon .provider-chip-dot {
  background: var(--home-faint);
  box-shadow: none;
  animation: none;
}

/* ============ CTA ============ */
.cta-section {
  padding: 0 0 120px;
}

.cta-panel {
  position: relative;
  overflow: hidden;
  padding: 72px 40px;
  border: 1px solid var(--home-border-strong);
  border-radius: 26px;
  background: color-mix(in srgb, var(--home-surface-strong) 90%, transparent);
  box-shadow: inset 0 1px 0 var(--home-inset-hi), var(--home-shadow);
  text-align: center;
  backdrop-filter: blur(16px);
}

.cta-glow {
  position: absolute;
  top: -60%;
  left: 50%;
  width: 720px;
  height: 420px;
  background:
    radial-gradient(closest-side, var(--home-accent-soft), transparent 80%),
    radial-gradient(closest-side, var(--home-accent-b-soft), transparent 90%);
  transform: translateX(-50%);
  filter: blur(20px);
  pointer-events: none;
}

.cta-panel p {
  position: relative;
  max-width: 460px;
  margin: 16px auto 0;
  color: var(--home-muted);
  font-size: 15px;
  line-height: 1.75;
}

.cta-action {
  position: relative;
  min-height: 52px;
  gap: 12px;
  margin-top: 32px;
  padding: 0 26px;
  background: linear-gradient(135deg, var(--home-accent-a), var(--home-accent-b));
  color: var(--home-on-accent);
  font-size: 14px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 12px 36px var(--home-accent-glow);
}

.cta-action:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 16px 42px var(--home-accent-glow);
}

/* ============ Footer ============ */
.home-footer {
  position: relative;
  z-index: 1;
  border-top: 1px solid var(--home-border);
  background: var(--home-card);
}

.footer-inner {
  display: flex;
  width: min(1200px, calc(100% - 48px));
  min-height: 84px;
  margin: 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  color: var(--home-faint);
  font-size: 12px;
}

.footer-brand,
.footer-links {
  display: flex;
  align-items: center;
}

.footer-brand {
  min-width: 0;
  gap: 10px;
}

.footer-brand img {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 6px;
  object-fit: cover;
}

.footer-links {
  gap: 20px;
}

.footer-links a {
  color: var(--home-muted);
  text-decoration: none;
  transition: color 160ms ease;
}

.footer-links a:hover {
  color: var(--home-accent-a);
}

/* ============ Keyframes ============ */
@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes aurora-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(30px, -24px, 0) scale(1.1); }
}

@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

@keyframes spin-slow {
  to { transform: rotate(360deg); }
}

@keyframes sheen {
  0%, 60%, 100% { left: -45%; }
  78% { left: 125%; }
}

@keyframes bar-grow {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@keyframes float-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes ticker-scroll {
  to { transform: translateX(-50%); }
}

@keyframes beam-travel {
  from { left: -48px; }
  to { left: 100%; }
}

@keyframes beam-travel-y {
  from { top: -48px; }
  to { top: 100%; }
}

/* ============ Responsive ============ */
@media (max-width: 1023px) {
  .hero-inner {
    grid-template-columns: 1fr;
    padding: 64px 0 120px;
    gap: 48px;
  }

  .hero-visual {
    max-width: 560px;
    margin: 0 auto;
  }

  .steps-flow {
    grid-template-columns: 1fr;
  }

  /* Conduit turns vertical between stacked nodes. */
  .flow-link {
    top: calc(100% - 4px);
    bottom: -20px;
    left: calc(50% - 1px);
    right: auto;
    width: 2px;
    height: auto;
    background: linear-gradient(180deg, color-mix(in srgb, var(--home-accent-a) 18%, transparent), color-mix(in srgb, var(--home-accent-a) 18%, transparent));
  }

  .flow-link-beam {
    top: -48px;
    bottom: auto;
    left: 0;
    width: 100%;
    height: 46px;
    background: linear-gradient(180deg, transparent, var(--home-accent-fill) 55%, #ffffff);
    animation-name: beam-travel-y;
  }

  .capability-grid {
    grid-template-columns: 1fr;
  }

  .signal-strip {
    grid-template-columns: 1fr 1fr;
  }

  .signal-item:nth-child(2) {
    border-right: 0;
  }

  .signal-item:nth-child(-n + 2) {
    border-bottom: 1px solid var(--home-border);
  }
}

@media (max-width: 767px) {
  .home-header {
    height: 64px;
  }

  .home-nav,
  .signal-strip,
  .pool-section,
  .direct-section,
  .steps-section,
  .capability-section,
  .provider-section,
  .compare-section,
  .cta-section,
  .footer-inner {
    width: min(100% - 32px, 1200px);
  }

  .hero-inner {
    width: min(100% - 32px, 1200px);
    padding: 48px 0 108px;
  }

  .brand-name,
  .brand-chip,
  :deep(.home-locale > button span:nth-child(2)),
  .header-cta svg {
    display: none;
  }

  .header-actions {
    gap: 4px;
  }

  .header-cta {
    padding: 0 12px;
  }

  .hero-copy h1 {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 18px;
  }

  .hero-description {
    font-size: 13.5px;
  }

  .hero-stats {
    margin-top: 30px;
  }

  .hero-stat {
    min-width: 0;
    flex: 1 1 40%;
    margin-right: 0;
    padding-right: 12px;
  }

  .hero-stat strong {
    font-size: 18px;
  }

  .float-chip {
    display: none;
  }

  .pool-console {
    width: 100%;
  }

  .pool-meta {
    min-width: 78px;
  }

  .pool-state {
    min-width: 52px;
  }

  .signal-strip {
    margin-top: -38px;
  }

  .signal-item {
    padding: 14px 16px;
  }

  .signal-copy strong {
    font-size: 12px;
    white-space: normal;
  }

  .pool-section {
    padding: 88px 0 84px;
  }

  .pool-features {
    grid-template-columns: 1fr;
  }

  .direct-features {
    grid-template-columns: 1fr;
  }

  .section-heading {
    display: block;
    margin-bottom: 30px;
  }

  .section-heading p {
    margin-top: 12px;
    text-align: left;
  }

  .steps-section,
  .direct-section,
  .capability-section,
  .provider-section,
  .compare-section {
    padding-bottom: 88px;
  }

  .steps-flow {
    gap: 34px;
  }

  .hero-eyebrow {
    font-size: 11px;
    letter-spacing: 0.12em;
  }

  /* A 3-column table cannot fit a phone; stacking keeps the "us" column
     visible instead of parking it off-screen behind a horizontal scroll. */
  .compare-frame {
    overflow: visible;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .compare-table {
    min-width: 0;
  }

  .compare-table thead {
    display: none;
  }

  .compare-table,
  .compare-table tbody,
  .compare-table tbody tr,
  .compare-table tbody th,
  .compare-table tbody td {
    display: block;
  }

  .compare-table tbody tr {
    overflow: hidden;
    margin-bottom: 12px;
    border: 1px solid var(--home-border);
    border-radius: 16px;
    background: var(--home-card);
  }

  .compare-table tbody th {
    padding: 14px 16px;
    border-bottom: 1px solid var(--home-border);
    white-space: normal;
  }

  .compare-table tbody tr:last-child th {
    border-bottom: 1px solid var(--home-border);
  }

  .compare-table tbody td {
    display: flex;
    gap: 8px;
    padding: 11px 16px;
    border-bottom: 0;
    font-size: 13px;
  }

  .compare-table tbody td:last-child {
    padding-bottom: 15px;
  }

  .compare-table tbody td::before {
    flex: 0 0 68px;
    color: var(--home-faint);
    content: attr(data-label);
    font-size: 12px;
    font-weight: 650;
  }

  .compare-mark {
    flex: 0 0 auto;
    margin-right: 0;
    margin-top: 3px;
  }

  .provider-chip {
    padding: 12px 16px;
  }

  .provider-icon {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
  }

  .cta-section {
    padding-bottom: 96px;
  }

  .cta-panel {
    padding: 52px 24px;
  }

  .footer-inner {
    min-height: 104px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 12px;
  }
}

@media (max-width: 390px) {
  .home-nav,
  .hero-inner,
  .signal-strip,
  .pool-section,
  .direct-section,
  .steps-section,
  .capability-section,
  .provider-section,
  .compare-section,
  .cta-section,
  .footer-inner {
    width: min(100% - 24px, 1200px);
  }

  .brand-mark,
  .header-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }

  .header-cta {
    min-height: 34px;
    font-size: 11px;
  }

  .secondary-action {
    display: none;
  }

  .hero-copy h1 {
    font-size: 25px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-shell *,
  .home-shell *::before,
  .home-shell *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .hero-copy > *,
  .hero-visual {
    opacity: 1;
  }
}
</style>
