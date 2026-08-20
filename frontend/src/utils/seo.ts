import type { RouteLocationNormalizedLoaded } from 'vue-router'

export const SEO_SITE_ORIGIN = 'https://myrt.cc'
export const SEO_SHARE_IMAGE_URL = `${SEO_SITE_ORIGIN}/og-image.png`

const DEFAULT_DESCRIPTION =
  'Sub2API provides unified access to Claude, GPT, Gemini and other leading AI models with smart routing and live health monitoring.'
const CRAWLER_META_NAMES = ['robots', 'googlebot', 'bingbot', 'baiduspider'] as const

type Translate = (key: string) => string

interface RouteSeoContext {
  route: Pick<RouteLocationNormalizedLoaded, 'path' | 'meta'>
  fallbackTitle: string
  siteName: string
  siteLogo?: string
  siteSubtitle?: string
  locale: string
  translate: Translate
}

function translatedValue(translate: Translate, key: unknown): string {
  if (typeof key !== 'string' || !key.trim()) return ''
  const value = translate(key)
  return value && value !== key ? value.trim() : ''
}

function upsertMeta(attribute: 'name' | 'property', value: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, value)
    document.head.appendChild(element)
  }
  element.content = content
}

function removeMeta(attribute: 'name' | 'property', value: string): void {
  document.head.querySelector(`meta[${attribute}="${value}"]`)?.remove()
}

function upsertCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = href
}

function absoluteLogoUrl(siteLogo?: string): string {
  const trimmed = siteLogo?.trim() ?? ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return new URL(trimmed, SEO_SITE_ORIGIN).href
  }
  return `${SEO_SITE_ORIGIN}/logo.svg`
}

function updateStructuredData(siteName: string, description: string, siteLogo?: string): void {
  let element = document.head.querySelector<HTMLScriptElement>('#site-structured-data')
  if (!element) {
    element = document.createElement('script')
    element.id = 'site-structured-data'
    element.type = 'application/ld+json'
    document.head.appendChild(element)
  }

  element.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SEO_SITE_ORIGIN}/#website`,
        url: `${SEO_SITE_ORIGIN}/`,
        name: siteName,
        description,
        inLanguage: ['zh-CN', 'en'],
      },
      {
        '@type': 'Organization',
        '@id': `${SEO_SITE_ORIGIN}/#organization`,
        url: `${SEO_SITE_ORIGIN}/`,
        name: siteName,
        logo: absoluteLogoUrl(siteLogo),
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SEO_SITE_ORIGIN}/#software`,
        url: `${SEO_SITE_ORIGIN}/`,
        name: siteName,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        description,
        image: SEO_SHARE_IMAGE_URL,
      },
    ],
  })
}

function clearShareMetadata(): void {
  for (const property of [
    'og:type',
    'og:site_name',
    'og:title',
    'og:description',
    'og:url',
    'og:locale',
    'og:locale:alternate',
    'og:image',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
  ]) {
    removeMeta('property', property)
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
    removeMeta('name', name)
  }
}

export function applyRouteSeo(context: RouteSeoContext): void {
  const { route, fallbackTitle, siteName, siteLogo, siteSubtitle, locale, translate } = context
  const indexable = route.meta.seoIndex === true
  const normalizedLocale = locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  const description =
    translatedValue(translate, route.meta.seoDescriptionKey) || siteSubtitle?.trim() || DEFAULT_DESCRIPTION
  const seoTitle = translatedValue(translate, route.meta.seoTitleKey)
  const title = seoTitle ? `${siteName} - ${seoTitle}` : fallbackTitle

  document.title = title
  document.documentElement.lang = normalizedLocale
  upsertMeta('name', 'description', description)

  const robots = indexable
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'noindex, nofollow, noarchive'
  for (const crawler of CRAWLER_META_NAMES) {
    upsertMeta('name', crawler, robots)
  }

  if (!indexable) {
    removeMeta('name', 'keywords')
    document.head.querySelector('link[rel="canonical"]')?.remove()
    document.head.querySelector('#site-structured-data')?.remove()
    clearShareMetadata()
    return
  }

  const keywords = translatedValue(translate, route.meta.seoKeywordsKey)
  if (keywords) upsertMeta('name', 'keywords', keywords)

  const canonicalPath =
    typeof route.meta.canonicalPath === 'string' && route.meta.canonicalPath
      ? route.meta.canonicalPath
      : route.path
  const canonicalUrl = new URL(canonicalPath, SEO_SITE_ORIGIN).href
  upsertCanonical(canonicalUrl)

  const ogLocale = normalizedLocale === 'zh-CN' ? 'zh_CN' : 'en_US'
  const alternateLocale = ogLocale === 'zh_CN' ? 'en_US' : 'zh_CN'
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:site_name', siteName)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:url', canonicalUrl)
  upsertMeta('property', 'og:locale', ogLocale)
  upsertMeta('property', 'og:locale:alternate', alternateLocale)
  upsertMeta('property', 'og:image', SEO_SHARE_IMAGE_URL)
  upsertMeta('property', 'og:image:width', '1200')
  upsertMeta('property', 'og:image:height', '630')
  upsertMeta('property', 'og:image:alt', title)
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', description)
  upsertMeta('name', 'twitter:image', SEO_SHARE_IMAGE_URL)
  upsertMeta('name', 'twitter:image:alt', title)
  updateStructuredData(siteName, description, siteLogo)
}
