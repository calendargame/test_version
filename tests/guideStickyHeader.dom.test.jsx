// @vitest-environment jsdom
//
// HOW TO PLAY — THE DOCKED SECTION HEADER, AND THE ONE SHADOW.
//
// The open section's header docks flush under the fixed bar while its content scrolls beneath it.
// Three things the owner asked for shape every case here:
//   • ONE DOCKING POSITION. A section you open is brought to rest on the same line its header docks
//     at when you scroll — the bar's underside — not a gap below it.
//   • ONE SHADOW, UNDER WHICHEVER EDGE THE TEXT IS SLIDING BENEATH. While a header is docked the
//     bar's own shadow is off and the header wears it; with no header docked the bar's shadow is
//     its own again. Never both, on any frame.
//   • OPENING A SECTION MUST NOT MAKE IT LOOK PINNED. The header's shadow appears only once text
//     is really under it, and goes again on the way back up. Collapsing from a docked header keeps
//     it where the finger is.
//
// WHAT JSDOM CANNOT DO, stated plainly: it applies no stylesheet and lays nothing out, so the stick
// itself (position:sticky) cannot happen here. The model stands in for what the app reads off the
// screen — the open header's rectangle and its section's — in the three situations a real browser
// produces (below the line, stuck on it, being carried out past it), and asks what the app DOES
// with them. The arithmetic of the hand-off is proved for every position in tests/guideDock; that
// the browser really docks at the bar's underside, and that the two shadows really trade places on
// screen, was measured in Chromium at phone and desktop size. The feel on a real iPhone stays
// on-device truth. The stylesheet half is pinned against index.css at the bottom of this file.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderGuidePage } from './helpers/guideScroller.jsx'
import { installResizeObserver } from './helpers/scrollGeometry.js'

// The bar's underside — the docking line — and a header's height. Both arbitrary; the line is
// fractional because a real bar's height is.
const LINE = 71.75
const HEAD_H = 44

// Where each section's header and wrapper are, by section id: { top, natural, floor } in viewport
// y — the header's top, where its top would be with no stick (the wrapper's top), and the wrapper's
// bottom. A section with no entry reports zero rects, like every other element: a header at its
// natural spot at the very top of the viewport, far from the line. The toggle coordinator therefore
// sees panels with no height and plans no glide of its own — the only scroll writes left are the
// ones this feature makes.
let place = {}
// The three situations a browser produces for an OPEN header:
const below = (id, gap) => {
  // not yet docked — the section is still on its way up the page
  place[id] = { top: LINE + gap, natural: LINE + gap, floor: LINE + gap + 2000 }
}
const stuck = (id, depth, room = 2000) => {
  // docked on the line, `depth` px of the section scrolled up under it, `room` px still below it
  place[id] = { top: LINE, natural: LINE - depth, floor: LINE + HEAD_H + room }
}
const leaving = (id, carried) => {
  // the section's foot has arrived and is carrying the header up under the bar
  place[id] = { top: LINE - carried, natural: LINE - 3000, floor: LINE - carried + HEAD_H }
}

let rectSpy = null
beforeEach(() => {
  place = {}
  rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const rect = (top, bottom) => ({
      height: bottom - top,
      width: 0,
      top,
      left: 0,
      right: 0,
      bottom,
      x: 0,
      y: top,
    })
    const of = (prefix) =>
      this.id?.startsWith(prefix) ? place[this.id.slice(prefix.length)] : null
    const head = of('guide-head-')
    if (head) return rect(head.top, head.top + HEAD_H)
    const sec = of('guide-sec-')
    if (sec) return rect(sec.natural, sec.floor)
    return rect(0, 0)
  })
  // index.css is not loaded, so the ramp distance is stood up at its real value.
  document.documentElement.style.setProperty('--fade-h', '24px')
})
let guide = null
afterEach(() => {
  guide?.restore()
  guide = null
  rectSpy.mockRestore()
  cleanup()
  document.documentElement.style.removeProperty('--fade-h')
})

