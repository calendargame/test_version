import type { ReactNode } from 'react'

// Expander — slides its children open/closed via the CSS grid-template-rows 0fr→1fr idiom
// (index.css: .expander / .expander-open / the min-height:0 + overflow:hidden row div).
//
// The wrapper is a one-row grid whose track tweens 0fr⇄1fr off the .expander-open class. The
// browser lays the track out at the TRUE content height, so opening and closing both travel the
// full distance in the same uniform duration — the old measured max-height cap's timing flaws
// (short panels finishing their capped tween early; closing spending dead time collapsing unused
// cap headroom before anything visibly moved) are gone by construction. So is the
// measurement-rounding clipping class (the 2026-06-08 retina bottom-border shave): at open rest
// the track equals the content by LAYOUT, not by a measured px snapshot, so nothing can round a
// hair short — which retires all of the old JS (the scrollHeight measure + 2px open buffer, the
// transitionend/timeout release to `max-height:none`, the reflow-pinned close). Reduce Motion
// needs no JS either: the CSS duration is calc(.28s * var(--motion-scale)), which collapses to 0s
// under the OS setting, and a 0s transition is an instant snap — open and close alike. An
// initially-open panel renders with .expander-open on first paint (no animation, no clip), a
// mid-flight reversal retargets smoothly from the current interpolated height (native CSS
// transition behavior), and content stays mounted (and queryable) in both states. Pure
// presentational — no app state.
//
// Extracted from main.jsx in Stage C, Step 4a; rewritten from the max-height technique to the
// grid idiom in Q4 (round 6, 2026-07-18).
export default function Expander({ open, children }: { open: boolean; children?: ReactNode }) {
  return (
    <div className={`expander${open ? ' expander-open' : ''}`}>
      <div>{children}</div>
    </div>
  )
}
