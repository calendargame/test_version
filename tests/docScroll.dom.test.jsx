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
// third from the top.
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
