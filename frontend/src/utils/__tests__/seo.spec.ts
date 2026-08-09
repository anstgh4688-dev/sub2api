import { beforeEach, describe, expect, it } from 'vitest'
import { applyRouteSeo, SEO_SITE_ORIGIN } from '@/utils/seo'

const translations: Record<string, string> = {
  'home.seo.title': 'AI API 中转与多模型统一网关',
  'home.seo.description': '统一接入 Claude、GPT 与 Gemini。',
  'home.seo.keywords': 'AI API,Claude API,GPT API,Gemini API',
}

function translate(key: string): string {
  return translations[key] ?? key
}

describe('applyRouteSeo', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="description" content="old">
      <meta name="robots" content="index, follow">
      <link rel="canonical" href="${SEO_SITE_ORIGIN}/old">
      <script id="site-structured-data" type="application/ld+json">{}</script>
    `
    document.documentElement.lang = 'en'
  })

  it('publishes canonical, social and structured metadata for the indexable home page', () => {
    applyRouteSeo({
      route: {
        path: '/home',
        meta: {
          seoIndex: true,
          canonicalPath: '/',
          seoTitleKey: 'home.seo.title',
          seoDescriptionKey: 'home.seo.description',
          seoKeywordsKey: 'home.seo.keywords',
        },
      },
      fallbackTitle: 'Home - Sub2API',
      siteName: 'Sub2API',
      siteLogo: '/logo.svg',
      locale: 'zh',
      translate,
    })

    expect(document.title).toBe('Sub2API - AI API 中转与多模型统一网关')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      '统一接入 Claude、GPT 与 Gemini。',
    )
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('index, follow')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SEO_SITE_ORIGIN}/`)
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${SEO_SITE_ORIGIN}/`)

    const structuredData = JSON.parse(document.querySelector('#site-structured-data')?.textContent ?? '{}')
    expect(structuredData['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@type': 'WebSite', url: `${SEO_SITE_ORIGIN}/` }),
        expect.objectContaining({ '@type': 'SoftwareApplication' }),
      ]),
    )
  })

  it('removes index and sharing signals from private routes', () => {
    applyRouteSeo({
      route: { path: '/dashboard', meta: { title: 'Dashboard' } },
      fallbackTitle: 'Dashboard - Sub2API',
      siteName: 'Sub2API',
      siteSubtitle: 'Subscription to API Conversion Platform',
      locale: 'en',
      translate,
    })

    expect(document.title).toBe('Dashboard - Sub2API')
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow, noarchive',
    )
    expect(document.querySelector('meta[name="baiduspider"]')?.getAttribute('content')).toBe(
      'noindex, nofollow, noarchive',
    )
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.querySelector('#site-structured-data')).toBeNull()
    expect(document.querySelector('meta[property="og:url"]')).toBeNull()
  })
})
