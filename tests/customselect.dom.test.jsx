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

// ── The fixed portal panel: position, the Q8 dismiss rule, and --bar-h ───────────────────────
//
// POSITION (Q8, round 11). The option panel portals into #root as position:FIXED, so its
// containing block is the viewport in both of the app's layouts and its coordinates are simply
// the trigger's viewport rect — no scroll term, no mode-dependent correction. That replaces the
// round-4 ± window.scrollY patch, which existed only because the panel was position:absolute
// while guide mode (html[data-doc-scroll]) makes #root static, moving the panel's containing
// block to the document origin. The assertion here is deliberately STRONGER than the one it
// replaces: the old test pinned a particular scroll term, this one pins that the panel's
// position does not depend on the document scroll AT ALL.
// The auto-flip-up branch is gone with it (owner's call): at the only call site the trigger is
// inside the bar the flip measured its ceiling from, so the space above is structurally negative
// and the branch was unreachable. Its three tests are gone for the same reason — testing an
// unreachable branch is how it survives.
//
// THE DISMISS RULE (Q8). While the menu is open, a DOCUMENT scroll closes it with outside-tap
// semantics (no trigger refocus) — but only when ARMED, and arming is what makes the menu usable
// on a page that is still gliding:
//   • armed at open = "nothing was scrolling when you opened this" (lib/docScrollFlight);
//   • an UNARMED scroll is a silent no-op — it must not close (that is the flick-then-open case)
//     and must not re-measure either (re-measuring per scroll event through momentum is the
//     jitter this whole item removed);
//   • the in-flight scroll's own scrollend arms, monotonically, so the NEXT scroll closes.
// An element scroll is now nothing to this component at all: no close, no reposition.
describe('CustomSelect — the fixed portal panel (position, dismiss arming, --bar-h)', () => {
  let rectSpy
  // All triggers share one mocked rect — only the CustomSelect wrapper's rect is read while
  // these tests run (jsdom's real getBoundingClientRect is all-zeros, useless for geometry).
  // Callable again mid-test to MOVE the trigger, which is how "did it re-measure?" is asked.
  const mockRect = ({ top, bottom, left, right }) => {
    const rect = {
      top,
      bottom,
      left,
      right,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      toJSON: () => ({}),
    }
    if (rectSpy) rectSpy.mockReturnValue(rect)
    else rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect)
  }
  const setScrollY = (v) =>
    Object.defineProperty(window, 'scrollY', { configurable: true, value: v })
  // The app-wide in-flight flag is a module singleton (lib/docScrollFlight): a document scroll
  // raises it, a scrollend lowers it. These drive it the way the browser would.
  const docScroll = () => fireEvent.scroll(document)
  const docScrollEnd = () => document.dispatchEvent(new Event('scrollend'))
  const barTriggerRect = { top: 40, bottom: 63, left: 200, right: 300 }

  afterEach(() => {
    rectSpy?.mockRestore()
    rectSpy = undefined
    setScrollY(0) // jsdom never scrolls on its own; pin the mock back to the app-mode value
    document.documentElement.style.removeProperty('--bar-h') // back to the 0 the app never sets in jsdom
    docScrollEnd() // leave the shared in-flight flag at rest for the next test
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

  it('is position:fixed, 6px under the trigger with their right edges aligned', () => {
    mockRect(barTriggerRect)
    fireEvent.click(mount())
    expect(panel().style.position).toBe('fixed')
    expect(panel().style.top).toBe(`${63 + 6}px`)
    expect(panel().style.right).toBe(`${document.documentElement.clientWidth - 300}px`)
    expect(panel().style.bottom).toBe('') // opens down; there is no flip-up branch left
  })

  it('places the panel IDENTICALLY at every document scroll offset (the term is gone, not retuned)', () => {
    mockRect(barTriggerRect)
    const trigger = mount()
    fireEvent.click(trigger)
    const atRest = { top: panel().style.top, right: panel().style.right }
    fireEvent.click(trigger) // close
    // A deeply scrolled guide page. Under the old absolute panel this same open painted the menu
    // 1500px away from its trigger unless a matching correction term was applied.
    setScrollY(1500)
    fireEvent.click(trigger)
    expect({ top: panel().style.top, right: panel().style.right }).toEqual(atRest)
    expect(panel().style.top).toBe(`${63 + 6}px`)
  })

  it('opens and STAYS open when a scroll was already in flight — and never re-measures', () => {
    mockRect(barTriggerRect)
    // Case A/B: you flicked the page (or tapped the status bar), lifted your finger, and opened
    // the menu while it was still gliding.
    act(() => {
      docScroll()
    })
    fireEvent.click(mount())
    expect(screen.queryAllByRole('option').length).toBe(3)
    // The glide continues under the open menu. Move the trigger too, so a re-measure would be
    // visible: an unarmed scroll must be a complete no-op, not a reposition.
    mockRect({ top: 900, bottom: 923, left: 200, right: 300 })
    act(() => {
      docScroll()
      docScroll()
    })
    expect(screen.queryAllByRole('option').length).toBe(3) // still open
    expect(panel().style.top).toBe(`${63 + 6}px`) // still where it opened
  })

  it('arms on the in-flight scroll’s scrollend, so the NEXT scroll dismisses it', () => {
    mockRect(barTriggerRect)
    act(() => {
      docScroll()
    })
    const trigger = mount()
    fireEvent.click(trigger)
    act(() => {
      docScrollEnd() // the glide finishes — the menu is still open, and now armed
    })
    expect(screen.queryAllByRole('option').length).toBe(3)
    act(() => {
      docScroll() // a scroll the user started WITH the menu open
    })
    expect(screen.queryAllByRole('option').length).toBe(0)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('a menu opened with nothing scrolling is armed at once — outside-tap semantics, no refocus', () => {
    mockRect(barTriggerRect)
    const trigger = mount()
    fireEvent.click(trigger)
    expect(screen.queryAllByRole('option').length).toBe(3)
    act(() => {
      docScroll() // a page scroll targets the Document node
    })
    expect(screen.queryAllByRole('option').length).toBe(0) // closed, not repositioned
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).not.toBe(trigger) // no refocus (≠ Esc's closeAndFocus)
    cleanup()
    document.getElementById('root')?.remove()
    // That scroll's sequence has to END before the next open, or the app-wide in-flight flag it
    // raised would (correctly) leave the second menu unarmed — the flag is one app-wide fact, not
    // per-instance state.
    docScrollEnd()
    // WebKit safety: engines that target documentElement for the page scroll close too.
    fireEvent.click(mount())
    expect(screen.queryAllByRole('option').length).toBe(3)
    act(() => {
      fireEvent.scroll(document.documentElement)
    })
    expect(screen.queryAllByRole('option').length).toBe(0)
  })

  it('an ELEMENT scroll is nothing to it — no dismiss, no reposition', () => {
    mockRect(barTriggerRect)
    fireEvent.click(mount())
    const scroller = document.createElement('div')
    document.body.appendChild(scroller)
    mockRect({ top: 900, bottom: 923, left: 200, right: 300 })
    act(() => {
      fireEvent.scroll(scroller)
    })
    expect(screen.queryAllByRole('option').length).toBe(3)
    expect(panel().style.top).toBe(`${63 + 6}px`) // the deleted reposition branch, staying deleted
    scroller.remove()
  })

  it('re-measures when --bar-h changes, which moves the trigger without a window resize', async () => {
    // A font swap or safe-area shift re-heights the fixed bar; main.tsx publishes the new height
    // on <html> and fires no resize event. The panel watches that property because its trigger
    // lives in that bar.
    mockRect(barTriggerRect)
    fireEvent.click(mount())
    expect(panel().style.top).toBe(`${63 + 6}px`)
    mockRect({ top: 48, bottom: 71, left: 200, right: 300 }) // the bar grew 8px; the trigger moved
    await act(async () => {
      document.documentElement.style.setProperty('--bar-h', '80px')
    })
    expect(panel().style.top).toBe(`${71 + 6}px`)
    // An unrelated inline write on <html> (the theme background) is not a bar change.
    mockRect({ top: 300, bottom: 323, left: 200, right: 300 })
    await act(async () => {
      document.documentElement.style.background = '#000'
    })
    expect(panel().style.top).toBe(`${71 + 6}px`)
  })
})
