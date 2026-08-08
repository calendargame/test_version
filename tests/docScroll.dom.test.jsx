// @vitest-environment jsdom
//
// THE DOCUMENT-SCROLL MECHANISM — the complete inventory of what currently ties How to Play to the
// DOCUMENT as its scroller, and nothing else.
//
// In guide mode ONLY, App stamps data-doc-scroll on <html>; index.css releases the three scroll
// clamps (html/body overflow:hidden + the fixed 100dvh #root) so the document becomes the scroller.
// The reason it exists is iOS's tap-the-status-bar-to-scroll-to-top: it targets the ROOT scroller
// exclusively, an inner overflow div can never receive it, and no JS event exists to intercept the
// tap — so on the app's one true reading page the affordance is bought by giving up the locked
// fit-to-screen architecture every other screen keeps.
//
// ★ WHY THIS FILE IS SEPARATE, and what to do with it. Every assertion here names the mechanism —
// the attribute, window.scrollY, window scroll/resize events, the fixed .doc-fade strips, the
// html[data-doc-scroll] rules. When the guide moves onto an inner overflow scroller like every
// other screen, ALL of it is replaced, and this file is the checklist of what has to be replaced
// WITH something. It is expected to be rewritten or deleted by that change.
//
// ★ THE BEHAVIOUR the mechanism exists to deliver is pinned in tests/guideScroll.dom, through an
// abstraction that resolves whichever scroller is live — the reading position surviving a mode
// switch and a resume, the accordion seating a tapped panel, the progressive edges. That file must
// pass UNCHANGED across the move, and its passing is the move's proof. Nothing from it is repeated
// here; nothing here is a substitute for it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { installGuideScroller } from './helpers/guideScroller.js'

// CustomSelect portals into #root, so the harness must provide one (see app-mount.dom).
function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

// H toggles to/from the guide, K jumps to Classic.
const pressKey = (key) =>
  act(() => {
    fireEvent.keyDown(window, { key })
  })

// The app scroll container is the div carrying the inline paddingTop:var(--bar-h) — the one style
// BOTH branches keep (it is deliberately classless in guide mode, so the class list cannot
// identify it there).
const scrollContainer = (container) =>
  [...container.querySelectorAll('div')].find((d) => d.style.paddingTop === 'var(--bar-h)')

const shade = (el) => Number(el.style.getPropertyValue('--shade'))

describe('the guide scrolls the DOCUMENT (data-doc-scroll)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    // Safety: never leak the attribute, a mocked root scroller or a stray root scrollTop into the
    // next test.
    document.documentElement.removeAttribute('data-doc-scroll')
    delete document.scrollingElement
    document.documentElement.scrollTop = 0
    document.documentElement.style.removeProperty('--fade-h')
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

  it('is what the behaviour net resolves to today — the document, not an overflow box', () => {
    // The bridge between the two files, stated once. tests/helpers/guideScroller picks its backing
    // by looking for a real scroll ancestor of the guide's content and falling back to the
    // document; this asserts which side of that fork the app is currently on, so the day the
    // answer changes it changes HERE and the behaviour net simply keeps passing.
    const { container } = mountApp()
    pressKey('H')
    const g = installGuideScroller(container)
    expect(g.kind).toBe('document')
    g.restore()
  })

  it('zeroes the window scroll BEFORE re-clamping on leave, and resets the container', () => {
    const { container } = mountApp()
    pressKey('H')
    const el = scrollContainer(container)
    el.scrollTop = 77 // jsdom persists the raw value — stands in for a scrolled container
    // The first scrollTo(0,0) must arrive while the document is still unclamped (attribute still
    // present): a scroll reset AFTER the re-clamp would leave the layout permanently offset.
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

  it('takes the reading position from window.scrollY AT the switch, not from a later effect', () => {
    // The load-bearing detail of the whole feature, and the one that can only be stated in terms of
    // the mechanism. A real engine collapses the document the moment React hides the guide and
    // clamps its offset to ~0, so anything that reads the position from an effect gets a zero;
    // jsdom lays nothing out and would hand back the honest 640 either way, so the test forces the
    // point instead — scrollY is moved AFTER the switch, and the restore must still use the value
    // the switch itself captured.
    const { container } = mountApp()
    pressKey('H')
    const realScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 640 })
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    pressKey('K') // leave: zero the document while it is still unclamped
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 12345 })
    scrollToSpy.mockClear()
    pressKey('H') // return
    // The LAST write, not merely one of them — the point is that no later effect overwrites the
    // restore. `toHaveBeenCalledWith` would still pass if someone re-added a mode-change
    // window.scrollTo(0,0) after this one.
    expect(scrollToSpy.mock.calls).toEqual([[0, 640]])
    expect(container.querySelector('#guide-sec-overview button')).not.toBeNull()
    scrollToSpy.mockRestore()
    Object.defineProperty(window, 'scrollY', realScrollY)
  })

  it('sources the edge indicators from window scroll AND resize, off document.scrollingElement', () => {
    // Two claims the behaviour net cannot make, because both are about the mechanism: the second
    // window event is a source in its own right, and the top strip is handed the SAME number as the
    // bar's shadow — one edge, two surfaces, so they can never disagree. The ramp's arithmetic is
    // the net's, not this file's.
    document.documentElement.style.setProperty('--fade-h', '24px')
    const { container } = mountApp()
    pressKey('H')
    const bar = container.querySelector('.htp-sticky-bar')
    const top = container.querySelector('.doc-fade-top')
    const se = { scrollTop: 6, scrollHeight: 2000 }
    Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => se })
    act(() => {
      fireEvent.scroll(window)
    })
    const scrolled = shade(bar)
    expect(scrolled).toBeGreaterThan(0)
    expect(shade(top)).toBe(scrolled)
    se.scrollTop = 12
    act(() => {
      fireEvent(window, new Event('resize')) // the other guide-mode source, on its own
    })
    expect(shade(bar)).not.toBe(scrolled)
    expect(shade(top)).toBe(shade(bar))
  })

  it('drives the scroll state from the container — never the document — in clamped modes', () => {
    document.documentElement.style.setProperty('--fade-h', '24px')
    const { container } = mountApp()
    const el = scrollContainer(container)
    const bar = container.querySelector('.htp-sticky-bar')
    // Mock container geometry: overflowing content, scrolled 12px in — half the ramp.
    Object.defineProperties(el, {
      scrollHeight: { configurable: true, get: () => 1500 },
      clientHeight: { configurable: true, get: () => 700 },
    })
    el.scrollTop = 12
    act(() => {
      fireEvent.scroll(el)
    })
    expect(shade(bar)).toBe(0.5)
    // The container's own mask fades stay BOOLEAN state classes — deliberately, and this is the
    // pairing that proves it: half a shadow, a whole fade-scroll-top.
    expect(el.className).toContain('fade-scroll-both')
    // The doc strips are guide-mode-only — never in a clamped mode.
    expect(container.querySelector('.doc-fade-top')).toBeNull()
    expect(container.querySelector('.doc-fade-bottom')).toBeNull()
    // A window scroll must NOT feed the clamped-mode state (nobody listens to it here) — even with
    // a root scroller reporting "at top", the shadow stays.
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ scrollTop: 0, scrollHeight: 0 }),
    })
    act(() => {
      fireEvent.scroll(window)
    })
    expect(shade(bar)).toBe(0.5)
    // The container's own scroll does: back to top → shadow clears, bottom fade remains.
    el.scrollTop = 0
    act(() => {
      fireEvent.scroll(el)
    })
    expect(shade(bar)).toBe(0)
    expect(el.className).toContain('fade-scroll-bottom')
  })
})

