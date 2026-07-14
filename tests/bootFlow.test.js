// bootFlow — the pure phase math behind the Updating screen's rAF-driven trace loop.
// Pins the iOS render fix's load-bearing properties: NON-NEGATIVE offsets only (shipping iOS
// mis-paints negative dashoffsets over an odd-count dasharray, WebKit bug 249307), the exact
// reproduction of the original keyframes' two eased halves, and seamless period wrap.
import { describe, it, expect } from 'vitest'
import {
  bootFlowOffset,
  cssEaseOut,
  cssEaseIn,
  BOOT_FLOW_CYCLE_MS,
  BOOT_FLOW_FALLBACK_LEN,
} from '../src/lib/bootFlow.js'

const L = BOOT_FLOW_FALLBACK_LEN

describe('bootFlow — easing', () => {
  it('endpoints are exact and both curves are monotonic', () => {
    expect(cssEaseOut(0)).toBe(0)
    expect(cssEaseOut(1)).toBe(1)
    expect(cssEaseIn(0)).toBe(0)
    expect(cssEaseIn(1)).toBe(1)
    let prevOut = -1
    let prevIn = -1
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const o = cssEaseOut(u)
      const i = cssEaseIn(u)
      expect(o).toBeGreaterThanOrEqual(prevOut)
      expect(i).toBeGreaterThanOrEqual(prevIn)
      prevOut = o
      prevIn = i
    }
  })

  it('ease-out runs ahead of linear, ease-in behind (the CSS curves), and they mirror', () => {
    for (let u = 0.05; u < 1; u += 0.05) {
      expect(cssEaseOut(u)).toBeGreaterThan(u - 1e-9)
      expect(cssEaseIn(u)).toBeLessThan(u + 1e-9)
      // cubic-bezier(0.42,0,1,1) is the point-mirror of cubic-bezier(0,0,0.58,1)
      expect(cssEaseIn(u)).toBeCloseTo(1 - cssEaseOut(1 - u), 4)
    }
  })
})

describe('bootFlow — bootFlowOffset', () => {
  it('starts fully drawn (offset 0) and reaches exactly L (fully erased) at the half-cycle', () => {
    expect(bootFlowOffset(0, L)).toBe(0)
    expect(bootFlowOffset(BOOT_FLOW_CYCLE_MS / 2, L)).toBeCloseTo(L, 6)
  })

  it('never emits a negative offset and stays inside [0, 2L) at every sampled instant', () => {
    for (let t = 0; t <= BOOT_FLOW_CYCLE_MS * 2; t += 13) {
      const o = bootFlowOffset(t, L)
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThan(2 * L)
    }
  })

  it('descends monotonically 2L→L (erase) then L→0 (redraw) — the phase bands that erode/regrow from position 2', () => {
    // Render math: with dasharray [L,L], offset o = 2L−L·e shows the arc [L·e … L] (the line
    // eroding from the position-2 end), and o = L−L·i shows [0 … L·i] (regrowing from it). So
    // after the fully-drawn instant (o=0 ≡ 2L), the offset lives in (L,2L] during the erase and
    // [0,L] during the redraw, descending throughout — the 0→2L step at t=0+ is render-identical
    // (2L is one full pattern period), not a visual jump.
    expect(bootFlowOffset(1, L)).toBeGreaterThan(L) // erase operates in the upper band
    let prev = Infinity
    for (let t = 1; t < BOOT_FLOW_CYCLE_MS; t += 10) {
      const o = bootFlowOffset(t, L)
      expect(o).toBeLessThanOrEqual(prev + 1e-9)
      prev = o
    }
    // band split: erase half stays ≥ L, redraw half stays ≤ L
    expect(bootFlowOffset(BOOT_FLOW_CYCLE_MS / 4, L)).toBeGreaterThanOrEqual(L)
    expect(bootFlowOffset((3 * BOOT_FLOW_CYCLE_MS) / 4, L)).toBeLessThanOrEqual(L)
  })

  it('is periodic and wraps seamlessly at the cycle boundary (no jump at the fully-drawn moment)', () => {
    for (let t = 0; t < BOOT_FLOW_CYCLE_MS; t += 130) {
      expect(bootFlowOffset(t + BOOT_FLOW_CYCLE_MS, L)).toBeCloseTo(bootFlowOffset(t, L), 6)
    }
    // approaching the wrap the offset returns smoothly toward 0 (≡ fully drawn), matching t=0
    expect(bootFlowOffset(BOOT_FLOW_CYCLE_MS - 0.5, L)).toBeLessThan(1)
    // negative elapsed (clock skew) is normalized, not NaN/negative
    expect(bootFlowOffset(-100, L)).toBeGreaterThanOrEqual(0)
  })

  it('scales with the supplied length — the true measured L drives the phases, not the old 174', () => {
    const measured = 200
    expect(bootFlowOffset(BOOT_FLOW_CYCLE_MS / 2, measured)).toBeCloseTo(measured, 6)
  })
})
