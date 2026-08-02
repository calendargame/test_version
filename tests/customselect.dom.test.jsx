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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import CustomSelect from '../src/components/CustomSelect.jsx'
import { SCROLL_GAP_MS, isDocScrollInFlight } from '../src/lib/docScrollFlight.js'

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
// THE DISMISS RULE (Q8, rewritten 2026-08-02). While the menu is open, a DOCUMENT scroll closes it
// with outside-tap semantics (no trigger refocus) — but only when ARMED, and arming is what makes
// the menu usable on a page that is still gliding:
//   • armed at open = "nothing was scrolling when you opened this" (lib/docScrollFlight);
//   • an UNARMED scroll is a silent no-op — it must not close (that is the flick-then-open case)
//     and must not re-measure either (re-measuring per scroll event through momentum is the
//     jitter this whole item removed);
//   • it RE-ARMS on a scroll event that is the FIRST OF A NEW SEQUENCE, so a scroll the user starts
//     with the menu open both arms and dismisses in that one event.
// ⚠ The re-arm used to be the in-flight scroll's own scrollend, and that shipped and FAILED on the
// owner's iPhone: the menu's opening touch is what cancels the glide, so the cancellation's
// scrollend arrived ~16ms after the open and armed the menu against the dying scroll it had just
// correctly refused to be dismissed by — the menu stayed open for about one frame. lib/docScrollFlight's
// header has the full account. These tests therefore drive a CONTROLLED CLOCK and real scroll-event
// cadences rather than any end-of-scroll signal, and the four cases below are the owner's spec:
//   A. a scroll already in flight at open        → opens, stays open for the whole sequence;
//   B. the same for a programmatic/smooth glide  → opens, stays open, and the glide's END is not an
//      event either, so nothing happens when it stops;
//   C. page static, the user swipes              → closes (via the touchstart-outside path — see
//      the test, which says so and proves which path is doing the work);
//   D. page static, then a scroll STARTS         → closes on that scroll's FIRST event, because it
//      is the first of a new sequence. Both flavours are pinned: armed-at-open, and re-armed after
//      surviving a glide (that second one is the exact case the shipped scrollend rule broke).
// An element scroll is nothing to this component at all: no close, no reposition.
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
  // The app-wide scroll reading is a module singleton (lib/docScrollFlight) that answers two
  // questions from the GAP between document scroll events, so these tests own the clock the module
  // reads. Real elapsed time is not an option: a test that let 150ms of wall clock pass could not
  // say which side of the boundary it landed on, and one that let 150ms pass ACCIDENTALLY would be
  // a menu closing for a reason no assertion mentions. The clock is monotonic across the whole
  // describe (module state is a singleton; a per-test reset would put "now" behind the previous
  // test's last event and read as mid-scroll).
  let clock = 1_000_000
  let nowSpy
  const tick = (ms) => {
    clock += ms
  }
  const docScroll = () => fireEvent.scroll(document)
  // One frame of a LIVE scroll — momentum and CSSOM smooth scrolling were both measured at
  // 15–18.5ms between events, against the module's 150ms gap.
  const FRAME_MS = 16
  const glideFrame = () => {
    tick(FRAME_MS)
    act(() => {
      docScroll()
    })
  }
  // The sequence ending is NOT an event: the events simply stop. This is that silence.
  const scrollStops = () => tick(SCROLL_GAP_MS)
  const barTriggerRect = { top: 40, bottom: 63, left: 200, right: 300 }
  const optionCount = () => screen.queryAllByRole('option').length

  beforeEach(() => {
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    // Every test starts from a stated baseline: nothing in flight, nothing having just started.
    // (Two scrolls, because the second is what puts "a new sequence just started" back down.)
    scrollStops()
    docScroll()
    tick(FRAME_MS)
    docScroll()
    scrollStops()
    expect(isDocScrollInFlight()).toBe(false)
  })

  afterEach(() => {
    rectSpy?.mockRestore()
    rectSpy = undefined
    setScrollY(0) // jsdom never scrolls on its own; pin the mock back to the app-mode value
    document.documentElement.style.removeProperty('--bar-h') // back to the 0 the app never sets in jsdom
    nowSpy.mockRestore()
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

  it('A — a finger-driven glide already in flight at open: opens, stays open, never re-measures', () => {
    mockRect(barTriggerRect)
    // You flicked the guide page, lifted your finger, and pressed the trigger while momentum was
    // still gliding. Two frames of that glide have already gone by when the menu opens.
    glideFrame()
    glideFrame()
    expect(isDocScrollInFlight()).toBe(true)
    fireEvent.click(mount())
    expect(optionCount()).toBe(3)
    // ⚠ THE IPHONE SEQUENCE, reproduced — this is what the shipped version died on, and it is why
    // a test made only of scroll events would not have caught it. The finger that opened the menu
    // is also what CANCELS the glide, so WebKit delivers that cancellation's scrollend ~16ms AFTER
    // the open, with the dying scroll still emitting. The old rule armed on it and the very next
    // frame closed the menu, about 10ms after it opened ("never opens", "flashes"). The rule in
    // place now does not listen for scrollend anywhere, so this is not an event to it.
    tick(FRAME_MS)
    act(() => {
      document.dispatchEvent(new Event('scrollend'))
    })
    glideFrame()
    expect(optionCount()).toBe(3)
    // The glide continues underneath the open menu — 20 more frames, 320ms in total, i.e. twice
    // the gap in elapsed time. What holds the menu open is that no frame is ever the FIRST of a
    // sequence, not that little time has passed. Move the trigger too, so a re-measure would be
    // visible: an unarmed scroll must be a complete no-op, not a reposition.
    mockRect({ top: 900, bottom: 923, left: 200, right: 300 })
    for (let i = 0; i < 20; i++) glideFrame()
    expect(optionCount()).toBe(3) // still open
    expect(panel().style.top).toBe(`${63 + 6}px`) // still where it opened
    // And the deleted no-scrollend fallback stays deleted: a wheel or a key press is not an arming
    // signal any more. That path had its own suite; both went in the same change, and this line is
    // what is left of it — under the fallback, either of these would have armed the menu here and
    // the next frame would have closed it.
    act(() => {
      fireEvent.wheel(window)
      fireEvent.keyDown(window, { key: 'PageDown' })
    })
    glideFrame()
    expect(optionCount()).toBe(3)
  })

  it('B — a programmatic glide already running at open: same answer, and its END is not an event', () => {
    mockRect(barTriggerRect)
    // A CSSOM smooth scroll, or the guide accordion's per-frame writer — which deliberately does
    // NOT go through scrollWindowTo, because its frames ARE a scroll in flight (GuidePage's
    // header). Driven here at 18.5ms, the widest gap ever measured inside a live sequence, so this
    // case runs against the worst real cadence rather than a comfortable one.
    const writerFrame = (y) => {
      tick(18.5)
      act(() => {
        window.scrollTo(0, y)
        docScroll()
      })
    }
    writerFrame(40)
    writerFrame(90)
    expect(isDocScrollInFlight()).toBe(true) // the glide is running as the menu opens
    fireEvent.click(mount())
    expect(optionCount()).toBe(3)
    // The same cancellation as in case A: a touch landing on a page that a smooth scroll is moving
    // aborts that scroll, and the engine says so ~16ms later — after the menu is already open.
    tick(FRAME_MS)
    act(() => {
      document.dispatchEvent(new Event('scrollend'))
    })
    for (let y = 140; y <= 600; y += 50) writerFrame(y)
    expect(optionCount()).toBe(3) // open through the whole glide
    // …and when the glide finishes, nothing happens — because nothing IS the signal. The old rule
    // had an event here (scrollend), and that event is what armed the menu against its own glide.
    scrollStops()
    expect(optionCount()).toBe(3)
  })

  it('C — page static, the user swipes: the TOUCH closes it, before any scroll exists', () => {
    mockRect(barTriggerRect)
    const trigger = mount()
    fireEvent.click(trigger)
    expect(optionCount()).toBe(3)
    // ⚠ WHICH PATH: this is the click-outside listener (mousedown/touchstart), NOT the scroll
    // dismiss rule the rest of this block is about. The finger lands outside the panel, on the page
    // it is about to pan, and that is simply a tap outside an open popover — it closes there and
    // then. No scroll event has been dispatched at this point, and the clock has not moved, so the
    // scroll path cannot be what did it.
    act(() => {
      fireEvent.touchStart(document.body)
    })
    expect(optionCount()).toBe(0)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    // The other half of the same gesture, and the reason the scroll path must also handle it: a
    // swipe that STARTS INSIDE the panel is not an outside tap, so that listener declines it. The
    // page it pans then closes the menu through the scroll path — the accepted, native-iOS-like
    // consequence documented on the component.
    fireEvent.click(trigger)
    expect(optionCount()).toBe(3)
    act(() => {
      fireEvent.touchStart(panel())
    })
    expect(optionCount()).toBe(3) // the touch alone does nothing
    glideFrame() // …and the page starts moving under the finger
    expect(optionCount()).toBe(0)
    // Proof that the first half really is a different path: the outside tap closes an UNARMED menu
    // too — one opened mid-glide, which no scroll may dismiss. Arming is not an input to it.
    glideFrame()
    fireEvent.click(trigger) // opens unarmed (a scroll is in flight)
    expect(optionCount()).toBe(3)
    act(() => {
      fireEvent.touchStart(document.body)
    })
    expect(optionCount()).toBe(0)
  })

  it('D — page static, then a scroll STARTS: closed by that scroll’s first event, no refocus', () => {
    mockRect(barTriggerRect)
    const trigger = mount()
    fireEvent.click(trigger)
    expect(optionCount()).toBe(3)
    // iOS's status-bar tap, or any scroll begun with the menu open: its first event is the first of
    // a new sequence, so the menu is armed by it and closed by that same event.
    scrollStops()
    act(() => {
      docScroll()
    })
    expect(optionCount()).toBe(0) // closed, not repositioned
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).not.toBe(trigger) // no refocus (≠ Esc's closeAndFocus)
    cleanup()
    document.getElementById('root')?.remove()
    // That scroll's sequence has to be OVER before the next open, or the app-wide reading it
    // refreshed would (correctly) leave the second menu unarmed — one app-wide fact, not
    // per-instance state. Under the old rule this line was a synthetic scrollend; now it is silence.
    scrollStops()
    // WebKit safety: engines that target documentElement for the page scroll close too.
    fireEvent.click(mount())
    expect(optionCount()).toBe(3)
    act(() => {
      fireEvent.scroll(document.documentElement)
    })
    expect(optionCount()).toBe(0)
  })

  it('D — opened DURING a glide: survives it, then closes on the first event of the NEXT scroll', () => {
    mockRect(barTriggerRect)
    // The RE-ARM, and the exact case the shipped scrollend version got wrong: it armed on the
    // cancellation of the very glide the menu was opened during (the opening touch is what cancels
    // it), so the glide's own next frame closed the menu ~10ms after it opened.
    glideFrame()
    glideFrame()
    const trigger = mount()
    fireEvent.click(trigger) // opens UNARMED — a scroll is in flight
    glideFrame()
    glideFrame()
    glideFrame()
    expect(optionCount()).toBe(3) // the glide runs out under the open menu
    scrollStops() // …and stops, silently
    expect(optionCount()).toBe(3)
    // Now the user starts a scroll of their own. First event of a new sequence: arm, and dismiss.
    act(() => {
      docScroll()
    })
    expect(optionCount()).toBe(0)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
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