const mount = () => {
  const view = renderGuidePage()
  guide = view.guide
  guide.setSeat(LINE)
  return view
}
const header = (container, id) => container.querySelector(`#guide-sec-${id} button`)
const shade = (container, id) => header(container, id).style.getPropertyValue('--shade')
// The share of its shadow the guide last told the bar to keep.
const barKeeps = () => guide.barYields.at(-1)
const tap = (container, id) =>
  act(() => {
    fireEvent.click(header(container, id))
  })
// Put the open header somewhere and let the app see it, the way a scroll does.
const scrollSo = (arrange) => {
  arrange()
  guide.scrollTo(guide.pos() + 1)
}

describe('the open section’s header wears a shadow only once text is under it', () => {
  it('opening a section leaves its header shadowless — it docks, it does not look pinned', () => {
    const { container } = mount()
    guide.scrollTo(500)
    stuck('stats', 0) // glided flush onto the line, nothing under it yet
    tap(container, 'stats')
    expect(header(container, 'stats').getAttribute('aria-expanded')).toBe('true')
    expect(shade(container, 'stats')).toBe('0.000')
  })

  it('casts nothing for the fraction of a pixel a whole-pixel landing can carry it', () => {
    const { container } = mount()
    stuck('stats', 0.6)
    tap(container, 'stats')
    expect(shade(container, 'stats')).toBe('0.000')
  })

  it('ramps its shadow in as text scrolls under it, and drops it on the way back', () => {
    const { container } = mount()
    tap(container, 'stats')
    for (const [depth, expected] of [
      [1, '0.000'], // the settle pixel: still nothing under it
      [12.5, '0.500'], // halfway up the 24px ramp, past that pixel
      [24, '1.000'],
      [300, '1.000'], // well past the ramp: clamped, not growing
      [0, '0.000'], // scrolled back to its natural spot: nothing under it again
    ]) {
      scrollSo(() => stuck('stats', depth))
      expect(shade(container, 'stats')).toBe(expected)
    }
  })

  it('fades its shadow out over the section’s last stretch, as the foot arrives', () => {
    const { container } = mount()
    tap(container, 'stats')
    for (const [room, expected] of [
      [200, '1.000'],
      [24, '1.000'],
      [12, '0.500'],
      [0, '0.000'], // nothing of the section left below the header to cast a shadow on
    ]) {
      scrollSo(() => stuck('stats', 900, room))
      expect(shade(container, 'stats')).toBe(expected)
    }
  })

  it('tracks only the OPEN header, and rests one it stops tracking at 0', () => {
    const { container } = mount()
    tap(container, 'stats')
    scrollSo(() => stuck('stats', 30))
    expect(shade(container, 'stats')).toBe('1.000')
    // Every closed header is left alone: it has no room to dock, so nothing is ever written to it
    // and it rests on the stylesheet's --shade:0.
    expect(shade(container, 'overview')).toBe('')
    // Switching sections moves the tracking with it and leaves the old header shadowless.
    tap(container, 'overview')
    expect(shade(container, 'stats')).toBe('0.000')
    expect(shade(container, 'overview')).toBe('0.000')
  })

  it('re-reads on a layout change with no scroll at all — a panel above collapsing, say', () => {
    const ro = installResizeObserver() // BEFORE mount: the tracker builds its observer in an effect
    try {
      const { container } = mount()
      tap(container, 'stats')
      stuck('stats', 12.5)
      act(() => ro.resize(guide.contentEl))
      expect(shade(container, 'stats')).toBe('0.500')
      expect(barKeeps()).toBe(0)
    } finally {
      ro.restore()
    }
  })

  it('is the same button, with the same state and name, docked or not', () => {
    const { container } = mount()
    tap(container, 'stats')
    const before = header(container, 'stats')
    scrollSo(() => stuck('stats', 40))
    const after = header(container, 'stats')
    expect(after).toBe(before)
    expect(after.getAttribute('aria-expanded')).toBe('true')
    expect(after.getAttribute('aria-controls')).toBe('guide-panel-stats')
  })
})

