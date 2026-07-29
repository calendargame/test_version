// @vitest-environment jsdom
//
// The Lookup history list on the shared scroll-region recipe (round-7 Q5). The recipe itself —
// the tokens, the fade truth table, and the no-raw-literals rule — is pinned in
// scrollRegionGuard.test.js; the changelog popup's adoption (structure + live fades) is pinned
// in changelog.dom; the settings popover was already the reference. What's left is Lookup's
// GEOMETRY: the history panel owns py-4 only while every child carries its own px-4, so the
// list's 1rem right padding sits INSIDE the scroller (the text-free lane the iOS scrollbar
// paints in) and the header/method dividers cut edge-to-edge without the pre-Q5 -mx-4
// counter-margins. Content widths are unchanged by construction — only the paint lane moved.
// Q2 (round-8) then took the list's fixed pixel cap away and let the column measure itself, so
// the shrink chain is pinned here too. Also here, because this is the file that renders
// LookupCard directly: the Q7 round-7 interactive-border pin for the typed date box (the
// describe at the bottom).
// Round 10 (item B) added the third piece: the boundary SHADOWS around this list — the History
// header above it and the Show Codes section below — are progressive, driven by a continuous
// --shade the same hook writes, so nothing about them is a class toggle any more. The arithmetic
// behind that shade is pinned first, as pure functions, because it is the piece that had to have
// exactly one owner: the shadow's strength and the mask's on/off are two readings of one
// measurement, and this file proves they cannot disagree.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import LookupCard from '../src/components/LookupCard.jsx'
import {
  SCROLL_REGION_CLASS,
  BOTTOM_EDGE_BAND_PX,
  scrollEdgeGaps,
  isAtBottom,
  isScrolledFromTop,
  edgeShade,
} from '../src/components/scrollRegion.js'

// The saved entry shape (store/progress): the date the user typed and nothing else — every
// rendered string is derived from it (round-8 Q2).
const entry = (i) => ({ id: `e${i}`, y: 1592, m: 3, d: i + 1 })

describe('Lookup history on the shared scroll-region recipe (round-7 Q5)', () => {
  afterEach(cleanup)

  it('the list wears the shared token; the panel owns vertical padding only', () => {
    const { container } = render(
      <LookupCard history={Array.from({ length: 12 }, (_, i) => entry(i))} />,
    )
    const list = container.querySelector('ul')
    expect(list.className).toContain(SCROLL_REGION_CLASS) // the px-4 lane lives INSIDE the scroller
    const panel = list.parentElement
    expect(panel.className).toContain('py-4')
    expect(panel.className.split(/\s+/)).not.toContain('p-4') // vertical-only — the lane moved inward
  })

  // Round-8 Q2 replaced the list's fixed 440-pixel cap with measured layout: the list takes the
  // room the header and method section leave and scrolls past that, at any screen height. The
  // shrink chain is what makes that work, and every link is a class — jsdom lays nothing out, so
  // the classes are the contract. (tests/heightGuard.test.js bans the pixel cap coming back.)
  it('the column can shrink end to end: list gives, header and method section hold', () => {
    const { container } = render(<LookupCard history={[entry(0)]} />)
    const list = container.querySelector('ul')
    expect(list.className).toContain('flex-auto') // takes what's left
    expect(list.className).toContain('min-h-0') // …and is allowed to give it back
    const panel = list.parentElement
    expect(panel.className).toContain('flex flex-col')
    expect(panel.className).toContain('min-h-0') // the panel shrinks; it does NOT grow
    expect(panel.className.split(/\s+/)).not.toContain('flex-auto')
    for (const sel of ['.lookup-history-header', '.lookup-method-section'])
      expect(container.querySelector(sel).className).toContain('shrink-0')
    const root = panel.parentElement
    expect(root.className).toContain('flex flex-col')
    expect(root.className).toContain('min-h-0')
    expect(root.className.split(/\s+/)).not.toContain('mt-1') // would no longer margin-collapse
  })

  it('header and method section carry their own px-4 — full-width dividers with no -mx-4 counter-margins', () => {
    const { container } = render(<LookupCard history={[entry(0)]} />)
    for (const sel of ['.lookup-history-header', '.lookup-method-section']) {
      const el = container.querySelector(sel)
      expect(el.className).toContain('px-4')
      expect(el.className).not.toContain('-mx-4')
    }
  })

  it('the empty state keeps the lane padding too', () => {
    render(<LookupCard history={[]} />)
    expect(screen.getByText('No lookups yet').className).toContain('px-4')
  })
})

