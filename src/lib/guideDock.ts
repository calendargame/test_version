// lib/guideDock.ts — ONE SHADOW, UNDER WHICHEVER EDGE THE TEXT IS SLIDING BENEATH.
//
// How to Play has two edges that text can slide under: the fixed top bar's underside, and — while
// a section is open — the underside of that section's header, which docks flush against the bar
// and stays there as the section scrolls (components/GuidePage; index.css's .guide-head is the
// stick itself). A boundary shadow means "content is sliding under this edge", so at any moment
// only ONE of the two may wear it:
//
//   • while the open header is docked against the bar, the BAR'S shadow is off — what is directly
//     under the bar is the header, which is not sliding anywhere — and the HEADER wears the shadow
//     once the section's text is actually under it;
//   • while no header is docked, the bar's shadow is whatever the page's scroll position makes it,
//     exactly as on every other screen, and the header wears none.
//
// This file is that decision and nothing else: pure arithmetic over five numbers read off the
// screen, so the hand-off can be proved for every position without a layout engine (jsdom has
// none). The component measures and writes; it decides nothing.
//
// ── THE THREE DISTANCES ─────────────────────────────────────────────────────────────────────
// All in px, all in viewport coordinates, all read in the same frame:
//
//   depth   how far the stick has carried the header DOWN from its natural spot in its section
//           (headerTop − naturalTop). 0 until the header docks; from then on it is exactly how much
//           of the section has scrolled up under the header.
//   room    how much of the section is still BELOW the header (floorY − headerBottom). A sticky
//           header cannot leave its own section, so when this reaches 0 the section's foot has
//           arrived and starts carrying the header up under the bar with it.
//   offset  how far the header's top is from the bar's underside (|headerTop − lineY|), either way:
//           below it while the header is still on its way up the page, above it while the section's
//           foot is carrying it out.
//
// ── THE TWO STRENGTHS, AND WHY THEY CAN NEVER BOTH BE ON ────────────────────────────────────
//
//   header   = the weaker of ramp(depth) and ramp(room). Text has to be under the header for it to
//              cast a shadow (depth), and there has to be section left below it for the shadow to
//              fall on (room) — it fades out over the section's last stretch rather than vanishing
//              when the foot arrives.
//   barYield = ramp(offset): the fraction of its own shadow the bar keeps. 0 with the header docked
//              flush, back to 1 once the header is a ramp's length away in either direction — so
//              the bar's shadow fades out as an opening section glides up to dock, and fades back
//              in as a finished section slides away under the bar. The caller multiplies the bar's
//              ordinary scroll-driven strength by it.
//
// The ramp is the app's one "near a boundary" distance (--fade-h, components/scrollRegion's
// edgeShade), so both shadows speak the language every other boundary shadow speaks.
//
// A header casts a shadow only while it is STUCK (depth > 0 and room > 0), and a stuck header's top
// is on the line (offset 0), where the bar keeps nothing. A header off the line is either not yet
// docked (depth 0) or being carried out (room 0), and casts nothing. So the two are never on
// together, at any position — and the function ENFORCES that rather than trusting it: whenever the
// header's strength is above 0 the bar's share is 0 outright, so no sub-pixel disagreement between
// two measured rectangles can ever light both.
//
// There is also no position with NEITHER while text is under an edge: off the line the bar keeps a
// share of its shadow; on the line, the header's shadow is on whenever text is under the header.
// The one place both are 0 is a header docked with nothing under it yet — a section just opened —
// which is exactly the case that must not look pinned.
import { edgeShade } from '../components/scrollRegion.js'

// A docked header counts as having text under it only past this depth. A section that has just been
// opened is glided to the line and lands on a whole pixel (lib/accordionMotion ceils its target, and
// says why), which can leave the header carried a fraction of a pixel down its section — over the
// first sliver of the panel's own empty top padding, not over text. One pixel absorbs that, so a
// freshly opened section shows no shadow at all, and it is far inside the padding (4px) that sits
// above the first line of text.
export const DOCK_SETTLE_PX = 1

// Within this much of the line the header counts as ON it. The header's rectangle and the bar's are
// two separate fractional measurements of what layout treats as one line; half a pixel is far more
// than they can disagree by and far less than anyone can see.
export const DOCK_LINE_BAND_PX = 0.5

export interface HeaderDockGeometry {
  /** The bar's underside — the line a header docks against. */
  lineY: number
  /** The open header's rectangle, top and bottom. */
  headerTop: number
  headerBottom: number
  /** Where the header's top would be with no stick: its section's top edge, inside the border. */
  naturalTop: number
  /** The lowest the header's bottom can reach: its section's bottom edge, inside the border. */
  floorY: number
}

export interface DockShades {
  /** The open header's own shadow strength, 0…1. */
  header: number
  /** The share of its ordinary shadow the bar keeps, 0…1. */
  barYield: number
}

/** With no header to consider — no section open, or the guide off screen — the bar is unaffected. */
export const NO_DOCK: DockShades = { header: 0, barYield: 1 }

export function dockShades(g: HeaderDockGeometry, rampPx: number): DockShades {
  const depth = g.headerTop - g.naturalTop
  const room = g.floorY - g.headerBottom
  const header = Math.min(edgeShade(depth, DOCK_SETTLE_PX, rampPx), edgeShade(room, 0, rampPx))
  if (header > 0) return { header, barYield: 0 }
  // A line that cannot be measured (no bar to read) leaves the bar's shadow exactly as it is.
  const offset = Math.abs(g.headerTop - g.lineY)
  return {
    header: 0,
    barYield: Number.isFinite(offset) ? edgeShade(offset, DOCK_LINE_BAND_PX, rampPx) : 1,
  }
}
