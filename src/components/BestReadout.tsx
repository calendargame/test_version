import type { ReactNode } from 'react'
import { useActiveAmnesicMode } from '../store/amnesic.js'

// BestReadout — the row a round mode shows its all-time Bests in: Blitz's Best Score / Best Streak
// (components/BlitzBestRow, and the score-only sudden-death row in modes/BlitzMode) and MoX's Best
// Mean / Best Median (modes/AoxMode). One component because all three are the same row — the same
// spacing under the stats strip, the same small muted type — and because all three have to answer
// the same question the same way:
//
// ★ WILL THESE BESTS BE KEPT? Under Amnesic: Full they will not — they are the session's, gone when
// the app is closed — so the row wears the dashed outline (index.css's .session-only) that marks
// whatever on the page is temporary, and says so in words for a screen reader. Under Off they are
// the saved ones; under Stats Only they are the saved ones too, read from and written to the
// permanent copy (store/amnesic) — so on both of those the row is plain, and that difference from
// the stats strip above it (dashed on Stats Only AND Full) is exactly how the two kinds of Amnesic
// are told apart at a glance.
// ⚠ IT DOES NOT FOLLOW SAVE STATS, unlike the strip's dim. With Save Stats off no NEW Best is
// recorded, but the Bests shown are still real records, and under Full they are still the
// session's — so the outline still tells the truth about what is on screen.
// ⚠ IT READS THE VALUE ITSELF rather than taking a prop, so no mode screen can show a session's
// Bests unmarked by forgetting to pass one.
// The outline is a pseudo-element drawn OUTSIDE the row's box (.session-only-outset), so the row is
// the same size, in the same place, with or without it. index.css says how far outside, and why it
// cannot sit on the page column's edge the way a card's does.
export default function BestReadout({ children }: { children: ReactNode }) {
  const sessionOnly = useActiveAmnesicMode() === 'full'
  return (
    <div
      className={`mt-3 text-xs text-(--tx-300-60) ${sessionOnly ? 'session-only session-only-outset' : ''}`}
    >
      {/* `sr-only` is positioned out of flow, so the word costs no layout. First, so it is heard
          before the readouts it qualifies. */}
      {sessionOnly && <span className="sr-only">Bests are for this session only</span>}
      {children}
    </div>
  )
}
