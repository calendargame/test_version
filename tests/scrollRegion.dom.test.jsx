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
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import LookupCard from '../src/components/LookupCard.jsx'
import { SCROLL_REGION_CLASS } from '../src/components/scrollRegion.js'

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
