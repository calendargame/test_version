// docScrollFlight — the app's ONE answer to "is the DOCUMENT mid-scroll right now?".
//
// WHY IT EXISTS (Q8, round 11). The mode menu's dismiss rule is a SEQUENCE question, not a
// position question: a scroll that was already running when the menu opened must be left alone
// (you flicked How to Play, lifted your finger, and opened the menu while momentum was still
// gliding), while a scroll you START with the menu open dismisses it. No single scroll event can
// tell those two apart — only the boundary between scroll sequences can, and `scrollend` is the
// one such boundary the platform exposes. So: one always-on flag, raised by a document scroll and
// lowered by its scrollend. That answers the question SYNCHRONOUSLY at the moment the menu opens,
// with no rAF poll, no settle timeout and no tuned constants.
// (A rAF "has it stopped moving?" poll was measured to report "static" DURING live flight — rAF
// callbacks run before that frame's scroll event — i.e. it failed in the exact direction that
// dismisses the menu you just opened. It was killed on that measurement; do not reintroduce it.)
//
// ALWAYS ON, and it has to be: the flag must ALREADY hold the answer at open time, so the
// listeners are installed at module load, not while a menu is open. They are two passive
// listeners that write one boolean.
//
// FEATURE-GATED. Without `scrollend` there is no boundary signal, so nothing could ever lower the
// flag and it would latch true on the first scroll. On such an engine the tracker installs
// nothing and isDocScrollInFlight() is permanently false — CONSUMERS MUST GATE ON
// SCROLLEND_SUPPORTED and fall back to their own arming rather than trust that false.
//
// THE LATCH, and why our own jumps clear the flag themselves. Any scroll sequence that never
// delivers its scrollend would strand the flag at true FOREVER, and every later open would read
// "in flight" — the dismiss would be dead for the rest of the session. The one way to produce
// that here is an in-flight SMOOTH scroll (iOS's tap-the-status-bar glide, the very gesture case D
// is about) being ABORTED by a programmatic INSTANT jump: an abort is not a completion, and
// engines have not reliably fired scrollend for one. This app makes exactly such jumps — entering
// and leaving guide mode, the pageshow fresh-load reset (a BFCache restore is gated out of that
// one and jumps nothing — main.tsx Q3), Full Reset. They all go through scrollWindowTo, which
// lowers the flag itself.
// That is not a heuristic papering over the gap: an instant scroll is COMPLETE the moment
// scrollTo returns, so after one of our jumps there is, as a matter of fact, no scroll in flight.
// The app is simply being honest about a scroll it caused.
//
// ⚠ AND THE JUMP'S OWN SCROLL EVENT MUST NOT UNDO THAT. A jump that actually moves the page makes
// the engine dispatch a document `scroll` a task later. Lowering the flag and stopping there left
// that event to raise it straight back up — so whether the flag ever came down again rested on a
// scrollend for the very sequence this module says may never deliver one. The cure would have
// depended on the hazard it was written to sidestep. So scrollWindowTo also records that ONE
// scroll event is already spoken for, and the listener spends it lowering the flag instead of
// raising it. It records that only when the page actually MOVED (compare after the call, which is
// also after any clamping): a jump that changed nothing fires no event, and a claim left
// outstanding would be spent on the user's next real scroll.
// tests/docScrollFlight pins the latch (a sequence with no scrollend does strand the flag), the
// cure, and the jump's own echo.
//
// THE ONE window.scrollTo THAT STAYS BARE is the guide accordion's per-frame scroll writer
// (components/GuidePage): it is not a jump that PLACES the page, it is the app RUNNING a scroll
// animation, and its frames are precisely the "in flight" this flag exists to describe. Clearing
// on every frame would make an accordion glide look stationary and dismiss a menu opened during
// it. It ends like any other scroll — on its last frame's scrollend.

// 'onscrollend' is the standard detect (Chrome 114, Firefox 109, Safari/iOS 26.2). Read once at
// load: it is a static engine capability, and the tracker's own install below depends on it.
export const SCROLLEND_SUPPORTED = typeof window !== 'undefined' && 'onscrollend' in window

let inFlight = false
// One outstanding claim on the next document scroll event: set by a scrollWindowTo that MOVED the
// page, spent by that jump's own echo (see the header). Never more than one — a second jump before
// the first echo arrives simply re-states the same fact, that the newest jump is the last word.
let jumpEchoPending = false

// True only between a document scroll and its scrollend. Always false on an engine without
// scrollend — see the gating note in the header.
export function isDocScrollInFlight(): boolean {
  return inFlight
}

// scrollWindowTo — the app's ONE door for an instant window jump. Identical to window.scrollTo
// plus the truth it establishes: after it returns the page is where we put it and nothing is
// moving, so any sequence it interrupted is over whether or not the engine says so.
export function scrollWindowTo(x: number, y: number): void {
  const fromX = window.scrollX
  const fromY = window.scrollY
  window.scrollTo(x, y)
  jumpEchoPending = window.scrollX !== fromX || window.scrollY !== fromY
  inFlight = false
}

// A page scroll is fired at the Document and bubbles to the window; documentElement is accepted
// too because WebKit has been seen to target it instead, and an element-targeted scroll does NOT
// bubble — which is also why these listen in the CAPTURE phase. Element scrolls (the settings
// popover's inner wrapper, the Lookup list) are not document scrolls and are ignored. Exported
// because the panel's own dismiss listener in components/CustomSelect needs the identical test,
// and two copies of one predicate are one copy too many.
export const isDocumentScroll = (e: Event) =>
  e.target === document || e.target === document.documentElement

if (SCROLLEND_SUPPORTED) {
  window.addEventListener(
    'scroll',
    (e) => {
      if (!isDocumentScroll(e)) return
      if (jumpEchoPending) {
        // Our own jump's echo: a scroll that was over before this event was dispatched.
        jumpEchoPending = false
        inFlight = false
        return
      }
      inFlight = true
    },
    { capture: true, passive: true },
  )
  window.addEventListener(
    'scrollend',
    (e) => {
      if (isDocumentScroll(e)) inFlight = false
    },
    { capture: true, passive: true },
  )
}
