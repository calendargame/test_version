// lib/accordionMotion.ts — the HTP accordion motion coordinator's pure math (Q8).
//
// Kept apart from the component (components/GuidePage.tsx) for the lib/selectionGuard
// reasons: the component file only exports components (the react-refresh rule), and every
// decision here is trivially unit-testable without rendering anything. GuidePage owns the
// DOM reads (rendered heights, rects, the --bar-h / --motion-scale vars) and the rAF
// scroll writer; this module owns what the numbers MEAN: how long a toggle takes, the
// curve the panels and the writer both run, and where the window scroll must land.

// ── Duration: d(h) = clamp(180ms + 0.14ms/px × h, 240ms, 440ms) ──────────────────────
// h = the animated content height in px. The guide's panel heights span an 18.5:1 range,
// far too wide for either one fixed duration (giants blur) or a pure per-px rate (giants
// crawl); the 180ms base + shallow 0.14ms/px slope + [240, 440] clamp compress the felt
// speed to a calm register — small panels never feel snippy (240ms floor: Classic), the
// giants stay under half a second (440ms cap, Material long1 territory: Deduction,
// Save Defaults, Buttons; Julian ≈ 329ms sits mid-slope). Rounded to whole ms: the value
// is stamped into inline styles and test pins, and sub-ms precision is imperceptible.
export const accordionMs = (heightPx: number): number =>
  Math.round(Math.min(440, Math.max(240, 180 + 0.14 * heightPx)))

// The twin-toggle shared clock: an exclusive-open accordion switch animates TWO panels
// (one closing, one opening) whose travels differ. One duration — d of the LARGER travel
// — applies to both: equal duration plus equal easing keeps the net layout delta a single
// monotonic curve, so the coordinator's scroll math stays exact and nothing wobbles.
// Single toggles pass 0 for the missing side, collapsing to d(h) of the real one.
export const accordionToggleMs = (closingH: number, openingH: number): number =>
  accordionMs(Math.max(closingH, openingH))

// ── Easing: the Material standard curve, cubic-bezier(.2,0,0,1) ──────────────────────
// Decelerate-dominant calm landings. ONE curve everywhere — both panels (.expander in
// index.css must declare this exact string; tests/expander.dom pins the sync), the
// GuideSection chevron, and the coordinator's scroll writer — so the collapse, the
// expansion, and the scroll ride a single coherent motion.
export const ACCORDION_EASE_CSS = 'cubic-bezier(.2,0,0,1)'

// The same curve numerically, for the rAF scroll writer. Control points P1=(0.2,0),
// P2=(0,1) give x(u) = 0.6u − 1.2u² + 1.6u³ and y(u) = 3u² − 2u³; easing evaluates
// y at the u where x(u) = t. x′(u) = 4.8u² − 2.4u + 0.6 has negative discriminant with
// a 0.3 minimum on [0,1], so x is strictly increasing and Newton's method from u = t
// converges safely (eight iterations lands far below any sub-pixel scroll tolerance).
export const accordionEase = (t: number): number => {
  if (t <= 0) return 0
  if (t >= 1) return 1
  let u = t
  for (let i = 0; i < 8; i++) {
    const x = 0.6 * u - 1.2 * u * u + 1.6 * u * u * u - t
    u -= x / (4.8 * u * u - 2.4 * u + 0.6)
    u = Math.min(1, Math.max(0, u))
  }
  return 3 * u * u - 2 * u * u * u
}

// ── Scroll target: where the window must land for the toggle to read as ONE motion ───
// All inputs are pre-computed geometry, fully known at tap time (before any animation):
//   scrollY       window scroll at the tap (may sit negative mid rubber-band)
//   viewportH     window.innerHeight
//   barH          the fixed top bar's height (--bar-h)
//   docH          the document's current scrollHeight
//   headerDocTop  the tapped section wrapper's current document-space top
//   closingH      the closing panel's current RENDERED height (0 when nothing closes;
//                 mid-flight re-toggles pass the interpolated value, keeping the math exact)
//   closingAbove  true when that panel sits above the tapped header, so its collapse
//                 pulls the header up by closingH
//   openingH      the opening panel's remaining travel to its natural height (0 when the
//                 tap only closes; its full body height at rest)
export interface AccordionToggleGeometry {
  scrollY: number
  viewportH: number
  barH: number
  docH: number
  headerDocTop: number
  closingH: number
  closingAbove: boolean
  openingH: number
}

// Returns the document-space scrollY the coordinator's writer should glide to, or null
// when the layout change leaves the current scroll position coherent (no writer runs —
// the panels animate in place and the browser holds still; the paired guide-scoped
// overflow-anchor:none rule in index.css guarantees "holds still" on every engine).
//
// Scenario A — a panel OPENS (owner rule): compensate ONLY when the opened panel's start
// (its header) would land off-screen above the fold. The comparison baseline is where the
// browser will have settled AFTER the toggle — scrollY clamped into the final scroll
// range — plus the bar the header must clear. Target: the header seated right below the
// bar. (The final-range clamps on the target are pure defense: A's own inequality already
// bounds it below the settled position.)
//
// Scenario B — the toggle SHRINKS the document past the current position: the browser
// would clamp scrollY the instant the panel finished, flinging the page in a single
// frame (the captured 744px/150ms clamp-fling). Gliding to the final max-scroll on the
// panels' own clock makes the collapse and the travel one coherent motion. Checked for
// closes AND as the fallback for a net-shrinking switch where A declined.
export const accordionScrollTarget = (g: AccordionToggleGeometry): number | null => {
  const finalDocH = g.docH - g.closingH + g.openingH
  const finalMaxScroll = Math.max(0, finalDocH - g.viewportH)
  if (g.openingH > 0) {
    const finalHeaderTop = g.headerDocTop - (g.closingAbove ? g.closingH : 0)
    const settledY = Math.min(Math.max(g.scrollY, 0), finalMaxScroll)
    if (finalHeaderTop < settledY + g.barH) {
      const target = Math.min(Math.max(finalHeaderTop - g.barH, 0), finalMaxScroll)
      return target === g.scrollY ? null : target
    }
  }
  if (g.scrollY > finalMaxScroll) return finalMaxScroll
  return null
}