describe('one shadow: the bar gives its own up while a header is docked against it', () => {
  it('with no section open, the bar keeps all of its shadow', () => {
    mount()
    guide.scrollTo(600)
    expect(guide.barYields.every((share) => share === 1)).toBe(true)
  })

  it('an open header far from the line leaves the bar’s shadow alone', () => {
    const { container } = mount()
    below('stats', 300)
    tap(container, 'stats')
    expect(barKeeps()).toBe(1)
    expect(shade(container, 'stats')).toBe('0.000')
  })

  it('the bar’s shadow fades out as the header comes up to dock, and is off once it has', () => {
    const { container } = mount()
    below('stats', 300)
    tap(container, 'stats')
    for (const [gap, keeps] of [
      [24.5, 1], // a ramp's length away (past the half-pixel that counts as ON the line)
      [12.5, 12 / 23.5],
      [0.5, 0],
      [0, 0],
    ]) {
      scrollSo(() => below('stats', gap))
      expect(barKeeps()).toBeCloseTo(keeps, 6)
      expect(shade(container, 'stats')).toBe('0.000') // not docked: the header wears nothing
    }
  })

  it('docked, the bar keeps none — whether or not text is under the header yet', () => {
    const { container } = mount()
    tap(container, 'stats')
    for (const depth of [0, 0.6, 5, 24, 800]) {
      scrollSo(() => stuck('stats', depth))
      expect(barKeeps()).toBe(0)
    }
  })

  it('the bar’s shadow comes back as a finished section carries its header out under the bar', () => {
    const { container } = mount()
    tap(container, 'stats')
    scrollSo(() => stuck('stats', 900, 0))
    expect(barKeeps()).toBe(0)
    for (const [carried, keeps] of [
      [12.5, 12 / 23.5],
      [24.5, 1],
      [44, 1], // the header is wholly behind the bar now
    ]) {
      scrollSo(() => leaving('stats', carried))
      expect(barKeeps()).toBeCloseTo(keeps, 6)
      expect(shade(container, 'stats')).toBe('0.000') // nothing left under it to shade
    }
  })

  it('NEVER BOTH: on no frame of a whole scroll through a section are the two shadows on together', () => {
    const { container } = mount()
    below('stats', 400)
    tap(container, 'stats')
    const frames = [
      ...Array.from({ length: 81 }, (_, i) => () => below('stats', 40 - i * 0.5)), // coming up to dock
      ...Array.from({ length: 80 }, (_, i) => () => stuck('stats', i * 0.75, 600 - i * 0.75)), // reading
      ...Array.from({ length: 81 }, (_, i) => () => stuck('stats', 900, 40 - i * 0.5)), // the last stretch
      ...Array.from({ length: 81 }, (_, i) => () => leaving('stats', i * 0.5)), // carried out
    ]
    let sawHeader = false
    let sawBar = false
    for (const arrange of frames) {
      scrollSo(arrange)
      const headerOn = Number(shade(container, 'stats')) > 0
      const barOn = barKeeps() > 0
      expect(headerOn && barOn).toBe(false)
      sawHeader ||= headerOn
      sawBar ||= barOn
    }
    // …and the sweep really did pass through both states, so the case is not vacuous.
    expect(sawHeader).toBe(true)
    expect(sawBar).toBe(true)
  })

  it('closing the section, or switching to another, hands the bar its whole shadow back', () => {
    const { container } = mount()
    tap(container, 'stats')
    scrollSo(() => stuck('stats', 50))
    expect(barKeeps()).toBe(0)
    place = {} // the collapse puts the header back at its natural spot
    tap(container, 'stats')
    expect(barKeeps()).toBe(1)
  })
})

