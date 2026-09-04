import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

import { vReveal } from '../reveal'

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void

let ioCallback: IOCallback | null = null
const observed: Element[] = []
const unobserved: Element[] = []

class FakeIntersectionObserver {
  constructor(cb: IOCallback) {
    ioCallback = cb
  }
  observe(el: Element) {
    observed.push(el)
  }
  unobserve(el: Element) {
    unobserved.push(el)
  }
  disconnect() {}
}

const TestComponent = defineComponent({
  directives: { reveal: vReveal },
  template: `
    <div>
      <p id="plain" v-reveal>plain</p>
      <p id="staggered" v-reveal="140">staggered</p>
    </div>
  `
})

function setMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches: reduced })
  })
}

describe('vReveal', () => {
  beforeEach(() => {
    // The directive keeps a module-level observer singleton, so the fake's
    // constructor runs only once per file — do NOT reset ioCallback here;
    // each mount simply reuses the existing instance.
    observed.length = 0
    unobserved.length = 0
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    setMatchMedia(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hides the element and observes it on mount', () => {
    const wrapper = mount(TestComponent)

    const plain = wrapper.get('#plain').element
    expect(plain.classList.contains('reveal')).toBe(true)
    expect(plain.style.getPropertyValue('--reveal-delay')).toBe('')
    expect(observed).toHaveLength(2)

    const staggered = wrapper.get('#staggered').element
    expect(staggered.style.getPropertyValue('--reveal-delay')).toBe('140ms')

    wrapper.unmount()
  })

  it('reveals on intersect, then hands styles back after the animation ends', () => {
    const wrapper = mount(TestComponent)
    const el = wrapper.get('#plain').element as HTMLElement

    expect(ioCallback).not.toBeNull()
    ioCallback!([{ target: el, isIntersecting: true }])

    expect(el.classList.contains('reveal-visible')).toBe(true)
    expect(unobserved).toContain(el)

    el.dispatchEvent(new Event('animationend', { bubbles: false }))

    expect(el.classList.contains('reveal')).toBe(false)
    expect(el.classList.contains('reveal-visible')).toBe(false)

    wrapper.unmount()
  })

  it('keeps content visible when reduced motion is preferred', () => {
    setMatchMedia(true)
    const wrapper = mount(TestComponent)

    expect(wrapper.get('#plain').element.classList.contains('reveal')).toBe(false)
    expect(observed).toHaveLength(0)

    wrapper.unmount()
  })

  it('unobserves on unmount before the element ever intersects', () => {
    const wrapper = mount(TestComponent)
    const el = wrapper.get('#plain').element

    wrapper.unmount()

    expect(unobserved).toContain(el)
  })
})
