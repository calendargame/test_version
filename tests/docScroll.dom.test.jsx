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
//
// Q6 (round 8) added the resume contract. Making the document a real scroller retroactively
// armed a visibilitychange→scrollTo(0,0) listener that had been a harmless no-op since the
// day it was written, so backgrounding the app and returning threw the reader back to the
// top of How to Play. The listener is gone; these tests hold the line from both sides —
// a resume moves NOTHING (guide or clamped, scroll position and open panel alike) while
// pageshow still re-asserts the clamped-layout root invariant on a BFCache restore. The
// reading line the accordion seats panels on (--seat-top) is pinned here too, since it is
// scoped to this same html[data-doc-scroll] rule; Q5 (round 9) re-derived it from the guide's
// panel gap instead of the top feather, and both halves of that derivation are pinned below.
// Q6 (round 9) then extended the resume contract to mode switching — its own describe block,
// third from the top. Round 10 (item B) made this page's three edge indicators — the bar's
// boundary shadow and the two doc-fade strips — PROGRESSIVE, driven by a continuous --shade
// instead of a class toggled by a boolean and cross-faded by a CSS transition; the scroll-sourcing
// tests below now assert that number, and the stylesheet half is pinned near the bottom.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
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

// A backgrounding round trip: jsdom always reports 'visible', so the state is overridden for
// the duration of each event (afterEach deletes the own property, restoring the prototype
// getter). Deliberately WITHOUT a pageshow — foregrounding is not a navigation, and the
// distinction between the two is the whole point of the tests below.
function resumeFromBackground() {
  for (const state of ['hidden', 'visible']) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    act(() => {
      fireEvent(document, new Event('visibilitychange'))
    })
  }
}

describe('document scroll for How-to-Play (data-doc-scroll)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    // Safety: never leak the attribute, a mocked root scroller, a forced visibility state or
    // a stray root scrollTop into the next test.
    document.documentElement.removeAttribute('data-doc-scroll')
    delete document.scrollingElement
    delete document.visibilityState
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

  // Round 10 item B: the bar's shadow and the guide's two soft edges are PROGRESSIVE — one
  // continuous --shade per element instead of a class toggled by a boolean and cross-faded by a
  // CSS transition. jsdom cannot measure paint, but it can prove the whole contract that feeds it:
  // the class is unconditional, both strips are mounted for the whole of guide mode, and the
  // number written on each element tracks the scroll position and stays inside [0, 1].
  const shade = (el) => Number(el.style.getPropertyValue('--shade'))

  it('ramps the bar shadow + doc-fade strips from document.scrollingElement in guide mode', () => {
    // index.css is not loaded here, so the ramp distance the writer reads is stood up by hand at
    // its real value. Without it --fade-h parses to NaN and the ramp degrades to the boolean —
    // which is the documented fallback, and is exactly what the last case below checks.
    document.documentElement.style.setProperty('--fade-h', '24px')
    const { container } = mountApp()
    pressKey('H')
    const bar = container.querySelector('.htp-sticky-bar')
    const top = container.querySelector('.doc-fade-top')
    const bottom = container.querySelector('.doc-fade-bottom')
    // Presence is no longer the signal: both strips exist for the whole of guide mode, and an
    // unreached edge is simply at strength 0. jsdom implements no document.scrollingElement, so
    // this is also the missing-root-scroller path — read as an unscrollable document, which must
    // still WRITE a resting 0 rather than leave the elements at the @property initial value.
    expect(bar.className).toContain('elev-shadow-down') // unconditional
    expect(top).not.toBeNull()
    expect(bottom).not.toBeNull()
    expect([shade(bar), shade(top), shade(bottom)]).toEqual([0, 0, 0])
    // Mock the root scroller: 2000px of content in the (jsdom-default 768px) viewport.
    const se = { scrollTop: 6, scrollHeight: 2000 }
    Object.defineProperty(document, 'scrollingElement', { configurable: true, get: () => se })
    act(() => {
      fireEvent.scroll(window)
    })
    // 6px into a 24px ramp — a quarter strength, and the bar and the top strip are one number.
    expect(shade(bar)).toBe(0.25)
    expect(shade(top)).toBe(0.25)
    expect(shade(bottom)).toBe(1) // 1226px of content still below → pinned at full
    // Past the ramp the value CLAMPS instead of growing.
    se.scrollTop = 1000
    act(() => {
      fireEvent.scroll(window)
    })
    expect([shade(bar), shade(top), shade(bottom)]).toEqual([1, 1, 1])
    // Back at the top → the top pair goes to 0 with no timer to run late; the bottom is unmoved.
    se.scrollTop = 0
    act(() => {
      fireEvent.scroll(window)
    })
    expect([shade(bar), shade(top), shade(bottom)]).toEqual([0, 0, 1])
    // The bottom ramp starts where the 4px dead band ends, so it reaches 0 and the strip switches
    // off at the SAME place the banded atBottom says "arrived" — 12px out is (12−4)/(24−4).
    se.scrollTop = 2000 - window.innerHeight - 12
    act(() => {
      fireEvent(window, new Event('resize')) // the other guide-mode source
    })
    expect(shade(bottom)).toBe(0.4)
    se.scrollTop = 2000 - window.innerHeight - 3 // inside the dead band
    act(() => {
      fireEvent.scroll(window)
    })
    expect(shade(bottom)).toBe(0)
    // …and through all of that, not one class changed. No boolean is left driving any of these
    // three: the two the app still keeps (appScrolledFromTop / appAtBottom) exist for the CLAMPED
    // container's mask classes and provably do nothing on this page — the container is classless
    // in guide mode and the bar's list is a constant.
    expect(bar.className).toBe('htp-sticky-bar elev-shadow-down bg-(--bg1) w-full pt-5  pb-2.5')
    expect([top.className, bottom.className]).toEqual(['doc-fade-top', 'doc-fade-bottom'])
  })

  it('falls back to full strength — never to no shadow — if the ramp distance cannot be read', () => {
    // --fade-h deliberately unset (the afterEach cleared it), so the writer's parseFloat is NaN.
    // The documented degradation is the pre-round-10 behaviour: on the moment the edge is live,
    // at full strength. A shadow that silently vanished would be the unacceptable failure.
    const { container } = mountApp()
    pressKey('H')
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ scrollTop: 6, scrollHeight: 2000 }),
    })
    act(() => {
      fireEvent.scroll(window)
    })
    expect(shade(container.querySelector('.htp-sticky-bar'))).toBe(1)
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
    // A window scroll must NOT feed the clamped-mode state (nobody listens to it here) —
    // even with a root scroller reporting "at top", the shadow stays.
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

