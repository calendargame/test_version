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
// Also here, because this is the file that renders LookupCard directly: the Q7 round-7
// interactive-border pin for the typed date box (the describe at the bottom).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import LookupCard from '../src/components/LookupCard.jsx'
import { SCROLL_REGION_CLASS } from '../src/components/scrollRegion.js'

const entry = (i) => ({
  id: `e${i}`,
  label: `March ${i + 1}, 1592`,
  weekday: 'Friday',
  result: `March ${i + 1}, 1592 was a Friday`,
  y: 1592,
  m: 3,
  d: i + 1,
})

describe('Lookup history on the shared scroll-region recipe (round-7 Q5)', () => {
  afterEach(cleanup)

  it('the list wears the shared token + its cap; the panel owns vertical padding only', () => {
    const { container } = render(
      <LookupCard history={Array.from({ length: 12 }, (_, i) => entry(i))} />,
    )
    const list = container.querySelector('ul')
    expect(list.className).toContain(SCROLL_REGION_CLASS) // the px-4 lane lives INSIDE the scroller
    expect(list.className).toContain('max-h-[440px]')
    const panel = list.parentElement
    expect(panel.className).toContain('py-4')
    expect(panel.className.split(/\s+/)).not.toContain('p-4') // vertical-only — the lane moved inward
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
})
