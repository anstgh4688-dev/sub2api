(() => {
  const root = document.documentElement
  const body = document.body
  root.dataset.theme = 'dark'

  const query = (selector, scope = document) => scope.querySelector(selector)
  const queryAll = (selector, scope = document) => Array.from(scope.querySelectorAll(selector))

  const normalizeRootURL = (value) => {
    const raw = String(value || window.location.origin).trim().replace(/\/+$/, '')
    return raw.replace(/\/v1$/i, '') || window.location.origin
  }

  const normalizeAPIBaseURL = (value) => `${normalizeRootURL(value)}/v1`

  const runtime = {
    apiRootURL: window.location.origin,
    apiBaseURL: `${window.location.origin}/v1`,
  }

  const renderRuntimeValues = () => {
    queryAll('[data-api-base]').forEach((element) => {
      element.textContent = runtime.apiBaseURL
    })

    queryAll('pre code').forEach((element) => {
      if (!element.dataset.template) {
        element.dataset.template = element.textContent
      }
      element.textContent = element.dataset.template
        .replaceAll('{{API_BASE_URL}}', runtime.apiBaseURL)
        .replaceAll('{{API_ROOT_URL}}', runtime.apiRootURL)
    })
  }

  const applyPublicSettings = (settings) => {
    const siteName = String(settings?.site_name || 'Sub2API').trim() || 'Sub2API'
    const siteLogo = String(settings?.site_logo || '').trim()
    const contactInfo = String(settings?.contact_info || '').trim()

    queryAll('[data-site-name]').forEach((element) => {
      element.textContent = siteName
    })

    if (siteLogo) {
      queryAll('[data-site-logo]').forEach((image) => {
        image.src = siteLogo
      })
    }

    if (contactInfo) {
      queryAll('[data-contact-info]').forEach((element) => {
        element.textContent = contactInfo
      })
    }

    runtime.apiRootURL = normalizeRootURL(settings?.api_base_url)
    runtime.apiBaseURL = normalizeAPIBaseURL(settings?.api_base_url)
    document.title = `快速开始 - ${siteName} Docs`
    renderRuntimeValues()
  }

  const loadPublicSettings = async () => {
    try {
      const response = await fetch('/api/v1/settings/public', {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = await response.json()
      if (payload?.code !== 0 || !payload?.data) {
        throw new Error(payload?.message || 'invalid public settings response')
      }
      applyPublicSettings(payload.data)
    } catch (error) {
      console.warn('[docs] 无法读取站点公开设置，页面将使用当前域名和默认品牌。', error)
      renderRuntimeValues()
    }
  }

  const themeColor = query('meta[name="theme-color"]')
  themeColor?.setAttribute('content', '#020409')

  const sidebar = query('[data-sidebar]')
  const navOpen = query('[data-nav-open]')
  const navClose = query('[data-nav-close]')
  const navBackdrop = query('[data-nav-backdrop]')

  const setNavigationOpen = (open) => {
    body.classList.toggle('nav-open', open)
    navBackdrop.hidden = !open
    navOpen?.setAttribute('aria-expanded', String(open))
    if (open) {
      navClose?.focus()
    }
  }

  navOpen?.addEventListener('click', () => setNavigationOpen(true))
  navClose?.addEventListener('click', () => setNavigationOpen(false))
  navBackdrop?.addEventListener('click', () => setNavigationOpen(false))
  queryAll('a[href^="#"]', sidebar).forEach((link) => {
    link.addEventListener('click', () => setNavigationOpen(false))
  })

  const toast = query('[data-toast]')
  let toastTimer
  const showToast = (message = '已复制') => {
    window.clearTimeout(toastTimer)
    toast.textContent = message
    toast.classList.add('visible')
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 1600)
  }

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast()
    } catch (error) {
      console.error('[docs] 复制失败。', error)
      showToast('复制失败')
    }
  }

  queryAll('[data-copy-text]').forEach((button) => {
    button.addEventListener('click', () => copyText(button.dataset.copyText || ''))
  })

  queryAll('[data-copy-selector]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = query(button.dataset.copySelector)
      if (!target) {
        console.error('[docs] 未找到复制目标。', button.dataset.copySelector)
        showToast('复制失败')
        return
      }
      copyText(target.textContent.trim())
    })
  })

  queryAll('[data-copy-next]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.code-card')
      const target = query('pre', card)
      if (!target) {
        console.error('[docs] 未找到代码块。')
        showToast('复制失败')
        return
      }
      copyText(target.textContent.trim())
    })
  })

  queryAll('[data-code-group]').forEach((group) => {
    const tabs = queryAll('[data-code-tab]', group)
    const panels = queryAll('[data-code-panel]', group)
    const copyButton = query('[data-copy-current]', group)

    const selectTab = (name) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.codeTab === name
        tab.classList.toggle('active', active)
        tab.setAttribute('aria-selected', String(active))
      })
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.codePanel !== name
      })
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => selectTab(tab.dataset.codeTab))
    })

    copyButton?.addEventListener('click', () => {
      const activePanel = panels.find((panel) => !panel.hidden)
      if (!activePanel) {
        console.error('[docs] 当前代码面板不存在。')
        showToast('复制失败')
        return
      }
      copyText(activePanel.textContent.trim())
    })
  })

  const sectionElements = queryAll('.section-anchor[id]')
  const sidebarLinks = queryAll('.docs-nav a[href^="#"]')
  const tocLinks = queryAll('[data-page-toc] a[href^="#"]')

  const updateActiveSection = (id) => {
    [...sidebarLinks, ...tocLinks].forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${id}`)
    })
  }

  if ('IntersectionObserver' in window) {
    const visibleSections = new Map()
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visibleSections.set(entry.target.id, entry.boundingClientRect.top)
        } else {
          visibleSections.delete(entry.target.id)
        }
      })
      const active = [...visibleSections.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]
      if (active) updateActiveSection(active[0])
    }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.1, 0.5] })
    sectionElements.forEach((section) => observer.observe(section))
  }

  const searchDialog = query('[data-search-dialog]')
  const searchInput = query('[data-search-input]')
  const searchResults = query('[data-search-results]')
  const searchEmpty = query('[data-search-empty]')
  const searchKey = query('[data-search-key]')
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  if (searchKey) searchKey.textContent = isMac ? '⌘ K' : 'Ctrl K'

  const searchIndex = sectionElements.map((section, index) => {
    const title = section.dataset.searchTitle || query('h1, h2', section)?.textContent || section.id
    const description = query('p:not(.eyebrow)', section)?.textContent?.trim() || ''
    const searchable = `${title} ${description} ${section.textContent}`.toLocaleLowerCase('zh-CN')
    return { id: section.id, title, description, searchable, index: String(index).padStart(2, '0') }
  })

  const renderSearchResults = (term = '') => {
    const normalized = term.trim().toLocaleLowerCase('zh-CN')
    const matches = searchIndex
      .filter((item) => !normalized || item.searchable.includes(normalized))
      .slice(0, 10)

    searchResults.replaceChildren(...matches.map((item) => {
      const link = document.createElement('a')
      link.className = 'search-result'
      link.href = `#${item.id}`
      link.innerHTML = `<span class="search-result-index">${item.index}</span><span><strong></strong><small></small></span><span aria-hidden="true">→</span>`
      query('strong', link).textContent = item.title
      query('small', link).textContent = item.description.slice(0, 72)
      link.addEventListener('click', () => closeSearch())
      return link
    }))
    searchEmpty.hidden = matches.length > 0
  }

  const openSearch = () => {
    searchDialog.hidden = false
    body.classList.add('search-open')
    renderSearchResults('')
    window.requestAnimationFrame(() => searchInput.focus())
  }

  const closeSearch = () => {
    searchDialog.hidden = true
    body.classList.remove('search-open')
    searchInput.value = ''
  }

  queryAll('[data-search-open]').forEach((button) => button.addEventListener('click', openSearch))
  queryAll('[data-search-close]').forEach((button) => button.addEventListener('click', closeSearch))
  searchInput?.addEventListener('input', () => renderSearchResults(searchInput.value))

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      openSearch()
      return
    }
    if (event.key === 'Escape') {
      if (!searchDialog.hidden) closeSearch()
      if (body.classList.contains('nav-open')) setNavigationOpen(false)
    }
  })

  renderRuntimeValues()
  loadPublicSettings()
})()