describe('resume from background never moves anything (Q6, round 8)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    document.getElementById('root')?.remove()
    document.documentElement.removeAttribute('data-doc-scroll')
    delete document.scrollingElement
    delete document.visibilityState
    document.documentElement.scrollTop = 0
  })

  it('leaves the guide reading position exactly where it was', () => {
    mountApp()
    pressKey('H') // → guide: the document is the scroller here
    document.documentElement.scrollTop = 640 // jsdom persists the raw value
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    resumeFromBackground()
    // Not "scrolled back to 640" — never touched. A single scrollTo would be the bug.
    expect(scrollToSpy).not.toHaveBeenCalled()
    expect(document.documentElement.scrollTop).toBe(640)
    scrollToSpy.mockRestore()
  })

  it("leaves a clamped mode's container scroll exactly where it was", () => {
    const { container } = mountApp() // launch mode: Classic, clamped
    const el = scrollContainer(container)
    el.scrollTop = 77
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    resumeFromBackground()
    expect(scrollToSpy).not.toHaveBeenCalled()
    expect(el.scrollTop).toBe(77)
    scrollToSpy.mockRestore()
  })

  it('leaves an open guide section open', () => {
    const { container } = mountApp()
    pressKey('H')
    const header = container.querySelector('#guide-sec-overview button')
    act(() => {
      fireEvent.click(header)
    })
    expect(header.getAttribute('aria-expanded')).toBe('true')
    resumeFromBackground()
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it("cancels the guide's in-flight scroll glide when the app is backgrounded", () => {
    // The one thing a resume genuinely has to deal with. rAF stops firing while hidden, so a
    // writer caught mid-flight would wake up against a stale clock and fling the page to a
    // target computed for a tap the reader has long since forgotten. rAF is driven BY HAND
    // here so "mid-flight" is an exact moment rather than a timing race — and stubbed only
    // after the app is mounted and in guide mode, so the boot's own frames run for real.
    const { container } = mountApp()
    pressKey('H')
    const frames = []
    vi.stubGlobal('requestAnimationFrame', (cb) => frames.push(cb)) // id = the new length
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      frames[id - 1] = null
    })
    // Scenario B geometry. jsdom implements no document.scrollingElement (the coordinator
    // deliberately no-ops without one), so the root scroller is mocked with a zero-height
    // document: any positive scrollY then sits past the final max-scroll and the
    // coordinator glides back to 0.
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ scrollHeight: 0 }),
    })
    const realScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 500 })
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => {
      fireEvent.click(container.querySelector('#guide-sec-overview button'))
    })
    const step = frames.at(-1)
    expect(step).toBeTypeOf('function') // the writer scheduled its first frame
    act(() => step(0)) // t = 0 → one write, and the next frame is scheduled
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    const pendingId = frames.length
    resumeFromBackground()
    expect(frames[pendingId - 1]).toBeNull() // cancelled on hide …
    expect(frames.length).toBe(pendingId) // … and never re-armed on the way back
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    scrollToSpy.mockRestore()
    Object.defineProperty(window, 'scrollY', realScrollY)
  })

  it('STILL zeroes a bogus root scroll on a BFCache restore (pageshow), unlike a resume', () => {
    // The other half of the contract: pageshow IS a navigation event, and a restore into the
    // clamped layout can hand back a non-zero root scrollTop that would permanently offset
    // the fixed #root. Deleting the resume listener must not cost us this guard.
    const { container } = mountApp() // Classic — clamped
    const el = scrollContainer(container)
    el.scrollTop = 77
    document.documentElement.scrollTop = 310
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => {
      fireEvent(window, new Event('pageshow'))
    })
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    expect(document.documentElement.scrollTop).toBe(0)
    expect(el.scrollTop).toBe(0)
    scrollToSpy.mockRestore()
  })
})

