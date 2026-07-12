// @vitest-environment jsdom
//
// Document scroll for How-to-Play (Q3, batch item d). In guide mode ONLY, App stamps
// data-doc-scroll on <html>; index.css releases the three scroll clamps (html/body
// overflow:hidden + the fixed 100dvh #root) so the DOCUMENT becomes the scroller — the only
// way iOS's tap-status-bar-to-scroll-to-top can work (it targets the root scroller
// exclusively; no JS event exists to intercept the tap). These tests pin the pure logic:
// the attribute lifecycle, the leave-guide scroll-reset ordering (window zeroed BEFORE the
// re-clamp), the container's class branching, and the scroll-state sourcing
// (document.scrollingElement + window in guide mode, the container otherwise). The FEEL —
// the real status-bar tap, rubber-band over --bg1, Safari toolbar collapse, home-indicator
// clearance — is on-device staging territory per the standing lesson.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'

// CustomSelect portals into #root, so the harness must provide one (see app-mount.dom).
function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

// Keyboard mode switching (the same lever the other mode tests use): H toggles to/from
// guide, K jumps to Classic.
function pressKey(key) {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}

// The app scroll container is the div carrying the inline paddingTop:var(--bar-h) — the one
// style BOTH branches keep (it's deliberately classless in guide mode, so the class list
// can't identify it there).
function scrollContainer(container) {
  return [...container.querySelectorAll('div')].find((d) => d.style.paddingTop === 'var(--bar-h)')
}

describe('document scroll for How-to-Play (data-doc-scroll)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    // Safety: never leak the attribute or a mocked root scroller into the next test.
    document.documentElement.removeAttribute('data-doc-scroll')
    delete document.scrollingElement
  })

  it('stamps data-doc-scroll on <html> in guide mode only, removing it on switch and unmount', () => {
    const { unmount } = mountApp()
    const html = document.documentElement
    expect(html.hasAttribute('data-doc-scroll')).toBe(false) // launch mode (Classic)
    pressKey('H') // → guide
    expect(html.hasAttribute('data-doc-scroll')).toBe(true)
    pressKey('K') // → Classic
    expect(html.hasAttribute('data-doc-scroll')).toBe(false)
    pressKey('H') // → guide again
    expect(html.hasAttribute('data-doc-scroll')).toBe(true)
    unmount()
    expect(html.hasAttribute('data-doc-scroll')).toBe(false)
  })

  it('zeroes the window scroll BEFORE re-clamping on leave, and resets the container', () => {
    const { container } = mountApp()
    pressKey('H')
    const el = scrollContainer(container)
    el.scrollTop = 77 // jsdom persists the raw value — stands in for a scrolled container
    // The first scrollTo(0,0) must arrive while the document is still unclamped (attribute
    // still present): a scroll reset AFTER the re-clamp would leave the layout offset.
    let attrPresentAtFirstCall = null
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      if (attrPresentAtFirstCall === null)
        attrPresentAtFirstCall = document.documentElement.hasAttribute('data-doc-scroll')
    })
    pressKey('K') // leave guide → the layout-effect cleanup runs, then the mode reset
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    expect(attrPresentAtFirstCall).toBe(true)
    expect(el.scrollTop).toBe(0) // the mode-switch reset re-zeroed the container
    scrollToSpy.mockRestore()
  })

  it('renders the container clamped in game modes and as a classless flow block in guide', () => {
    const { container } = mountApp()
    const el = scrollContainer(container)
    // Clamped (Classic): the absolute overflow box, wrapper keeps the plain pb-3.
    expect(el.className).toContain('absolute')
    expect(el.className).toContain('inset-0')
    expect(el.className).toContain('overflow-y-auto')
    expect(el.className).toContain('overscroll-contain')
    expect(el.firstElementChild.className).toContain('pb-3')
    pressKey('H') // → guide: same node (same ref), no clamp/overflow/mask classes at all
    expect(el.className).toBe('')
    // Wrapper trades pb-3 for the safe-area-aware bottom padding (home-indicator clearance).
    expect(el.firstElementChild.className).not.toContain('pb-3')
    expect(el.firstElementChild.className).toContain(
      'pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]',
    )
    pressKey('H') // back to Classic: fully re-clamped
    expect(el.className).toContain('overflow-y-auto')
    expect(el.firstElementChild.className).toContain('pb-3')
  })

  it('drives the bar shadow + doc-fade strips from document.scrollingElement in guide mode', () => {
    const { container } = mountApp()
    pressKey('H')
    const bar = container.querySelector('.htp-sticky-bar')
    expect(bar.className).not.toContain('elev-shadow-down')
    expect(container.querySelector('.doc-fade-top')).toBeNull()
    expect(container.querySelector('.doc-fade-bottom')).toBeNull()
    // Mock the root scroller: 2000px of content in the (jsdom-default 768px) viewport,
    // scrolled 100px in → past top AND not at bottom.
    const se = { scrollTop: 100, scrollHeight: 2000 }
    Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => se })
    act(() => {
      fireEvent.scroll(window)
    })
    expect(bar.className).toContain('elev-shadow-down')
    expect(container.querySelector('.doc-fade-top')).not.toBeNull()
    expect(container.querySelector('.doc-fade-bottom')).not.toBeNull()
    // Back at the top → shadow + top strip clear, bottom strip stays.
    se.scrollTop = 0
    act(() => {
      fireEvent.scroll(window)
    })
    expect(bar.className).not.toContain('elev-shadow-down')
    expect(container.querySelector('.doc-fade-top')).toBeNull()
    expect(container.querySelector('.doc-fade-bottom')).not.toBeNull()
    // At the bottom — delivered via the resize listener (the other guide-mode source).
    se.scrollTop = 2000 - window.innerHeight
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(container.querySelector('.doc-fade-top')).not.toBeNull()
    expect(container.querySelector('.doc-fade-bottom')).toBeNull()
  })

  it('drives the scroll state from the container — never the document — in clamped modes', () => {
    const { container } = mountApp()
    const el = scrollContainer(container)
    const bar = container.querySelector('.htp-sticky-bar')
    // Mock container geometry: overflowing content, scrolled 60px in.
    Object.defineProperties(el, {
      scrollHeight: { configurable: true, get: () => 1500 },
      clientHeight: { configurable: true, get: () => 700 },
    })
    el.scrollTop = 60
    act(() => {
      fireEvent.scroll(el)
    })
    expect(bar.className).toContain('elev-shadow-down')
    expect(el.className).toContain('fade-scroll-both')
    // The doc strips are guide-mode-only — never in a clamped mode.
    expect(container.querySelector('.doc-fade-top')).toBeNull()
    expect(container.querySelector('.doc-fade-bottom')).toBeNull()
    // A window scroll must NOT feed the clamped-mode state (nobody listens to it here) —
    // even with a root scroller reporting "at top", the shadow stays.
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ scrollTop: 0, scrollHeight: 0 }),
    })
    act(() => {
      fireEvent.scroll(window)
    })
    expect(bar.className).toContain('elev-shadow-down')
    // The container's own scroll does: back to top → shadow clears, bottom fade remains.
    el.scrollTop = 0
    act(() => {
      fireEvent.scroll(el)
    })
    expect(bar.className).not.toContain('elev-shadow-down')
    expect(el.className).toContain('fade-scroll-bottom')
  })
})
