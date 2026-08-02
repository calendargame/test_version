// docScrollFlight — the app's ONE answer to "is the DOCUMENT mid-scroll right now?".
//
// WHY IT EXISTS (Q8, round 11). The mode menu's dismiss rule is a SEQUENCE question, not a
// position question: a scroll that was already running when the menu opened must be left alone
// (you flicked How to Play, lifted your finger, and opened the menu while momentum was still
// gliding), while a scroll you START with the menu open dismisses it.
//
// ⚠ HOW THIS WORKS, AND WHY IT IS NOT scrollend (rewritten 2026-08-02, after the first version
// shipped and FAILED on the owner's iPhone). The original read the sequence boundary from the
// `scrollend` event. That cannot work here, for a reason that is structural rather than a bug:
//
//   THE MENU'S OWN OPENING TOUCH IS WHAT ENDS THE SCROLL THE MENU IS ASKING ABOUT.
//
// On iOS a finger landing on a gliding page cancels the glide. So the boundary signal is PRODUCED
// BY the open rather than observed before it, and the sequence went: finger down, flag correctly
// reads in-flight, menu opens correctly UNARMED — then ~16ms later the cancellation's scrollend
// arrives and ARMS the menu (arming was monotonic while open), and the dying scroll's last event
// closes it. Measured 4/4 in a real engine with a real compositor fling: the menu stayed open for
// 10.3ms, about one frame. That is exactly what the owner saw — case B "flashes open then closed",
// case A "never opens" because the close lands inside the open's own frame and nothing paints.
// ⚠ Sampling the flag EARLIER does not fix it, and that dead end was measured too: the selector
// already opens on pointerdown, so "at open" is already "at finger-down". The re-arm is the killer.
// ⚠ And the shipped version passed in Chromium, which orders pointerdown before scrollend and emits
// no trailing scroll after a cancel. Passing on one engine and failing on another WAS the diagnosis:
// the rule rested on engine-specific event ordering. Do not reintroduce a scrollend-based boundary.
//
// WHAT IT DOES INSTEAD: reads the boundary from the GAP BETWEEN DOCUMENT SCROLL EVENTS. A running
// scroll of any kind — momentum fling, CSSOM smooth scroll, finger drag, our own accordion writer —
// emits an event every animation frame. So "an event fired less than a gap ago" IS "in flight", and
// "this event arrived after a gap" IS "a new sequence". Both questions are answered from events
// that ALREADY HAPPENED, which the opening touch cannot retroactively rewrite. That is the whole
// point: the past is the one thing the finger cannot change.
//
// Premise, and it was verified on the owner's actual hardware before this was written: iOS delivers
// document scroll events CONTINUOUSLY through momentum. (Check used: the guide page's edge shading
// is painted from a window scroll listener, and it fades smoothly all the way through a flick's
// glide rather than snapping at the end.)
//
// ⚠ THE ONE CONSTANT. SCROLL_GAP_MS is a tuned number, and this project has killed tuned numbers in
// this exact area twice. It survives here because it is MEASURED, not guessed, and the margin is
// enormous: the largest gap observed WITHIN any live sequence was 18.5ms (momentum 15-18.5ms,
// smooth scroll 15-18.5ms), against a threshold of 150ms — 8x headroom. It is bounded on the other
// side by human tapping speed: the gap between a user's scroll stopping and their next deliberate
// scroll is far more than 150ms. A rAF poll was the constant-free alternative and it was measured
// to report "static" DURING live flight (rAF callbacks run before that frame's scroll event), i.e.
// it failed in the exact direction that dismisses the menu you just opened. Do not reintroduce it.
//
// ALWAYS ON, and it has to be: the answer must ALREADY be known at open time, so the listener is
// installed at module load, not while a menu is open. One passive listener writing two fields. It
// is no longer feature-gated — there is no capability to detect, so every engine takes one path.
//
// OUR OWN JUMPS still speak for themselves. An instant scroll is COMPLETE the moment scrollTo
// returns, so after one of them there is, as a matter of fact, no scroll in flight — scrollWindowTo
// says so rather than waiting to infer it. And because a jump that MOVED the page makes the engine
// dispatch a scroll a task later, it records that one event is already spoken for; the listener
// spends that claim instead of treating the echo as live motion. It records the claim only when the
// page actually moved (compared after the call, so after any clamping): a jump that changed nothing
// fires no event, and a claim left outstanding would be spent on the user's next real scroll.
// ⚠ Note what is NO LONGER a hazard: the old version could STRAND its flag at true forever if a
// sequence never delivered its scrollend, which is why the header used to carry a long section on
// latching. A gap-based reading cannot latch — it decays on its own the moment events stop.
//
// THE ONE window.scrollTo THAT STAYS BARE is the guide accordion's per-frame scroll writer
// (components/GuidePage): it is not a jump that PLACES the page, it is the app RUNNING a scroll
// animation, and its frames are precisely the "in flight" this module exists to describe. Clearing
// on every frame would make an accordion glide look stationary and dismiss a menu opened during it.
// tests/docScrollFlight pins the gap reading, the new-sequence test, and the jump's own echo.

