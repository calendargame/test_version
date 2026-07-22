import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

// The site-wide scroll-region treatment (round-7 Q5) — the ⚙ Settings recipe, extracted here so
// no scroll region can quietly diverge from it again (settings, the changelog popup, and the
// Lookup history list each once carried their own copy of parts of it, and each drifted). There
// is deliberately NO scrollbar CSS anywhere — the treatment is two halves, applied together:
//
//   1. The PADDING LANE. The card owns vertical padding only (py-4); the scroll region itself
//      carries the horizontal px-4. That puts the 1rem right padding INSIDE the scroller — a
//      text-free lane where the iOS overlay scrollbar paints clear of the content. (Padding on
//      the card instead would leave the scroller's right edge flush against the text, with the
//      scrollbar painting on top of it.)
//   2. The EDGE FADES. The fade-scroll-* masks (index.css) — top/bottom feathers that appear
//      exactly when content extends past that edge — driven by useScrollEdgeState below.
//
// SCROLLER_CORE_CLASS exists for the ONE scroller that is not an inner region: the app's main
// container (main.tsx appScrollRef), which fills the viewport, so its scrollbar already paints
// at the screen edge past the content wrapper's own px-4 — it takes the core without the lane
// (its fades still come from scrollFadeClass). The guide's document scroller is excluded
// entirely (owner call, 2026-07-19: the far-right document scrollbar already clears everything;
// its viewport fades are the doc-fade-* strips). tests/scrollRegionGuard.test.js fails the
// suite on any raw vertical-overflow literal outside this file, so every scroll region must
// come through these tokens.
export const SCROLLER_CORE_CLASS = 'overflow-y-auto overscroll-contain'
export const SCROLL_REGION_CLASS = `${SCROLLER_CORE_CLASS} px-4`

// The conditional fade-mask suffix for a scroll region's className, from the two edge flags.
// Both edges overflowing must yield the single combined class — CSS mask-image declarations
// don't stack across classes (see the index.css fade-scroll-both note). Branches carry their
// own leading space, the codebase's conditional-class idiom (a doubled space in a class
// attribute is meaningless to the browser and to Tailwind's scanner alike).
export const scrollFadeClass = (scrolledFromTop: boolean, atBottom: boolean): string =>
  scrolledFromTop && !atBottom
    ? ' fade-scroll-both'
    : scrolledFromTop
      ? ' fade-scroll-top'
      : !atBottom
        ? ' fade-scroll-bottom'
        : ''

// Scroll-edge state for one scroll region: which edges have content extending past them.
//   scrolledFromTop → feed the top fade (plus any header shadow the host pairs with it)
//   atBottom        → feed the bottom fade (plus any sticky-footer shadow)
// `active` gates the listener. Truthy = attach; the effect re-runs whenever `active`'s IDENTITY
// changes, so hosts whose region mounts with content pass the content itself (LookupCard passes
// its history array — a change re-attaches to the freshly (re)mounted list) and overlay hosts
// pass their open flag. The DETACH CLEANUP snaps both flags back to the defaults (scrolledFromTop
// false, atBottom true) — the reset lives there, not in the effect body (a synchronous body
// setState cascades an extra render; react-hooks/set-state-in-effect fails the lint gate on it),
// so a closed region is already clean and reopening never flashes stale indicators.
// A scroll listener tracks the user; a ResizeObserver on the element catches content growing
// or shrinking in place (e.g. the history list gaining its tenth entry mid-view).
export function useScrollEdgeState<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: unknown,
): { scrolledFromTop: boolean; atBottom: boolean } {
  const [atBottom, setAtBottom] = useState(true)
  const [scrolledFromTop, setScrolledFromTop] = useState(false)
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return
    const evaluate = () => {
      const noOverflow = el.scrollHeight <= el.clientHeight + 1
      setAtBottom(noOverflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
      setScrolledFromTop(!noOverflow && el.scrollTop > 0)
    }
    evaluate()
    el.addEventListener('scroll', evaluate, { passive: true })
    const ro = new ResizeObserver(evaluate)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', evaluate)
      ro.disconnect()
      // Deactivation reset (every path that ever set the flags attached here first, so this
      // cleanup is guaranteed to run before any reopen renders).
      setAtBottom(true)
      setScrolledFromTop(false)
    }
  }, [ref, active])
  return { scrolledFromTop, atBottom }
}
