// @vitest-environment jsdom
//
// CustomSelect — the "active cursor" highlight behavior (the mode-selector popover).
//
// The grey active box (bg-black/10) is a pointer/keyboard cursor, NOT an open-state
// indicator: it must NOT appear just from opening (so it never shows on mobile, where there's
// no hover/arrow input), it appears on a real MOUSE hover or an arrow key, and the first arrow
// steps ONE option from the selected one (Down → below the ✓, Up → above). The trigger opens ONLY
// via the global Tab shortcut or a mouse click — Enter/Space/arrows do NOT open it from the trigger.
// The check mark (✓) marks the selection, independent of the box.
// (Behavior updated 2026-06-06; the box-on-open suppression was 2026-06-01.)
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import CustomSelect from '../src/components/CustomSelect.jsx'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

// The active box is `bg-black/10` as its own class; inactive options get `active:bg-black/10`
// (a press-only pseudo). The leading space distinguishes the standalone token from the pseudo.
const hasBox = (btn) => btn.className.includes(' bg-black/10')
const options = () => screen.getAllByRole('option')

function openWith(value = 'b') {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  render(<CustomSelect value={value} onChange={() => {}} options={OPTIONS} ariaLabel="Test" />)
  const trigger = screen.getByRole('button', { name: 'Test' })
  fireEvent.click(trigger) // open the popover
  return trigger
}

describe('CustomSelect — active-cursor highlight', () => {
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('shows NO active box when the popover just opened (the mobile / no-input case)', () => {
    openWith('b')
    expect(options().some(hasBox)).toBe(false) // nothing highlighted on open
    // …but the selected option still carries its check mark.
    const selected = options().find((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected.textContent).toContain('✓')
    expect(selected.textContent).toContain('Beta')
  })

  it('the first ArrowDown highlights the option BELOW the selected one', () => {
    const trigger = openWith('b') // Beta (index 1) → first Down lands on Gamma (index 2)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const boxed = options().filter(hasBox)
    expect(boxed.length).toBe(1)
    expect(boxed[0].textContent).toContain('Gamma')
  })

  it('the first ArrowUp highlights the option ABOVE the selected one', () => {
    const trigger = openWith('b') // Beta (1) → first Up lands on Alpha (0)
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    const boxed = options().filter(hasBox)
    expect(boxed.length).toBe(1)
    expect(boxed[0].textContent).toContain('Alpha')
  })

  it('ArrowDown steps down one option at a time and clamps at the last', () => {
    const trigger = openWith('a') // Alpha (0)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // → Beta (1)
    expect(options().filter(hasBox)[0].textContent).toContain('Beta')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // → Gamma (2)
    expect(options().filter(hasBox)[0].textContent).toContain('Gamma')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // clamps at Gamma (last)
    const boxed = options().filter(hasBox)
    expect(boxed.length).toBe(1)
    expect(boxed[0].textContent).toContain('Gamma')
  })

  it('the trigger does NOT open on Enter / Space / arrows (only Tab or a mouse click opens it)', () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    render(<CustomSelect value="b" onChange={() => {}} options={OPTIONS} ariaLabel="Test" />)
    const trigger = screen.getByRole('button', { name: 'Test' })
    for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) {
      fireEvent.keyDown(trigger, { key })
      expect(screen.queryAllByRole('option').length).toBe(0) // stays closed — no keyboard open from the trigger
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    }
    fireEvent.click(trigger) // a mouse click still opens it
    expect(screen.queryAllByRole('option').length).toBe(3)
  })

  it('a MOUSE hover highlights an option, a TOUCH pointer does not', () => {
    openWith('b')
    const gamma = options().find((o) => o.textContent.includes('Gamma'))
    fireEvent.pointerEnter(gamma, { pointerType: 'touch' })
    expect(hasBox(gamma)).toBe(false) // touch → no box (mobile stays clean)
    fireEvent.pointerEnter(gamma, { pointerType: 'mouse' })
    expect(hasBox(gamma)).toBe(true) // mouse → box (desktop hover)
  })
})

