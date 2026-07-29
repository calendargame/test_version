import { useLayoutEffect, useState } from 'react'
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

// ── The edge arithmetic — ONE owner (round 10 item B) ────────────────────────────────────────
// Everything downstream of "where is this scroller relative to its two edges" is derived from
// scrollEdgeGaps, and nothing re-derives it: the two booleans that drive the mask fades, and the
// continuous --shade that drives the boundary shadows and the guide's soft edges, all read the
// same pair of numbers. That is the whole point of the function existing. Before this round the
// same expression was written out three times (here, and twice in main.tsx's bespoke effect), and
// a progressive shadow computing "how far from the bottom" independently of the mask's atBottom
// was how the two would have started disagreeing: a popover that overflows by 3px is shadowless
// today because of the dead band below, and under a naive continuous rule it would have grown a
// permanent ~12% footer shadow while the bottom mask — still banded — stayed off. One boundary,
// two answers. Not possible from here.
//
// The gaps are px of unreached content at each edge, clamped at 0 so iOS rubber-band overscroll
// (negative scrollTop at the top, a negative remainder at the bottom) reads as "you are at the
// edge" rather than going negative.
export type ScrollEdgeGaps = { top: number; bottom: number }

// A scroller with nothing to scroll has no edges to signal, so both gaps collapse to 0. The 1px
// slack absorbs the sub-pixel difference between a fractional content height and a fractional box
// height — without it a region that fits exactly reports a fraction of a pixel of overflow and
// paints indicators forever.
export function scrollEdgeGaps(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): ScrollEdgeGaps {
  if (scrollHeight <= clientHeight + 1) return { top: 0, bottom: 0 }
  return {
    top: Math.max(scrollTop, 0),
    bottom: Math.max(scrollHeight - scrollTop - clientHeight, 0),
  }
}

// The bottom dead band: within 4px of the end counts as arrived. It exists because the bottom gap
// is a DIFFERENCE of two measured numbers (scrollHeight − scrollTop − clientHeight), so fractional
// layout, zoom and the browser's own scroll clamping leave a couple of stray pixels on a scroller
// the user has scrolled fully to the end — and a footer shadow that never quite goes away is worse
// than one that gives up a hair early. The top edge needs no twin: scrollTop 0 is exact, not a
// difference, so isScrolledFromTop tests > 0.
export const BOTTOM_EDGE_BAND_PX = 4
export const isAtBottom = (gaps: ScrollEdgeGaps): boolean => gaps.bottom <= BOTTOM_EDGE_BAND_PX
export const isScrolledFromTop = (gaps: ScrollEdgeGaps): boolean => gaps.top > 0

// gap → --shade, the 0…1 strength of that edge's boundary shadow (index.css). The band is that
// edge's "arrived" tolerance, so the ramp starts where the boolean flips and the two can never
// contradict each other: shade > 0 exactly when the edge is live. rampPx is --fade-h, read once
// per listener attach — CSS cannot do this arithmetic itself (calc() has no length ÷ length), so
// the number crosses into JS rather than being duplicated as a literal.
// If rampPx fails to parse the ramp DEGRADES TO THE BOOLEAN — full strength the moment the edge
// is live — which is the pre-round-10 behaviour, never a missing shadow.
export function edgeShade(gap: number, band: number, rampPx: number): number {
  if (gap <= band) return 0
  const span = rampPx - band
  return span > 0 ? Math.min((gap - band) / span, 1) : 1
}

// --fade-h is a literal px token on :root (index.css), so it cannot fail to parse anywhere that
// serves the stylesheet; the guard in edgeShade covers the environment that serves none (jsdom).
export const readShadeRampPx = (): number =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fade-h'))

// The ONE way --shade reaches the DOM. A custom property set straight on the element, NOT React
// state: a state update per scroll frame would re-render the whole host component to move a
// shadow. This write invalidates style for one element and touches no layout (box-shadow and
// opacity are paint-only), and it is skipped outright when the rounded value has not changed —
// which is most frames, since a scroller more than --fade-h from both edges sits pinned at 1 and
// one at rest sits pinned at 0. So there is no rAF throttle and deliberately so: scroll events
// are already coalesced to at most one per frame, and deferring the write by a frame would put
// the shadow one frame behind the content — reintroducing, in miniature, the lag this replaced.
// 3 decimals is ~1/1000 of the shadow's alpha, far below any perceptible step.
export function writeShade(el: HTMLElement | null | undefined, shade: number): void {
  if (!el) return
  const next = shade.toFixed(3)
  if (el.style.getPropertyValue('--shade') !== next) el.style.setProperty('--shade', next)
}