// Q6 (round 9) — the other half of the resume contract, from the owner reversing his own round-8
// spec after living with it: a detour into a game mode has to preserve exactly what backgrounding
// preserves. How to Play was the one conditionally-rendered screen, so leaving it UNMOUNTED the
// component and the open panel went with it, while a mode-change effect zeroed the scrollers.
// It is always-mounted now like the five game modes, and one layout effect owns "where should this
// screen be scrolled" — restore for the guide, top for everything else. What follows pins the
// three cases that must not blur into each other: mode switch RESTORES, a fresh mount does NOT,
// and a hidden guide contributes no box to the screens it is hiding behind.
describe('How to Play survives a mode switch (Q6, round 9)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    document.documentElement.removeAttribute('data-doc-scroll')
    delete document.scrollingElement
    document.documentElement.scrollTop = 0
  })

  // The guide's own root — the element that carries both the display toggle and the margin.
  const guideRoot = (container) =>
    [...container.querySelectorAll('div')].find((d) =>
      d.className.includes('space-y-(--guide-panel-gap)'),
    )
  const headers = (container) => [...container.querySelectorAll('#guide-sec-overview button')]

  it('keeps the open panel through a detour into a game mode', () => {
    const { container } = mountApp()
    pressKey('H')
    const header = container.querySelector('#guide-sec-overview button')
    act(() => {
      fireEvent.click(header)
    })
    expect(header.getAttribute('aria-expanded')).toBe('true')
    pressKey('K') // → Classic: the guide is hidden, NOT unmounted …
    expect(guideRoot(container).style.display).toBe('none')
    expect(container.querySelector('#guide-sec-overview button')).toBe(header) // same node
    pressKey('H') // … so coming back finds the same panel still open
    expect(guideRoot(container).style.display).toBe('block')
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it('re-applies the reading position captured AT THE SWITCH, not one read later', () => {
    // The load-bearing detail of the whole item. A real engine collapses the document the moment
    // React hides the guide and clamps its scroll offset to ~0, so anything that reads the
    // position from an effect gets a zero. jsdom lays nothing out and would hand back the honest
    // 640 either way — so the test forces the point instead: scrollY is moved AFTER the switch,
    // and the restore must still use the value the switch itself captured.
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
    // The LAST write, not merely one of them — the whole item is that no later effect overwrites
    // the restore. `toHaveBeenCalledWith` would still pass if someone re-added a mode-change
    // window.scrollTo(0,0) after this one, which is exactly the effect this round deleted.
    expect(scrollToSpy.mock.calls).toEqual([[0, 640]])
    expect(guideRoot(container).style.display).toBe('block')
    scrollToSpy.mockRestore()
    Object.defineProperty(window, 'scrollY', realScrollY)
  })

  it('gives the game modes no scroll memory — each one opens at its own top', () => {
    const { container } = mountApp() // Classic
    const el = scrollContainer(container)
    el.scrollTop = 77
    pressKey('F') // → Flash: same container, new content, back to the top
    expect(el.scrollTop).toBe(0)
    el.scrollTop = 120
    pressKey('K')
    expect(el.scrollTop).toBe(0)
  })

  it('starts a FRESH mount at the top with every panel closed — nothing is persisted', () => {
    // Requirement C. Nothing here is enforced by a guard: the app never stores which mode you
    // were in (mode useState("classic")), the reading position lives in a ref, and the open panel
    // lives in GuidePage's own useState — so a refresh, a cold start or an update reload gets a
    // new App and all three are simply gone. A second mount is exactly that.
    const first = mountApp()
    pressKey('H')
    act(() => {
      fireEvent.click(first.container.querySelector('#guide-sec-overview button'))
    })
    const realScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 400 })
    pressKey('K') // saves 400 into THIS app instance
    first.unmount()
    document.getElementById('root').remove()
    const { container } = mountApp() // a cold start: new instance, same stubbed scrollY
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    pressKey('H')
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    expect(scrollToSpy).not.toHaveBeenCalledWith(0, 400)
    expect(headers(container).every((h) => h.getAttribute('aria-expanded') === 'false')).toBe(true)
    scrollToSpy.mockRestore()
    Object.defineProperty(window, 'scrollY', realScrollY)
  })

  it('leaves the other screens pixel-identical — the hidden guide generates no box', () => {
    // The trap in always-mounting this one: its mt-2.5 must ride on the SAME element as the
    // display toggle. Hang the toggle one level down and the margin stays in App's flex column on
    // every other screen — 10px of invisible content that lengthens each of them past the
    // viewport, for a phantom bottom fade and a scrollbar on modes that used to fit exactly.
    // display:none generates no box, margins included.
    const { container } = mountApp() // Classic
    const root = guideRoot(container)
    expect(root.className).toContain('mt-2.5')
    expect(root.style.display).toBe('none')
    // …and nothing sits between it and the flex column, which is the only way that holds.
    const column = scrollContainer(container).firstElementChild
    expect(root.parentElement).toBe(column)
    // Every always-mounted screen is either the one on show or display:none — no third state.
    const screens = [...column.children]
    expect(screens.length).toBe(6) // 5 game modes + the guide (Lookup is still conditional)
    expect(screens.filter((c) => c.style.display === 'block')).toHaveLength(1)
    expect(screens.filter((c) => c.style.display === 'none')).toHaveLength(5)
  })
})

