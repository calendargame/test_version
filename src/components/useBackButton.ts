import { useEffect, useRef } from 'react'

// Back-button manager for dismissable overlays (Q1 — Android hardware Back; round-7 Q3 — starving
// the iOS PWA swipe-history).
//
// Everywhere WITH a Back affordance (Android hardware Back, desktop browsers, any Safari/Chrome
// tab), Back with an overlay open (the mode menu, ⚙ Settings, Show Codes, How-to-Play) should
// close that overlay — not exit the whole app. So each open overlay pushes ONE history entry:
// pressing Back fires `popstate`, which closes the TOP-most overlay (the browser already popped
// its entry). Closing an overlay via the UI instead steps BACK past its entry with a guarded
// `history.back()` — the entry itself survives as a dead forward entry (history.back() cannot
// delete; see the bounce below) — keeping position in lockstep with what's open. When nothing is
// open, Back does its normal thing (leaves the app). A single module-level popstate listener
// drives a LIFO stack, so nested overlays close one at a time, newest-first. In a browser tab the
// entries help beyond the hardware button — a back-swipe closes the overlay instead of leaving
// the site.
//
// The iOS INSTALLED app (home-screen PWA) is the deliberate exception (IOS_STANDALONE below). It
// has no Back affordance to serve, yet iOS home-screen apps honor edge swipes over the history
// stack: a back-swipe would "close" an overlay as a page-slide off a stale snapshot, and every UI
// close leaves a DEAD forward entry the next forward-swipe navigates into (the dead-navigation
// ping-pong), entries accumulating all session. Apple provides no gesture opt-out for home-screen
// web apps (w3c/manifest#1041, open since 2022; overscroll-behavior / touch-action never reach
// the system gesture), so the root-cause fix is to never CREATE entries there: pushOverlay skips
// pushState and popOverlay skips history.back() — pure stack bookkeeping — leaving the history at
// ONE entry forever, which makes both swipe directions inert (nothing to traverse to). Overlays
// still close via X / tap-outside / Esc, exactly as before. Android, desktop, and the iOS Safari
// TAB keep the old behavior byte-identical.

type Entry = { id: string; close: () => void }
const stack: Entry[] = []
let ignorePop = false

// iOS home-screen detection. `navigator.standalone` is a WebKit-only property (undefined on every
// other engine) that is true exactly in the installed-app case being starved. Deliberately NOT
// display-mode:standalone alone — that also matches Android installs, which NEED the entries for
// hardware Back. Should navigator.standalone ever fail an on-device check on a future iOS, the
// fallback detection is matchMedia('(display-mode: standalone)').matches AND an iOS platform
// check.
const IOS_STANDALONE =
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// The module-level popstate listener, attached at import time rather than lazily on the first
// overlay: dead forward entries survive a same-tab reload, so the dead-entry bounce below must be
// armed even before any overlay has opened in this page load.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    if (ignorePop) {
      ignorePop = false // this popstate came from our own history.back() — not a real Back
      return
    }
    // A real Back press: close the top-most overlay. The browser already popped its history entry,
    // and popping it from the stack HERE means the overlay's effect-cleanup popOverlay() finds it
    // gone and does NOT call history.back() again (which would over-pop). See useBackButton's
    // cleanup below.
    const top = stack.pop()
    if (top) {
      top.close()
      return
    }
    // Nothing is open, yet the entry landed on carries our marker: the user moved FORWARD onto the
    // dead entry of an already-closed overlay (a UI close backs past its entry but cannot delete
    // it). Bounce straight back — guarded, so the resulting popstate is swallowed above — instead
    // of parking the user where Back would need two presses. Unreachable under IOS_STANDALONE in
    // the steady state (no entries are ever created there), and left ungated on purpose: it also
    // self-heals entries a pre-Q3 build left in the session history.
    if (event.state?.cgOverlay) {
      ignorePop = true
      window.history.back()
    }
  })
}

function pushOverlay(id: string, close: () => void) {
  if (typeof window === 'undefined' || stack.some((e) => e.id === id)) return
  stack.push({ id, close })
  if (!IOS_STANDALONE) window.history.pushState({ cgOverlay: id }, '')
}

function popOverlay(id: string) {
  if (typeof window === 'undefined') return
  const i = stack.findIndex((e) => e.id === id)
  if (i === -1) return // already removed by a real Back press → nothing to undo (avoids over-popping)
  stack.splice(i, 1)
  if (IOS_STANDALONE) return // no entry was pushed for this overlay → no history to unwind
  ignorePop = true
  window.history.back() // remove the one history entry this overlay pushed (its popstate is ignored)
}

// Register `id` as an open overlay while `isOpen` is true; Back (or `popOverlay`) calls `close`.
// `id` must be stable + unique per overlay INSTANCE — use useId() for repeated components (dropdowns).
// `close` is read through a ref so changing its identity each render never re-runs the effect.
export function useBackButton(isOpen: boolean, close: () => void, id: string) {
  // Hold the latest `close` in a ref, updated POST-COMMIT (writing a ref during render trips the
  // React-Compiler-strict react-hooks/refs rule). The registered closure reads it lazily, on Back.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!isOpen) return
    pushOverlay(id, () => closeRef.current())
    return () => popOverlay(id)
  }, [isOpen, id])
}