describe('collapsing from a docked header keeps it under your finger', () => {
  it('steps the page back by exactly the pin depth, before anything else moves it', () => {
    const { container } = mount()
    tap(container, 'stats')
    stuck('stats', 140.5)
    guide.scrollTo(900)
    guide.clearWrites()
    tap(container, 'stats')
    expect(header(container, 'stats').getAttribute('aria-expanded')).toBe('false')
    // The header's natural spot now sits where the docked header was, so the fold happens below it.
    expect(guide.writes).toEqual([900 - 140.5])
  })

  it('moves nothing when the section being closed had nothing scrolled under its header', () => {
    const { container } = mount()
    tap(container, 'stats')
    stuck('stats', 0)
    guide.scrollTo(900)
    guide.clearWrites()
    tap(container, 'stats')
    expect(header(container, 'stats').getAttribute('aria-expanded')).toBe('false')
    expect(guide.writes).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE STYLESHEET HALF — the stick itself, which only a browser can perform.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const cssCode = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

describe('index.css — .guide-head', () => {
  const rule = cssCode.match(/\.guide-head\{([^}]*)\}/)?.[1]

  it('sticks at the scroller’s padding edge — the bar’s underside — not a bar lower', () => {
    expect(rule).toBeDefined()
    expect(rule).toContain('position:sticky')
    expect(rule).toMatch(/(^|;)top:0(;|$)/)
  })

  it('is opaque — the panel’s fill over the page', () => {
    expect(rule).toContain('background:linear-gradient(var(--panel-bg),var(--panel-bg)) var(--bg1)')
  })

  // ★ WHICH HEADER MAY SIT ABOVE WHICH FEATHER. The guide's two edge fades are fixed strips that
  // come after the page in the DOM, so they paint over anything that is not lifted.
  //   • a CLOSED header is page content: under both strips, so its title feathers at the top and
  //     bottom edges like the panel border beside it. (Lifting every header left each title
  //     running full-strength to the edge and stopping dead.)
  //   • the OPEN header is the one that pins, and a pinned header sits inside the top strip — so it
  //     alone is lifted over that one…
  //   • …and nothing is lifted over the BOTTOM strip, where nothing ever pins.
  it('lifts ONLY the open header over the top feather, and nothing over the bottom one', () => {
    expect(rule).not.toContain('z-index')
    const openRule = cssCode.match(/\.guide-head\[aria-expanded="true"\]\{([^}]*)\}/)?.[1]
    expect(openRule).toBe('z-index:1')
    const top = cssCode.match(/\.doc-fade-top\{([^}]*)\}/)?.[1]
    const bottom = cssCode.match(/\.doc-fade-bottom\{([^}]*)\}/)?.[1]
    expect(top).not.toContain('z-index')
    expect(bottom).toContain('z-index:2')
    // …and the header that carries aria-expanded IS the .guide-head element, so the selector lands.
    const { container } = mount()
    for (const head of container.querySelectorAll('.guide-head'))
      expect(head.hasAttribute('aria-expanded')).toBe(true)
  })

  it('rests shadowless — --shade:0 overrides @property’s visible default', () => {
    expect(rule).toContain('--shade:0')
  })

  it('is carried by every header, whose wrapper CLIPS rather than scrolls', () => {
    const { container } = mount()
    const wrappers = [...container.querySelectorAll('[id^="guide-sec-"]')]
    expect(wrappers.length).toBeGreaterThan(10)
    for (const w of wrappers) {
      const classes = w.className.split(' ')
      // overflow-hidden would make the wrapper a scroll container, and the pin would stick to it.
      expect(classes).toContain('overflow-clip')
      expect(classes).not.toContain('overflow-hidden')
      expect(w.querySelector('button').className.split(' ')).toEqual(
        expect.arrayContaining(['guide-head', 'elev-shadow-down']),
      )
    }
  })
})
