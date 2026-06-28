// pointerGestures.resolveRelease (Q4) — the pure decision behind press-drag-release input. Given where
// the press started, the <button> under the release point, and the selection group it began in, decide
// whether to suppress the start button's native click and which button to activate. The live wiring
// (real pointer events + elementFromPoint) is verified on-device — jsdom has no layout engine.
import { describe, it, expect } from 'vitest'
import { resolveRelease } from '../src/lib/pointerGestures.js'

const el = () => ({}) // identity-only stand-in for a DOM element
const groupContaining = (...members) => ({ contains: (n) => members.includes(n) })

describe('pointerGestures.resolveRelease — slide-off-to-cancel (no group)', () => {
  it('release ON the same button → activate (no suppress)', () => {
    const a = el()
    expect(resolveRelease(a, a, null)).toEqual({ suppressStart: false, activate: null })
  })
  it("release OFF onto a different button → suppress, NO cross-activation (the gesture is the first button's)", () => {
    const a = el()
    expect(resolveRelease(a, el(), null)).toEqual({ suppressStart: true, activate: null })
  })
  it('release on nothing → suppress (cancel)', () => {
    expect(resolveRelease(el(), null, null)).toEqual({ suppressStart: true, activate: null })
  })
})

describe('pointerGestures.resolveRelease — drag-to-select (answer-grid group)', () => {
  it('release on the SAME option → native click activates it (no suppress)', () => {
    const a = el()
    expect(resolveRelease(a, a, groupContaining(a))).toEqual({
      suppressStart: false,
      activate: null,
    })
  })
  it('drag to ANOTHER option in the grid → suppress start + activate the release option', () => {
    const a = el()
    const b = el()
    expect(resolveRelease(a, b, groupContaining(a, b))).toEqual({
      suppressStart: true,
      activate: b,
    })
  })
  it('release OFF the grid → suppress (cancel), activate nothing', () => {
    const a = el()
    expect(resolveRelease(a, el(), groupContaining(a))).toEqual({
      suppressStart: true,
      activate: null,
    })
  })
  it('release on nothing → suppress (cancel)', () => {
    const a = el()
    expect(resolveRelease(a, null, groupContaining(a))).toEqual({
      suppressStart: true,
      activate: null,
    })
  })
})
