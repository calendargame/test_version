// tests/accordionMotion.test.js — the pure math behind the HTP accordion motion
// coordinator (Q8, round 7): the distance-scaled duration formula and its clamps, the
// twin-toggle shared clock, the numeric twin of the Material standard easing curve, and
// the scroll-target rules (the open-lands-off-screen rule, the shrinking-max-scroll
// clamp rule, and the null "stay put" cases). GuidePage feeds these functions measured
// DOM geometry; everything HERE is arithmetic, so it runs in Node with no rendering.
// The felt motion itself — panels and scroll riding one clock — is on-device truth.
import { describe, it, expect } from 'vitest'
import {
  ACCORDION_EASE_CSS,
  accordionEase,
  accordionMs,
  accordionScrollTarget,
  accordionToggleMs,
} from '../src/lib/accordionMotion.js'

describe('accordionMs — d(h) = clamp(180ms + 0.14ms/px × h, 240ms, 440ms)', () => {
  it('floors at 240ms for small panels (the raw formula sits below the clamp)', () => {
    expect(accordionMs(0)).toBe(240)
    expect(accordionMs(200)).toBe(240) // raw 208ms
    expect(accordionMs(400)).toBe(240) // raw 236ms
  })
  it('meets the floor exactly where the raw formula reaches 240ms (h = 60/0.14)', () => {
    expect(accordionMs(60 / 0.14)).toBe(240)
  })
  it('scales linearly between the clamps (rounded to whole ms)', () => {
    expect(accordionMs(500)).toBe(250)
    expect(accordionMs(1000)).toBe(320)
    expect(accordionMs(1064)).toBe(329) // the spec's Julian-sized example
    expect(accordionMs(1500)).toBe(390)
  })
  it('caps at 440ms for the giants (h ≥ 260/0.14)', () => {
    expect(accordionMs(260 / 0.14)).toBe(440)
    expect(accordionMs(2000)).toBe(440) // raw 460ms
    expect(accordionMs(5000)).toBe(440)
  })
  it('is monotonically non-decreasing in height', () => {
    let prev = -Infinity
    for (let h = 0; h <= 3000; h += 50) {
      const d = accordionMs(h)
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })
})

describe('accordionToggleMs — the twin-toggle shared clock d(max(hClosing, hOpening))', () => {
  it('takes the larger travel of the two panels, in either order', () => {
    expect(accordionToggleMs(1000, 300)).toBe(accordionMs(1000))
    expect(accordionToggleMs(300, 1000)).toBe(accordionMs(1000))
  })
  it('collapses to the single panel when the other side is 0 (plain open or close)', () => {
    expect(accordionToggleMs(0, 750)).toBe(accordionMs(750))
    expect(accordionToggleMs(750, 0)).toBe(accordionMs(750))
  })
  it('degenerates to the floor when nothing measurably moves', () => {
    expect(accordionToggleMs(0, 0)).toBe(240)
  })
})

describe('accordionEase — the numeric twin of cubic-bezier(.2,0,0,1)', () => {
  // The curve's closed forms for control points P1=(0.2,0), P2=(0,1):
  const bezX = (u) => 0.6 * u - 1.2 * u * u + 1.6 * u * u * u
  const bezY = (u) => 3 * u * u - 2 * u * u * u
  it('publishes the exact CSS string index.css and the chevron must share', () => {
    expect(ACCORDION_EASE_CSS).toBe('cubic-bezier(.2,0,0,1)')
  })
  it('pins the endpoints and clamps beyond them', () => {
    expect(accordionEase(0)).toBe(0)
    expect(accordionEase(1)).toBe(1)
    expect(accordionEase(-0.5)).toBe(0)
    expect(accordionEase(1.5)).toBe(1)
  })
  it('round-trips the closed forms: ease(x(u)) = y(u) across the whole curve', () => {
    for (let u = 0.05; u < 1; u += 0.05) {
      expect(accordionEase(bezX(u))).toBeCloseTo(bezY(u), 4)
    }
  })
  it('is decelerate-dominant: half the distance inside the first fifth of the time', () => {
    // x(0.5) = 0.2 and y(0.5) = 0.5 exactly, so ease(0.2) ≈ 0.5 …
    expect(accordionEase(0.2)).toBeCloseTo(0.5, 4)
    // … and by half time well over 85% of the distance is already covered.
    expect(accordionEase(0.5)).toBeGreaterThan(0.85)
  })
  it('is strictly increasing across (0, 1)', () => {
    let prev = 0
    for (let t = 0.02; t < 1; t += 0.02) {
      const y = accordionEase(t)
      expect(y).toBeGreaterThan(prev)
      prev = y
    }
  })
})

describe('accordionScrollTarget — scenario A (a panel opens)', () => {
  it('compensates when the closing panel above pulls the tapped header past the fold', () => {
    // A tall open panel above collapses (600px) while the tapped one opens (400px): the
    // header would land 500px into the document, 557px above the settled fold line
    // (scrollY 1000 + bar 57) → glide to seat it right below the bar: 500 − 57 = 443.
    expect(
      accordionScrollTarget({
        scrollY: 1000,
        viewportH: 800,
        barH: 57,
        docH: 3000,
        headerDocTop: 1100,
        closingH: 600,
        closingAbove: true,
        openingH: 400,
      }),
    ).toBe(443)
  })
  it('declines when the opened panel start stays on-screen (opening only pushes content down)', () => {
    expect(
      accordionScrollTarget({
        scrollY: 1000,
        viewportH: 800,
        barH: 57,
        docH: 3000,
        headerDocTop: 1100,
        closingH: 0,
        closingAbove: false,
        openingH: 400,
      }),
    ).toBeNull()
  })
  it('uses a STRICT inequality: a header landing exactly at the bar line needs no glide', () => {
    const g = {
      scrollY: 1000,
      viewportH: 800,
      barH: 57,
      docH: 3000,
      closingH: 600,
      closingAbove: true,
      openingH: 400,
    }
    // finalHeaderTop = headerDocTop − 600; the fold line sits at 1000 + 57.
    expect(accordionScrollTarget({ ...g, headerDocTop: 1657 })).toBeNull() // exactly at it
    expect(accordionScrollTarget({ ...g, headerDocTop: 1656 })).toBe(999) // one px above
  })
  it('measures against the SETTLED scroll (clamped into the final range), not the raw scrollY', () => {
    // A net-shrinking switch: scrollY 2500 will clamp to the final max-scroll 1714, so the
    // fold line the header must clear is 1714 + 57 — NOT raw 2500 + 57. The header's final
    // 1300 sits above it → A fires and seats the header under the bar (1300 − 57).
    expect(
      accordionScrollTarget({
        scrollY: 2500,
        viewportH: 800,
        barH: 57,
        docH: 3000,
        headerDocTop: 1900,
        closingH: 600,
        closingAbove: true,
        openingH: 114,
      }),
    ).toBe(1243) // finalDocH 2514 → max 1714; header 1300 < 1714 + 57 → 1300 − 57
  })
  it('floors the target at 0 and returns null when that is already the position', () => {
    // Opening the first section at the very top: the header sits 20px into the document,
    // inside the bar's 57px — the un-floored target would be negative, and the floored
    // one equals the current scroll, so nothing needs to move.
    expect(
      accordionScrollTarget({
        scrollY: 0,
        viewportH: 800,
        barH: 57,
        docH: 1000,
        headerDocTop: 20,
        closingH: 0,
        closingAbove: false,
        openingH: 300,
      }),
    ).toBeNull()
  })
  it('pulls out of a rubber-band overscroll (negative scrollY clamps to 0 in the baseline)', () => {
    expect(
      accordionScrollTarget({
        scrollY: -50,
        viewportH: 800,
        barH: 57,
        docH: 1000,
        headerDocTop: 30,
        closingH: 0,
        closingAbove: false,
        openingH: 300,
      }),
    ).toBe(0)
  })
})

describe('accordionScrollTarget — scenario B (the shrinking max-scroll would clamp)', () => {
  it('glides to the final max-scroll when a close leaves scrollY beyond it (the clamp-fling kill)', () => {
    // Closing a 600px panel from deep scroll: finalDocH 2400 → max-scroll 1600 < 2500.
    expect(
      accordionScrollTarget({
        scrollY: 2500,
        viewportH: 800,
        barH: 57,
        docH: 3000,
        headerDocTop: 1800,
        closingH: 600,
        closingAbove: false,
        openingH: 0,
      }),
    ).toBe(1600)
  })
  it('declines when the close leaves scrollY inside the final range', () => {
    expect(
      accordionScrollTarget({
        scrollY: 500,
        viewportH: 800,
        barH: 57,
        docH: 3000,
        headerDocTop: 1800,
        closingH: 600,
        closingAbove: false,
        openingH: 0,
      }),
    ).toBeNull()
  })
  it('floors at 0 when the close shrinks the document under the viewport', () => {
    expect(
      accordionScrollTarget({
        scrollY: 100,
        viewportH: 900,
        barH: 57,
        docH: 800,
        headerDocTop: 200,
        closingH: 300,
        closingAbove: false,
        openingH: 0,
      }),
    ).toBe(0)
  })
  it('also guards a net-shrinking SWITCH when scenario A declines (closing panel below)', () => {
    // A big panel below the tapped header closes (800px) while a small one opens (100px):
    // the header never moves (closingAbove false, 1900 ≥ 1557), but the doc shrinks past
    // the current position — finalDocH 2300 → max-scroll 1500 < 2000.
    expect(
      accordionScrollTarget({
        scrollY: 2000,
        viewportH: 800,
        barH: 57,
        docH: 3000,
        headerDocTop: 1900,
        closingH: 800,
        closingAbove: false,
        openingH: 100,
      }),
    ).toBe(1500)
  })
})

describe('accordionScrollTarget — the stay-put default', () => {
  it('returns null for a growing document with the header comfortably on-screen', () => {
    expect(
      accordionScrollTarget({
        scrollY: 200,
        viewportH: 800,
        barH: 57,
        docH: 1500,
        headerDocTop: 600,
        closingH: 0,
        closingAbove: false,
        openingH: 400,
      }),
    ).toBeNull()
  })
})
