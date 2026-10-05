// tests/guideDock.test.js — ONE SHADOW, UNDER WHICHEVER EDGE THE TEXT IS SLIDING BENEATH.
//
// lib/guideDock decides, from five numbers read off the screen, how strong the open How-to-Play
// header's shadow is and how much of its own shadow the top bar keeps. It is pure arithmetic, so
// the hand-off can be proved here for EVERY position a scroll passes through — which no browser
// test can do, since a browser only shows the frames it happened to paint.
//
// The geometry below is what a real sticky header does, written out: it rides its section until its
// top reaches the line, sticks there while the section scrolls beneath it, and is carried out under
// the bar when the section's foot reaches its own.
import { describe, it, expect } from 'vitest'
import { dockShades, NO_DOCK, DOCK_SETTLE_PX, DOCK_LINE_BAND_PX } from '../src/lib/guideDock.js'

const RAMP = 24
const LINE = 71.765625 // a real bar's height: fractional
const HEAD_H = 44.5
const BORDER = 1

// The open header's geometry for a section whose wrapper top is at viewport y `wrapperTop` and
// which is `sectionH` tall — exactly what position:sticky; top:<line> produces.
const sticky = (wrapperTop, sectionH) => {
  const naturalTop = wrapperTop + BORDER
  const floorY = wrapperTop + sectionH - BORDER
  const headerTop = Math.min(Math.max(naturalTop, LINE), floorY - HEAD_H)
  return { lineY: LINE, headerTop, headerBottom: headerTop + HEAD_H, naturalTop, floorY }
}

describe('dockShades — the two strengths', () => {
  it('a header far below the line: no header shadow, the bar keeps all of its own', () => {
    expect(dockShades(sticky(LINE + 400, 1500), RAMP)).toEqual({ header: 0, barYield: 1 })
  })

  it('a header docked with nothing under it: neither — a section just opened does not look pinned', () => {
    // The wrapper's border is tucked behind the bar and the header's natural top is ON the line.
    expect(dockShades(sticky(LINE - BORDER, 1500), RAMP)).toEqual({ header: 0, barYield: 0 })
  })

  it('the settle pixel casts nothing: a whole-pixel landing may carry the header a fraction down', () => {
    for (const carried of [0.2, 0.6, DOCK_SETTLE_PX]) {
      const s = dockShades(sticky(LINE - BORDER - carried, 1500), RAMP)
      expect(s).toEqual({ header: 0, barYield: 0 })
    }
  })

  it('docked with text under it: the header’s shadow ramps in over the ramp, the bar keeps none', () => {
    const at = (depth) => dockShades(sticky(LINE - BORDER - depth, 1500), RAMP)
    expect(at(DOCK_SETTLE_PX + (RAMP - DOCK_SETTLE_PX) / 2).header).toBeCloseTo(0.5, 9)
    expect(at(RAMP).header).toBe(1)
    expect(at(700).header).toBe(1)
    for (const depth of [2, 12, 24, 700]) expect(at(depth).barYield).toBe(0)
  })

  it('the last stretch of a section: the header’s shadow fades out as the foot arrives', () => {
    // `room` px of section left below the header.
    const at = (room) => dockShades(sticky(LINE + HEAD_H + room + BORDER - 1500, 1500), RAMP)
    expect(at(200).header).toBe(1)
    expect(at(RAMP / 2).header).toBeCloseTo(0.5, 9)
    expect(at(0)).toEqual({ header: 0, barYield: 0 })
  })

  it('carried out under the bar: the bar’s shadow comes back over the ramp, the header’s stays off', () => {
    const at = (carried) => dockShades(sticky(LINE + HEAD_H + BORDER - 1500 - carried, 1500), RAMP)
    expect(at(DOCK_LINE_BAND_PX)).toEqual({ header: 0, barYield: 0 })
    const half = DOCK_LINE_BAND_PX + (RAMP - DOCK_LINE_BAND_PX) / 2
    expect(at(half).header).toBe(0)
    expect(at(half).barYield).toBeCloseTo(0.5, 9)
    expect(at(RAMP)).toEqual({ header: 0, barYield: 1 })
    expect(at(HEAD_H + 300)).toEqual({ header: 0, barYield: 1 })
  })

  it('a line that cannot be measured leaves the bar alone', () => {
    const g = { ...sticky(LINE + 10, 1500), lineY: NaN }
    expect(dockShades(g, RAMP)).toEqual(NO_DOCK)
  })

  it('NO_DOCK is "no header to consider": the bar is unaffected', () => {
    expect(NO_DOCK).toEqual({ header: 0, barYield: 1 })
  })
})