// The gap that separates one scroll sequence from the next. See the constant note in the header:
// 8x the largest gap ever measured inside a live sequence, and far under a human's re-scroll delay.
export const SCROLL_GAP_MS = 150

// When the most recent document scroll event arrived, and whether it STARTED a sequence.
let lastScrollAt = -Infinity
let startedSequence = false
// One outstanding claim on the next document scroll event: set by a scrollWindowTo that MOVED the
// page, spent by that jump's own echo (see the header). Never more than one — a second jump before
// the first echo arrives simply re-states the same fact, that the newest jump is the last word.
let jumpEchoPending = false

// True while a scroll sequence is running: an event arrived less than a gap ago.
export function isDocScrollInFlight(): boolean {
  return performance.now() - lastScrollAt < SCROLL_GAP_MS
}

// True when the most recent document scroll event was the FIRST of a new sequence — i.e. the user
// (or the page) started scrolling just now, rather than a sequence already underway continuing.
// This is what lets an open menu distinguish "the scroll I was opened during" from "a scroll you
// have just started", without ever asking when a scroll ended.
export function isNewDocScrollSequence(): boolean {
  return startedSequence
}

// scrollWindowTo — the app's ONE door for an instant window jump. Identical to window.scrollTo plus
// the truth it establishes: after it returns the page is where we put it and nothing is moving.
export function scrollWindowTo(x: number, y: number): void {
  const fromX = window.scrollX
  const fromY = window.scrollY
  window.scrollTo(x, y)
  jumpEchoPending = window.scrollX !== fromX || window.scrollY !== fromY
  lastScrollAt = -Infinity
  startedSequence = false
}

// A page scroll is fired at the Document and bubbles to the window; documentElement is accepted too
// because WebKit has been seen to target it instead, and an element-targeted scroll does NOT bubble
// — which is also why this listens in the CAPTURE phase. Element scrolls (the settings popover's
// inner wrapper, the Lookup list) are not document scrolls and are ignored. Exported because the
// panel's own dismiss listener in components/CustomSelect needs the identical test, and two copies
// of one predicate are one copy too many.
export const isDocumentScroll = (e: Event) =>
  e.target === document || e.target === document.documentElement

if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    (e) => {
      if (!isDocumentScroll(e)) return
      if (jumpEchoPending) {
        // Our own jump's echo: a scroll that was over before this event was dispatched.
        jumpEchoPending = false
        lastScrollAt = -Infinity
        startedSequence = false
        return
      }
      const now = performance.now()
      startedSequence = now - lastScrollAt >= SCROLL_GAP_MS
      lastScrollAt = now
    },
    { capture: true, passive: true },
  )
}