// Scroll-edge state for one scroll region: which edges have content extending past them.
//   scrolledFromTop → feed the top fade mask
//   atBottom        → feed the bottom fade mask
// plus the continuous --shade written onto whichever boundary surfaces the host names:
// topShadeRef gets the top edge's strength (a layered header's elev-shadow-down), bottomShadeRef
// the bottom edge's (a sticky footer's elev-shadow-up). Both optional — the changelog popup has
// fades and no boundary surface at all. They are POSITIONAL REFS rather than one options object
// on purpose: eslint.config.js runs react-hooks/exhaustive-deps at ERROR, an object literal at the
// call site would be demanded in the dep array, and a fresh literal each render would re-attach
// the listener and the ResizeObserver on every render. Ref identities are stable, so the deps stay
// honest with no memo and no dependence on the React Compiler.
// `active` gates the listener. Truthy = attach; the effect re-runs whenever `active`'s IDENTITY
// changes, so hosts whose region mounts with content pass the content itself (LookupCard passes
// its history array — a change re-attaches to the freshly (re)mounted list) and overlay hosts
// pass their open flag. The DETACH CLEANUP snaps the flags back to the defaults (scrolledFromTop
// false, atBottom true) and the shades to 0 — the reset lives there, not in the effect body (a
// synchronous body setState cascades an extra render; react-hooks/set-state-in-effect fails the
// lint gate on it), so a closed region is already clean and reopening never flashes stale
// indicators.
// A scroll listener tracks the user; a ResizeObserver on the element catches content growing
// or shrinking in place (e.g. the history list gaining its tenth entry mid-view).
// A LAYOUT effect, matching the app-scroller effect in main.tsx that already argues the point:
// evaluated after paint, a region would show one frame with no fade and no boundary shadow before
// the indicators arrive. That frame is cheap to avoid and it is the frame the eye lands on when a
// popover opens.
export function useScrollEdgeState<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: unknown,
  topShadeRef?: RefObject<HTMLElement | null>,
  bottomShadeRef?: RefObject<HTMLElement | null>,
): { scrolledFromTop: boolean; atBottom: boolean } {
  const [atBottom, setAtBottom] = useState(true)
  const [scrolledFromTop, setScrolledFromTop] = useState(false)
  useLayoutEffect(() => {
    // The boundary surfaces are captured HERE, not read per frame off the refs: React attaches
    // child refs before a parent's layout effect runs, so they are already the elements this
    // attachment is about — and anything that could replace one (a region mounting with different
    // content) changes `active` and re-runs the whole effect. Capturing is also what lets the
    // cleanup reset the surfaces it actually wrote to, which is the rule react-hooks enforces.
    //
    // ⚠ CAPTURED BEFORE THE GUARDS, and the no-scroller path RESTS THEM AT 0. A boundary surface
    // exists whether or not there is a scroller to track: Lookup renders its History header and
    // its Show Codes section unconditionally, but the <ul> they bracket only exists once there is
    // at least one entry. Bailing without writing left `--shade` at @property's initial-value of
    // 1 — a full-strength 50%-black shadow above and below an empty "No lookups yet" panel, on
    // every cold start of a fresh install, self-healing after the first lookup so a casual pass
    // misses it. The initial-value of 1 is there for a boundary with NO writer at all (so an
    // engine without @property degrades to the old always-on look, never to a missing shadow) —
    // NOT for one whose writer simply has nothing to measure. This is the rule scrollEdgeGaps
    // already states: nothing to scroll means no edges to signal, so both gaps collapse to 0.
    const topEl = topShadeRef?.current ?? null
    const bottomEl = bottomShadeRef?.current ?? null
    const el = active ? ref.current : null
    if (!el) {
      writeShade(topEl, 0)
      writeShade(bottomEl, 0)
      return
    }
    const rampPx = readShadeRampPx()
    const evaluate = () => {
      const gaps = scrollEdgeGaps(el.scrollTop, el.scrollHeight, el.clientHeight)
      setAtBottom(isAtBottom(gaps))
      setScrolledFromTop(isScrolledFromTop(gaps))
      writeShade(topEl, edgeShade(gaps.top, 0, rampPx))
      writeShade(bottomEl, edgeShade(gaps.bottom, BOTTOM_EDGE_BAND_PX, rampPx))
    }
    evaluate()
    el.addEventListener('scroll', evaluate, { passive: true })
    const ro = new ResizeObserver(evaluate)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', evaluate)
      ro.disconnect()
      // Deactivation reset. The FLAGS can only reset here — they are React state, and writing
      // them from the effect body would trip react-hooks/set-state-in-effect (a CI error here).
      // The SHADES reset in both places: here on teardown, and in the no-scroller path above,
      // because writeShade is a direct DOM write with no such constraint and an untracked
      // surface has to rest at 0 rather than at @property's initial 1.
      setAtBottom(true)
      setScrolledFromTop(false)
      writeShade(topEl, 0)
      writeShade(bottomEl, 0)
    }
  }, [ref, active, topShadeRef, bottomShadeRef])
  return { scrolledFromTop, atBottom }
}