// The reading line the accordion coordinator seats a tapped panel on. jsdom applies no
// stylesheets, so index.css itself is the only place these can be asserted.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
  'utf8',
)
const ruleBody = (re) => {
  const m = css.match(re)
  expect(m, `index.css: no rule matched ${re}`).not.toBeNull()
  return m[1]
}
// The DECLARATIONS only. index.css documents itself heavily, and the comments name the very
// things some of these pins ban — the deleted `transition: box-shadow` among them — so a
// must-NOT-appear assertion has to read the code, not the prose that explains it.
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('index.css — the feather token and the derived reading line (--seat-top)', () => {
  it('feathers every scroll edge from the one --fade-h token, with no hardcoded twin', () => {
    // --fade-h is shared with the settings popover, the changelog and the Lookup scrollers,
    // which is why Q5 (round 9) had to move the reading line OFF it rather than retune it.
    const fadeRules = [
      /\.fade-scroll-top\{([^}]*)\}/,
      /\.fade-scroll-bottom\{([^}]*)\}/,
      /\.fade-scroll-both\{([^}]*)\}/,
      /\.doc-fade-top\{([^}]*)\}/,
      /\.doc-fade-bottom\{([^}]*)\}/,
    ]
    for (const re of fadeRules) {
      const body = ruleBody(re)
      expect(body).toContain('var(--fade-h)')
      expect(body).not.toContain('24px')
    }
    // The single home of the value every one of those rules reads.
    expect(css).toContain(':root{--fade-h:24px}')
  })

  it('REGISTERS --seat-top as a <length> so JS reads a resolved px value, not a calc string', () => {
    // Load-bearing, not decorative: unregistered, getComputedStyle hands back the literal
    // "calc(…)" token stream → parseFloat NaN. GuidePage survives that (it re-reads the same
    // declaration through the resolved scroll-padding-top, which every engine gives in absolute
    // px), but this registration is what makes the direct read exact on every engine that has
    // @property — i.e. the owner's — and it is the only reason the reader can trust a number
    // it got from a custom property at all.
    const prop = ruleBody(/@property --seat-top\{([^}]*)\}/)
    expect(prop).toContain('syntax:"<length>"')
    expect(prop).toContain('inherits:true')
    expect(prop).toContain('initial-value:0px')
  })

  it('defines the line as bar + ONE PANEL GAP and hands the same value to the native scrollport', () => {
    // The gap, not the feather (Q5 round 9). The fixed bar hides everything above --bar-h, so
    // seating the tapped panel one panel-gap below it lands the bottom edge of the panel above
    // exactly on the bar's underside — out of frame. bar + --fade-h overshot by 24 − 8.46 =
    // 15.5px and left that much of the previous panel showing, which is the bug this fixes.
    const body = ruleBody(/html\[data-doc-scroll\]\{--seat-top:([^}]*)\}/)
    expect(body).toContain('calc(var(--bar-h) + var(--guide-panel-gap))')
    expect(body).not.toContain('--fade-h')
    expect(body).toContain('scroll-padding-top:var(--seat-top)')
  })

  it('makes the guide’s two soft edges progressive, on the same --shade as the shadow', () => {
    // The strips no longer mount and unmount per edge state — their opacity IS the shade, so
    // "unreached edge" and "invisible strip" are the same fact rather than two that can disagree.
    for (const re of [/\.doc-fade-top\{([^}]*)\}/, /\.doc-fade-bottom\{([^}]*)\}/])
      expect(ruleBody(re)).toContain('opacity:var(--shade,1)')
  })

  it('keeps ONE home for the panel gap — the token the guide lays out with and the seat derives from', () => {
    // The whole point of the token: the gap the reader sees and the gap the scroll math
    // assumes are the same declaration. A literal space-y-2 back on the guide's section list
    // would silently restore the Q5 bug the next time either number moved, so the utility has
    // to read the token, and no hardcoded twin of the value may sit beside it.
    expect(css).toContain(':root{--guide-panel-gap:calc(var(--spacing) * 2)}')
    const guide = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'GuidePage.tsx'),
      'utf8',
    )
    expect(guide).toContain('className="mt-2.5 space-y-(--guide-panel-gap)"')
    expect(guide).not.toContain('space-y-2"')
  })
})

