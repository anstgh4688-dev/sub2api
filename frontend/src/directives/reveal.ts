import type { Directive } from 'vue'

// Apple-style scroll reveal: a single shared IntersectionObserver flips
// .reveal → .reveal-visible once when the element enters the viewport. The
// CSS animation uses `both` fill so a staggered delay holds the hidden
// state, and the classes are removed on animationend so the element's own
// hover transitions take over again (animation fill would otherwise
// override them).
//
// Graceful degradation: when IntersectionObserver is missing (old browsers,
// jsdom) or the user prefers reduced motion, the directive simply never
// hides the element — content stays visible.
let observer: IntersectionObserver | null = null

function onAnimationEnd(this: HTMLElement, event: AnimationEvent) {
  // Nested reveals: only clean up the element whose own animation finished.
  if (event.target !== this) return
  this.classList.remove('reveal', 'reveal-visible')
  this.style.removeProperty('--reveal-delay')
  this.removeEventListener('animationend', onAnimationEnd)
}

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        el.classList.add('reveal-visible')
        el.addEventListener('animationend', onAnimationEnd)
        observer?.unobserve(el)
      }
    },
    // rootMargin shrinks the bottom edge so elements reveal slightly after
    // entering view, the way apple.com staggers content just below the fold.
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  )
  return observer
}

/**
 * v-reveal — one-shot scroll-in animation.
 *
 *   <div v-reveal />              <!-- reveal when scrolled into view -->
 *   <div v-reveal="120" />        <!-- with a 120ms delay (sibling stagger) -->
 *   <div v-reveal="i * 90" />     <!-- typical v-for stagger -->
 */
export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    if (prefersReduced) return
    const io = getObserver()
    if (!io) return

    const delay = typeof binding.value === 'number' ? binding.value : 0
    if (delay > 0) el.style.setProperty('--reveal-delay', `${delay}ms`)

    el.classList.add('reveal')
    io.observe(el)
  },
  unmounted(el) {
    observer?.unobserve(el)
    el.removeEventListener('animationend', onAnimationEnd)
  }
}
