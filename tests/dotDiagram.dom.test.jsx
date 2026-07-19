// @vitest-environment jsdom
//
// How-to-Play DotDiagram ↔ shared dot layout consistency. The diagram (components/GuidePage) must be
// a pure DERIVATION of the shared DOT_CELL grid (lib/dotLayout — the same array that positions the
// real Dots answer input in main.tsx) + the DAY names (lib/format): dot positions from (r,c), labels
// from the day names' first three letters, and the aria-label sentence from the filled cells in row
// order. These tests pin BOTH ends: the canonical physical layout in DOT_CELL itself (so a data edit
// can't silently pass a derivation-only check), and the rendered SVG/aria-label against that data.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import GuidePage from '../src/components/GuidePage.jsx'
import { DOT_CELL } from '../src/lib/dotLayout.js'
import { DAY } from '../src/lib/format.js'

// The physical truth, stated independently of the module under test: weekday index → grid cell.
// Sun centre, Mon bottom-right, Tue mid-right, Wed top-right, Thu bottom-left, Fri mid-left,
// Sat top-left; centre-top (1,2) and centre-bottom (3,2) stay empty.
const CANONICAL_CELLS = [
  { r: 2, c: 2 }, // Sunday
  { r: 3, c: 3 }, // Monday
  { r: 2, c: 3 }, // Tuesday
  { r: 1, c: 3 }, // Wednesday
  { r: 3, c: 1 }, // Thursday
  { r: 2, c: 1 }, // Friday
  { r: 1, c: 1 }, // Saturday
]

// GuideSection content sits inside an always-mounted Expander (collapsed 0fr grid row, never
// unmounted), so the diagram is queryable without opening its section.
const renderDiagram = () => {
  const { container } = render(<GuidePage />)
  const svg = container.querySelector('svg[role="img"]')
  expect(svg).not.toBeNull()
  return svg
}

afterEach(cleanup)

describe('DotDiagram / DOT_CELL / DAY consistency', () => {
  it('DOT_CELL is the canonical 7-dot layout: weekday-indexed, unique cells, (1,2)+(3,2) empty', () => {
    expect(DAY).toHaveLength(7)
    expect(DOT_CELL).toHaveLength(7)
    expect(DOT_CELL).toEqual(CANONICAL_CELLS)
    const keys = DOT_CELL.map(({ r, c }) => `${r},${c}`)
    expect(new Set(keys).size).toBe(7)
    expect(keys).not.toContain('1,2')
    expect(keys).not.toContain('3,2')
    for (const { r, c } of DOT_CELL) {
      expect([1, 2, 3]).toContain(r)
      expect([1, 2, 3]).toContain(c)
    }
  })

  it('renders one labelled dot per weekday, in DAY order, at the DOT_CELL-derived SVG position', () => {
    const svg = renderDiagram()
    const groups = Array.from(svg.querySelectorAll('g'))
    expect(groups).toHaveLength(7)
    groups.forEach((g, i) => {
      const circle = g.querySelector('circle')
      const text = g.querySelector('text')
      // Label = the weekday's first three letters, DOM order = DAY order (Sun..Sat).
      expect(text.textContent).toBe(DAY[i].slice(0, 3))
      // Position derived from the shared grid cell: x = 30+(c-1)*60, y = 28+(r-1)*62.
      const { r, c } = DOT_CELL[i]
      expect(circle.getAttribute('cx')).toBe(String(30 + (c - 1) * 60))
      expect(circle.getAttribute('cy')).toBe(String(28 + (r - 1) * 62))
      // The label sits centred just below its dot.
      expect(text.getAttribute('x')).toBe(circle.getAttribute('cx'))
      expect(text.getAttribute('y')).toBe(String(Number(circle.getAttribute('cy')) + 27))
    })
  })

  it('speaks the layout accurately: aria-label lists every day at its cell position, in row order', () => {
    const svg = renderDiagram()
    // Pinned verbatim — this is what a screen reader announces. Derivable from DOT_CELL + DAY, but
    // asserted as a literal so a bug in the derivation AND the data can't cancel out.
    expect(svg.getAttribute('aria-label')).toBe(
      'Dots layout: Saturday top-left, Wednesday top-right, Friday middle-left, Sunday centre, ' +
        'Tuesday middle-right, Thursday bottom-left, Monday bottom-right.',
    )
  })
})