// Round 10 item B — the progressive boundary shadow, pinned where it is provable: in the
// stylesheet. jsdom paints nothing, so the DOM tests above can only show that the right NUMBER
// reaches the right element; what follows is the other half — that the declaration those numbers
// feed is built the way it has to be built to reach a browser at all.
describe('index.css — the progressive boundary shadow (round 10 item B)', () => {
  it('composes the shadow from per-theme channels × alpha × --shade — and never from color-mix()', () => {
    // ⚠ The one that would have shipped a silent, untestable bug. A hand-written color-mix()
    // holding var(--shade) cannot be constant-folded by Lightning CSS (the value is only known at
    // runtime) and gets no automatic @supports fallback, so on an engine without color-mix the
    // WHOLE box-shadow declaration is invalid at parse and every boundary shadow in the app
    // disappears. The channels-and-alpha form is pixel-identical and works back to Safari 12.1.
    for (const [re, offset] of [
      [/\.elev-shadow-down\{([^}]*)\}/, '0 4px 6px -2px'],
      [/\.elev-shadow-up\{([^}]*)\}/, '0 -4px 6px -2px'],
    ]) {
      const body = ruleBody(re)
      expect(body).toBe(
        `box-shadow:${offset} rgb(var(--shadow-elev-c) / calc(var(--shadow-elev-a) * var(--shade,1)))`,
      )
      expect(body).not.toContain('color-mix')
    }
  })

  it('leaves NO box-shadow transition anywhere — the lag this replaced had nowhere else to hide', () => {
    // The owner's symptom was a shadow still fading ~0.15-0.2s after a status-bar tap had stopped
    // the page dead. Progressive strength only removes that if no duration survives beside it, so
    // this bans the property outright rather than checking the one rule that used to carry it.
    expect(cssCode).not.toMatch(/transition[^;}]*box-shadow/)
    expect(cssCode).not.toContain('.htp-sticky-bar,.popover-sticky-footer')
  })

  it('REGISTERS --shade as a non-inherited <number>, defaulting to a VISIBLE shadow', () => {
    // Registration is the safety net: with a syntax, a malformed JS write is rejected and the last
    // good value survives; unregistered it would substitute garbage into the calc() and take the
    // whole shadow with it. initial-value 1 (and the literal `,1)` fallback for engines with no
    // @property, matching the --seat-top ladder) means an unwritten boundary shows its full static
    // shadow — never an invisible one. inherits:false keeps a region's shade off its subtree AND
    // keeps each write from invalidating style for anything but the one element.
    const prop = ruleBody(/@property --shade\{([^}]*)\}/)
    expect(prop).toContain('syntax:"<number>"')
    expect(prop).toContain('inherits:false')
    expect(prop).toContain('initial-value:1')
  })

  it('splits the shadow token per theme, with no survivor of the single rgba it replaced', () => {
    // Verified against the pre-split values: black/50% for the default row (dusk and nebula
    // inherit it — dusk used to re-declare the identical rgba, and that duplicate went with the
    // split), midnight's violet glow on pure black, and the two light rows' dark tints. Alpha 0 is
    // fully transparent whatever the channels hold, so multiplying the alpha behaves in all five.
    for (const pair of [
      '--shadow-elev-c:0 0 0;--shadow-elev-a:.5',
      '--shadow-elev-c:139 92 246;--shadow-elev-a:.18',
      '--shadow-elev-c:46 16 101;--shadow-elev-a:.18',
      '--shadow-elev-c:30 27 75;--shadow-elev-a:.15',
    ])
      expect(cssCode).toContain(pair)
    expect(cssCode.match(/--shadow-elev-c:/g)).toHaveLength(4)
    expect(cssCode.match(/--shadow-elev-a:/g)).toHaveLength(4)
    expect(cssCode).not.toMatch(/--shadow-elev:/) // the un-split token is gone, not shadowed
  })
})

