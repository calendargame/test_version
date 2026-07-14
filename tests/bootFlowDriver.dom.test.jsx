// @vitest-environment jsdom
//
// BootOverlay's rAF trace driver (the iOS render fix) — jsdom pins for the driver's contract:
// it writes a TWO-value dasharray (even-count dodges WebKit bug 249307), emits only
// NON-NEGATIVE dashoffsets, falls back to the constant length when getTotalLength is missing
// (jsdom), and cancels its rAF loop on unmount. The real render is Safari-only-provable
// (standing lesson) — the on-device staging pass is the visual proof.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { BootOverlay } from '../src/main.jsx'
import { BOOT_FLOW_FALLBACK_LEN } from '../src/lib/bootFlow.js'

let rafCbs
let nextRafId
let cancelled

beforeEach(() => {
  rafCbs = new Map()
  nextRafId = 1
  cancelled = []
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = nextRafId++
    rafCbs.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    cancelled.push(id)
    rafCbs.delete(id)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const flowPath = () => document.querySelector('.boot-flow')

describe('BootOverlay trace driver', () => {
  it('writes a two-value dasharray (fallback length) and a non-negative px dashoffset per frame', () => {
    render(<BootOverlay updating />)
    const p = flowPath()
    expect(p).not.toBeNull()
    // jsdom SVGPathElement has no getTotalLength → the driver must fall back, not throw
    const L = BOOT_FLOW_FALLBACK_LEN
    expect(p.style.strokeDasharray).toBe(`${L} ${L}`)
    // drive two frames; every emitted offset is a non-negative px value
    const t0 = performance.now()
    for (const dt of [16, 700]) {
      const cbs = [...rafCbs.values()]
      rafCbs.clear()
      cbs.forEach((cb) => cb(t0 + dt))
      const off = p.style.strokeDashoffset
      expect(off).toMatch(/px$/)
      expect(parseFloat(off)).toBeGreaterThanOrEqual(0)
      expect(parseFloat(off)).toBeLessThan(2 * L)
    }
    // the loop keeps rescheduling itself
    expect(rafCbs.size).toBeGreaterThan(0)
  })

  it('cancels the rAF loop on unmount', () => {
    const { unmount } = render(<BootOverlay updating />)
    expect(rafCbs.size).toBeGreaterThan(0)
    unmount()
    expect(cancelled.length).toBeGreaterThan(0)
    expect(rafCbs.size).toBe(0)
  })
})