// ★★ THE HAND-OFF, PROVED FOR EVERY POSITION — the two things the owner must never see.
describe('dockShades — the hand-off across a whole scroll', () => {
  // Scroll a section from well below the line to well past it, a tenth of a pixel at a time, for a
  // short section (shorter than the two ramps), an ordinary one and a very long one. Each case
  // COUNTS the positions that break its rule and asserts once — tens of thousands of positions is
  // the point, and an assertion apiece would spend the run on bookkeeping.
  const STEP = 0.1
  const SECTIONS = [HEAD_H + 2 * BORDER + 20, 400, 6000]
  const sweep = (sectionH, visit) => {
    let positions = 0
    for (let top = LINE + 200; top >= LINE - sectionH - 200; top -= STEP, positions++) {
      const g = sticky(top, sectionH)
      visit(dockShades(g, RAMP), g)
    }
    return positions
  }

  it('NEVER BOTH: the header’s shadow and the bar’s are not on together at any position', () => {
    for (const sectionH of SECTIONS) {
      let both = 0
      let headerSeen = false
      let barSeen = false
      const positions = sweep(sectionH, (s) => {
        if (s.header > 0 && s.barYield > 0) both++
        headerSeen ||= s.header > 0
        barSeen ||= s.barYield > 0
      })
      expect(positions).toBeGreaterThan(3000)
      expect(both).toBe(0)
      expect(headerSeen && barSeen).toBe(true) // the sweep visited both states
    }
  })

  it('NEVER NEITHER WITH TEXT UNDER AN EDGE: off the line the bar is on; on it, the header is on whenever text is under it', () => {
    for (const sectionH of SECTIONS) {
      let barMissing = 0
      let headerMissing = 0
      sweep(sectionH, (s, g) => {
        const offLine = Math.abs(g.headerTop - g.lineY) > DOCK_LINE_BAND_PX
        if (offLine && !(s.barYield > 0)) barMissing++
        const textUnderHeader =
          g.headerTop - g.naturalTop > DOCK_SETTLE_PX && g.floorY - g.headerBottom > 0
        if (textUnderHeader && !(s.header > 0)) headerMissing++
      })
      expect([barMissing, headerMissing]).toEqual([0, 0])
    }
  })

  it('NO JUMPS: neither strength changes by more than the ramp allows between two positions', () => {
    // A tenth of a pixel of scroll can move either strength by at most STEP / (ramp − band); a
    // bigger step is a pop — a shadow snapping on or off mid-scroll.
    const maxStep = STEP / (RAMP - DOCK_SETTLE_PX) + 1e-9
    for (const sectionH of SECTIONS) {
      let prev = null
      let worst = 0
      sweep(sectionH, (s) => {
        if (prev)
          worst = Math.max(
            worst,
            Math.abs(s.header - prev.header),
            Math.abs(s.barYield - prev.barYield),
          )
        prev = s
      })
      expect(worst).toBeLessThanOrEqual(maxStep)
    }
  })

  it('both strengths stay inside 0…1', () => {
    for (const sectionH of SECTIONS) {
      let outside = 0
      sweep(sectionH, (s) => {
        for (const v of [s.header, s.barYield]) if (!(v >= 0 && v <= 1)) outside++
      })
      expect(outside).toBe(0)
    }
  })
})