// ── Portal geometry: the doc-scroll coordinate term + the auto-flip fit test (round-8) + the
//    document-scroll close (Q2) ─────────────────────────────────────────────────────────────
//
// The option panel portals into #root with position:absolute. In APP mode #root is
// position:fixed at the viewport origin and the document can't scroll, so viewport coordinates
// ARE containing-block coordinates (scrollY locked at 0). In GUIDE mode (html[data-doc-scroll])
// #root goes static and the document becomes the scroller — the panel's containing block then
// anchors at the DOCUMENT origin, so measurePanel must add window.scrollY or a scrolled-down
// page paints the menu scrollY px above its trigger, sliding off the top of the screen (the
// Round-4 "mode menu opens upward + clipped in How-to-Play" report).
// The AUTO-FLIP (round-8 root-cause fix, replacing the mode selector's forceDown hardcode):
// the panel opens DOWN unless it does not fit below AND does fit above. "Above" is measured to
// the FIXED BAR (--bar-h), not the screen edge — clearing the viewport while painting over the
// title/gear/mode selector is not fitting. The old test compared space-above to space-BELOW and
// never checked the panel fit above at all, so a long list with cramped room on both sides
// flipped up into a space too small for it; the last two cases here pin both halves of the fix.
// While open, captured scrolls split by TARGET (Q2): an ELEMENT scroll (the settings
// popover's inner wrapper) repositions the panel; a DOCUMENT scroll (guide mode's page pan)
// CLOSES it with outside-tap semantics — no trigger refocus.
describe('CustomSelect — portal position math (doc-scroll term + auto-flip fit + doc-scroll close)', () => {
  let rectSpy
  // All triggers share one mocked rect — only the CustomSelect wrapper's rect is read while
  // these tests run (jsdom's real getBoundingClientRect is all-zeros, useless for geometry).
  const mockRect = ({ top, bottom, left, right }) => {
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom,
      left,
      right,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      toJSON: () => ({}),
    })
  }
  const setScrollY = (v) =>
    Object.defineProperty(window, 'scrollY', { configurable: true, value: v })

  afterEach(() => {
    rectSpy?.mockRestore()
    rectSpy = undefined
    setScrollY(0) // jsdom never scrolls on its own; pin the mock back to the app-mode value
    document.documentElement.style.removeProperty('--bar-h') // back to the 0 the app never sets in jsdom
    cleanup()
    document.getElementById('root')?.remove()
  })

  const mount = (props = {}) => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    render(
      <CustomSelect value="b" onChange={() => {}} options={OPTIONS} ariaLabel="Test" {...props} />,
    )
    return screen.getByRole('button', { name: 'Test' })
  }
  const panel = () => screen.getByRole('listbox')

  it('adds the document scroll to the panel top (guide mode: the containing block sits at the document origin)', () => {
    mockRect({ top: 40, bottom: 63, left: 200, right: 300 }) // a top-bar trigger — plenty of space below, never flips
    setScrollY(500)
    fireEvent.click(mount())
    expect(panel().style.top).toBe(`${63 + 6 + 500}px`) // rect.bottom + 6 + scrollY
    expect(panel().style.bottom).toBe('') // opening down — top-positioned only
  })

  // The rect both flip cases share: a trigger near the bottom edge, so spaceBelow
  // (innerHeight − rect.bottom − 16 = 12) is far under the 3×45+10 = 145 estimate. Whether the
  // panel flips then turns entirely on whether it FITS above — which the next two tests drive
  // from opposite sides using this one fixture.
  const bottomEdgeRect = {
    top: window.innerHeight - 68,
    bottom: window.innerHeight - 28,
    left: 200,
    right: 300,
  }

  it('a bottom-of-screen trigger auto-flips up when the panel FITS above', () => {
    mockRect(bottomEdgeRect)
    fireEvent.click(mount())
    // spaceAbove = rect.top − barH(0 in jsdom) − 6 = 694 ≥ 145 → flip.
    expect(panel().style.bottom).toBe(`${window.innerHeight - bottomEdgeRect.top + 6}px`) // − scrollY (0) — the term is symmetric
    expect(panel().style.top).toBe('')
  })

  it('does NOT flip when the panel fits NEITHER below nor above (the round-8 bug: a tall list, cramped both sides)', () => {
    // The exact shape the old spaceAbove > spaceBelow test got wrong. 16 options need
    // 16×45+10 = 730px; the trigger sits low enough that space below (212) is hopeless and
    // space above (494) is merely LARGER — not large enough. The old test read "more room
    // above" and flipped up into a gap that could not hold the panel; the fit test keeps it
    // down, where an over-tall panel at least starts at the trigger and runs off the bottom
    // instead of off the top.
    const tall = Array.from({ length: 16 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }))
    mockRect({
      top: window.innerHeight - 268,
      bottom: window.innerHeight - 228,
      left: 200,
      right: 300,
    })
    fireEvent.click(mount({ options: tall, value: 'v0' }))
    expect(panel().style.top).toBe(`${window.innerHeight - 228 + 6}px`)
    expect(panel().style.bottom).toBe('')
  })

  it('measures the space above to the FIXED BAR, not the screen edge — a tall --bar-h keeps the same rect down', () => {
    // Same fixture as the flip case above; ONLY --bar-h changes. Raw rect.top is still a roomy
    // 700px, but the bar owns the first 600 of it, leaving 700 − 600 − 6 = 94 < 145. A panel
    // that clears the viewport by painting over the title/gear/mode selector is not "fitting",
    // so it stays down. (jsdom loads no CSS, so --bar-h is absent → 0 → the flip case above.)
    document.documentElement.style.setProperty('--bar-h', '600px')
    mockRect(bottomEdgeRect)
    fireEvent.click(mount())
    expect(panel().style.top).toBe(`${bottomEdgeRect.bottom + 6}px`)
    expect(panel().style.bottom).toBe('')
  })

  it('an ELEMENT scroll re-measures WITH the scroll term (the panel stays pinned mid-scroll)', () => {
    mockRect({ top: 40, bottom: 63, left: 200, right: 300 })
    fireEvent.click(mount())
    expect(panel().style.top).toBe(`${63 + 6}px`) // scrollY 0 at open
    setScrollY(800)
    // An element scroll (the settings popover's inner wrapper) — the capture-phase window
    // listener sees target = the element and re-runs measurePanel. (A DOCUMENT scroll
    // closes the panel instead — next test.)
    const scroller = document.createElement('div')
    document.body.appendChild(scroller)
    act(() => {
      fireEvent.scroll(scroller)
    })
    expect(panel().style.top).toBe(`${63 + 6 + 800}px`)
    scroller.remove()
  })

  it('a DOCUMENT scroll closes the panel — outside-tap semantics, no trigger refocus', () => {
    mockRect({ top: 40, bottom: 63, left: 200, right: 300 })
    const trigger = mount()
    fireEvent.click(trigger)
    expect(screen.queryAllByRole('option').length).toBe(3)
    act(() => {
      fireEvent.scroll(document) // a page scroll targets the Document node
    })
    expect(screen.queryAllByRole('option').length).toBe(0) // closed, not repositioned
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).not.toBe(trigger) // no refocus (≠ Esc's closeAndFocus)
    cleanup()
    document.getElementById('root')?.remove()
    // WebKit safety: engines that target documentElement for the page scroll close too.
    fireEvent.click(mount())
    expect(screen.queryAllByRole('option').length).toBe(3)
    act(() => {
      fireEvent.scroll(document.documentElement)
    })
    expect(screen.queryAllByRole('option').length).toBe(0)
  })
})