describe('the edge arithmetic — ONE owner for both indicator languages (round 10 item B)', () => {
  const RAMP = 24 // --fade-h, the app's one "you are near a boundary" distance

  it('collapses both gaps when there is nothing to scroll, with a 1px slack for fractional layout', () => {
    // A region that fits exactly has no edges to signal. Without the slack, a fractional content
    // height against a fractional box height reports a sliver of overflow and paints indicators
    // forever — which for a progressive shadow would mean a permanent faint one.
    expect(scrollEdgeGaps(0, 300, 300)).toEqual({ top: 0, bottom: 0 })
    expect(scrollEdgeGaps(0, 300.6, 300)).toEqual({ top: 0, bottom: 0 })
    expect(scrollEdgeGaps(0, 302, 300)).toEqual({ top: 0, bottom: 2 })
  })

  it('reads iOS rubber-band overscroll as "at the edge" rather than going negative', () => {
    // Bounce hands back a negative scrollTop at the top and a negative remainder at the bottom.
    // Clamped at 0, so the shade sits at rest through the bounce instead of inverting.
    expect(scrollEdgeGaps(-40, 900, 300)).toEqual({ top: 0, bottom: 640 })
    expect(scrollEdgeGaps(660, 900, 300)).toEqual({ top: 660, bottom: 0 })
  })

  it('gives the shadow and the mask ONE answer at the bottom: the dead band ends both', () => {
    // The reviewer's catch, and the reason this is a shared function rather than two expressions.
    // A popover that overflows by 3px is shadowless today because of the band; a progressive rule
    // that measured the bottom independently would have given it a permanent ~12% footer shadow
    // while the bottom MASK — still banded — stayed off. One boundary, two disagreeing answers.
    const almost = scrollEdgeGaps(0, 303, 300) // 3px of overflow, inside the band
    expect(almost.bottom).toBe(3)
    expect(isAtBottom(almost)).toBe(true)
    expect(edgeShade(almost.bottom, BOTTOM_EDGE_BAND_PX, RAMP)).toBe(0)
    // And they turn on together, continuously: at the band edge the ramp is still 0, so there is
    // no step where the mask is off and the shadow has already jumped to a visible value.
    expect(edgeShade(BOTTOM_EDGE_BAND_PX, BOTTOM_EDGE_BAND_PX, RAMP)).toBe(0)
    expect(edgeShade(BOTTOM_EDGE_BAND_PX + 0.0001, BOTTOM_EDGE_BAND_PX, RAMP)).toBeCloseTo(0, 4)
  })

  it('needs no band at the TOP — scrollTop 0 is exact, not a difference of two measurements', () => {
    const gaps = scrollEdgeGaps(0.5, 900, 300)
    expect(isScrolledFromTop(gaps)).toBe(true)
    expect(edgeShade(gaps.top, 0, RAMP)).toBeCloseTo(0.5 / RAMP, 6)
  })

  it('ramps over --fade-h and CLAMPS to [0, 1] — never past full, never below nothing', () => {
    expect(edgeShade(0, 0, RAMP)).toBe(0)
    expect(edgeShade(6, 0, RAMP)).toBe(0.25)
    expect(edgeShade(RAMP, 0, RAMP)).toBe(1)
    expect(edgeShade(100000, 0, RAMP)).toBe(1) // clamped, not 4166
    expect(edgeShade(-12, 0, RAMP)).toBe(0)
    // The bottom's ramp spans band → --fade-h, so it also reaches exactly 1 at the feather depth.
    expect(edgeShade(RAMP, BOTTOM_EDGE_BAND_PX, RAMP)).toBe(1)
    expect(edgeShade(14, BOTTOM_EDGE_BAND_PX, RAMP)).toBe(0.5)
  })

  it('degrades to FULL strength, never to none, if the ramp distance is unreadable', () => {
    // parseFloat('') on a stylesheet-less environment. The documented fallback is the
    // pre-round-10 boolean behaviour; a silent zero would be an invisible boundary.
    for (const bad of [NaN, 0, -1]) expect(edgeShade(10, 0, bad)).toBe(1)
    expect(edgeShade(0, 0, NaN)).toBe(0) // …but "at the edge" still means no shadow
  })
})