// Round 10 — the sub-pixel measurement fix. offsetHeight is specified to return a ROUNDED
// INTEGER, so a 71.765625px bar wrote --bar-h:72px and everything seated off it sat 0.234px low;
// the guide's panel measures rounded the same way, the opening one twice over (a difference of two
// integers). The fix is rect reads at both sites plus a whole-pixel scroll target.
// ⚠ WHAT JSDOM CAN AND CANNOT PROVE. It runs no layout: every real rect is zeros and every
// offsetHeight is 0, so nothing here measures anything. What these tests DO prove is decisive
// anyway — WHICH API each site reads. Teaching Element.prototype.getBoundingClientRect a
// fractional height makes the two paths give different answers (the old offsetHeight path reads
// jsdom's 0 and is unaffected by the mock), so each assertion below fails on the pre-round-10 code
// for the right reason. The felt result — no hairline of the previous panel under the bar — stays
// on-device truth.
describe('sub-pixel measurement (round 10)', () => {
  let rectSpy = null
  let realScrollY = null
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    rectSpy?.mockRestore()
    rectSpy = null
    if (realScrollY) Object.defineProperty(window, 'scrollY', realScrollY)
    realScrollY = null
    vi.unstubAllGlobals()
    delete document.scrollingElement
    document.documentElement.removeAttribute('data-doc-scroll')
    document.documentElement.style.removeProperty('--bar-h')
    document.documentElement.style.removeProperty('--seat-top')
  })

  // Every element reports height h and top 0 unless `taller` claims it. A plain function so
  // `this` is the measured element.
  const mockRects = (taller) => {
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const height = taller(this)
      return { height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0 }
    })
  }
  // rAF under manual control: ids are 1-based indices into `frames`, so cancelling nulls its slot.
  const manualFrames = () => {
    const frames = []
    vi.stubGlobal('requestAnimationFrame', (cb) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      frames[id - 1] = null
    })
    return frames
  }
  // Run the glide the last click scheduled to completion: first frame is t=0, the next one is
  // handed a timestamp past any duration this app uses, so it lands exactly on the target.
  const glideEnd = (frames, scrollToSpy) => {
    act(() => frames.at(-1)(0))
    act(() => frames.at(-1)(10000))
    return scrollToSpy.mock.calls.at(-1)[1]
  }

  it('writes --bar-h from the bar’s fractional rect, not a rounded offsetHeight', () => {
    // The owner's real bar: 71.765625px, which offsetHeight reports as 72. The 0.234px that
    // rounding invented is the whole bug — .doc-fade-top starts at top:var(--bar-h), so the top
    // feather began a quarter-pixel BELOW the bar's underside and left a band painted by neither.
    mockRects(() => 71.765625)
    mountApp()
    expect(document.documentElement.style.getPropertyValue('--bar-h')).toBe('71.765625px')
  })

  it('lands the accordion glide on a WHOLE pixel (the ceil), from a fractional seat', () => {
    // Fractional in, integer out. The seat is the owner's real one (57 + 8.46 at his 16.92px
    // fluid root) and the opening panel is 400.4px tall, so the raw target is 434.54 — the
    // fraction the engine used to be free to round either way. Integers are the one offset every
    // quantisation grid can represent exactly, and CEIL is the safe direction: overshooting hides
    // a fraction more of a panel nobody is reading, undershooting shows the hairline.
    const { container } = mountApp()
    pressKey('H')
    document.documentElement.style.setProperty('--seat-top', '65.46px')
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ scrollHeight: 3000 }),
    })
    realScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 500 })
    // Only the opening panel BODY is tall: its .expander wrapper measures 0, so the opening
    // travel is the body's own 400.4 (the difference of two rect reads, the pair that used to be
    // a difference of two independently rounded integers).
    mockRects((el) => (el.id === 'guide-panel-overview' ? 400.4 : 0))
    const frames = manualFrames()
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => {
      fireEvent.click(container.querySelector('#guide-sec-overview button'))
    })
    // headerDocTop 0 + 500, seat 65.46 → 434.54 → 435. The document is 3400.4 tall against a
    // 768px viewport, so the max-scroll clamp is nowhere near this.
    expect(glideEnd(frames, scrollToSpy)).toBe(435)
    scrollToSpy.mockRestore()
  })

  it('measures the CLOSING panel by rect too, and leaves the max-scroll target un-ceiled', () => {
    // Two claims, one fixture, because they share it. The closing expander is the only tall
    // element (600.5px), so a switch that opens nothing measurable is pure scenario B: the
    // document shrinks past the current scroll and the writer glides to the final max-scroll.
    // That target is finalDocH − viewportH, so it carries the closing panel's fraction straight
    // through — proving the rect read (offsetHeight would make closingH 0 and the document never
    // shrink) AND that B is deliberately NOT ceiled (ceiling it would aim past the document's own
    // end, where the browser's clamp eats the last frames and the glide reads as stalling).
    const { container } = mountApp()
    pressKey('H')
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ scrollHeight: 3000 }),
    })
    realScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 2500 })
    mockRects((el) => (el.classList.contains('expander') ? 600.5 : 0))
    const frames = manualFrames()
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => {
      fireEvent.click(container.querySelector('#guide-sec-overview button'))
    })
    act(() => {
      fireEvent.click(container.querySelector('#guide-sec-buttons button'))
    })
    expect(glideEnd(frames, scrollToSpy)).toBe(3000 - 600.5 - window.innerHeight)
    scrollToSpy.mockRestore()
  })
})