// The stylesheet half of the same mechanism: every rule scoped to html[data-doc-scroll], and the
// two fixed strips that exist only because the document is what scrolls.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
  'utf8',
)
const ruleBody = (re) => {
  const m = css.match(re)
  expect(m, `index.css: no rule matched ${re}`).not.toBeNull()
  return m[1]
}

describe('index.css — the rules scoped to the document scroller', () => {
  it('defines the reading line as bar + ONE PANEL GAP, and hands it to the native scrollport', () => {
    // The gap, not the feather (Q5 round 9). The fixed bar hides everything above --bar-h, so
    // seating the tapped panel one panel-gap below it lands the bottom edge of the panel above
    // exactly on the bar's underside — out of frame. bar + --fade-h overshot by 24 − 8.46 = 15.5px
    // and left that much of the previous panel showing, which is the bug this fixes.
    const body = ruleBody(/html\[data-doc-scroll\]\{--seat-top:([^}]*)\}/)
    expect(body).toContain('calc(var(--bar-h) + var(--guide-panel-gap))')
    expect(body).not.toContain('--fade-h')
    expect(body).toContain('scroll-padding-top:var(--seat-top)')
  })

  it('kills overflow-anchor across the guide, so no engine anchors against the coordinator', () => {
    // Paired with the scroll writer: the coordinator computes where the page must land from
    // pre-animation geometry, and scroll anchoring would move the page underneath it while the
    // panels grow. It is scoped to the document-scroll mode because that is the only place the
    // coordinator runs.
    expect(css).toContain('html[data-doc-scroll] *{overflow-anchor:none}')
  })

  it('feathers the guide’s two fixed strips from the same --fade-h token, with no hardcoded twin', () => {
    for (const re of [/\.doc-fade-top\{([^}]*)\}/, /\.doc-fade-bottom\{([^}]*)\}/]) {
      const body = ruleBody(re)
      expect(body).toContain('var(--fade-h)')
      expect(body).not.toContain('24px')
    }
  })

  it('makes those strips progressive, on the same --shade as the bar’s shadow', () => {
    // Their opacity IS the shade, so "unreached edge" and "invisible strip" are the same fact
    // rather than two that can disagree — which is why they mount for the whole of guide mode
    // instead of appearing and disappearing per edge state.
    for (const re of [/\.doc-fade-top\{([^}]*)\}/, /\.doc-fade-bottom\{([^}]*)\}/])
      expect(ruleBody(re)).toContain('opacity:var(--shade,1)')
  })
})