describe('Lookup’s two boundary surfaces ramp with the list (round 10 item B)', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.style.removeProperty('--fade-h')
  })

  const shade = (el) => Number(el.style.getPropertyValue('--shade'))

  it('writes each surface’s strength from the list, and toggles no class doing it', () => {
    // index.css is not loaded in jsdom, so the ramp distance the writer reads is stood up by hand
    // at its real value.
    document.documentElement.style.setProperty('--fade-h', '24px')
    const { container } = render(
      <LookupCard history={Array.from({ length: 12 }, (_, i) => entry(i))} />,
    )
    const list = container.querySelector('ul')
    const header = container.querySelector('.lookup-history-header')
    const method = container.querySelector('.lookup-method-section')
    // Both shadow classes are UNCONDITIONAL: the class says "this is a boundary", --shade says how
    // strongly it is asserting itself. Captured here and compared again at the end — a class that
    // never changes is a boolean that no longer exists.
    expect(header.className).toContain('elev-shadow-down')
    expect(method.className).toContain('elev-shadow-up')
    const classes = [header.className, method.className]
    // A list with nothing to scroll rests at 0 on both edges (jsdom's zero geometry).
    expect([shade(header), shade(method)]).toEqual([0, 0])
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, get: () => 900 },
      clientHeight: { configurable: true, get: () => 300 },
    })
    list.scrollTop = 12 // half the top ramp; 588px still below
    act(() => {
      fireEvent.scroll(list)
    })
    expect(shade(header)).toBe(0.5)
    expect(shade(method)).toBe(1)
    list.scrollTop = 900 - 300 - 12 // 12px from the end → (12 − 4) / (24 − 4)
    act(() => {
      fireEvent.scroll(list)
    })
    expect(shade(method)).toBe(0.4)
    expect(list.className).toContain('fade-scroll-both') // the mask is still a state class
    list.scrollTop = 900 - 300 - 3 // inside the dead band: arrived, by both readings
    act(() => {
      fireEvent.scroll(list)
    })
    expect(shade(method)).toBe(0)
    expect(list.className).toContain('fade-scroll-top')
    expect(list.className).not.toContain('fade-scroll-both')
    expect([header.className, method.className]).toEqual(classes)
  })
})

describe('Lookup date input on the interactive-border rule (round-7 Q7)', () => {
  afterEach(cleanup)

  it('wears the shared interactive surface (border surface-tray), never the container panel', () => {
    // The rule's Lookup site, mirroring the aox.dom and saveDefaults pins: inputs are controls,
    // so the typed date box carries the same sbtn-bd border tier as the Lookup/Clear buttons
    // beside it — not the fainter container .panel it once borrowed. (Added by the round-7
    // fixer: the Q7 input inventory missed this box.)
    const { container } = render(<LookupCard history={[]} />)
    const input = container.querySelector('input')
    expect(input.className).toContain('border surface-tray')
    expect(input.className).not.toContain('panel')
  })

  it('rests both Lookup boundaries at 0 when there is no history — no <ul>, so no scroller', () => {
    // ROUND-10 SHIP-BLOCKER, caught in review. The History header and the Show Codes section
    // render unconditionally and carry their shadow class unconditionally — but the <ul> they
    // bracket only exists once there is at least one entry. The hook used to bail on a null
    // scroller ref without writing anything, leaving --shade at @property's initial-value of 1:
    // a full-strength 50%-black shadow above AND below an empty "No lookups yet" panel, on every
    // cold start of a fresh install. It self-healed after the first lookup, which is exactly why
    // an on-device pass would miss it. `history` defaults to [] and an empty array is TRUTHY, so
    // the `active` guard never fired either.
    // The suite was green over a live bug because every other case here renders 12 entries.
    document.documentElement.style.setProperty('--fade-h', '24px')
    const { container } = render(<LookupCard history={[]} />)
    expect(container.querySelector('ul')).toBeNull() // the precondition, stated
    for (const sel of ['.lookup-history-header', '.lookup-method-section']) {
      const el = container.querySelector(sel)
      // Written, not merely absent: an empty string would inherit the initial-value of 1.
      expect(el.style.getPropertyValue('--shade')).toBe('0.000')
    }
  })

  it('states its text tier out loud — the page’s primary entry field, not a compact stepper', () => {
    // Q2 round-8: the box kept its larger size only by inheriting the root font, so any future
    // change to an ancestor could have shrunk it silently. text-base is the same rendered size,
    // now declared. (Deliberately NOT the text-sm the compact steppers elsewhere use.)
    const { container } = render(<LookupCard history={[]} />)
    const cls = container.querySelector('input').className.split(/\s+/)
    expect(cls).toContain('text-base')
    expect(cls).not.toContain('text-sm')
  })
})
