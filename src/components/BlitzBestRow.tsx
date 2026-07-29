import type { BlitzBest } from '../store/progress.js'
import { NewBestStar } from './primitives.jsx'

// BlitzBestRow — the two-field Best Score / Best Streak row with ★ new-best flags and the
// Same Round / Different Rounds tag, shared by the two BlitzBest-shaped records: per-round
// (blitzBest) and per-question + Allow Mistakes (suddenAmBest, C3a). The tag renders only
// once BOTH round ids exist: same id = one exceptional round set both, different = two
// strong ones. (Per-question sudden death keeps its own score-only row — different shape.)
function BlitzBestRow({
  rec,
  newFlags,
}: {
  rec?: BlitzBest
  newFlags?: { score: boolean; streak: boolean }
}) {
  const newF = newFlags || { score: false, streak: false }
  const showTag = rec && rec.scoreRoundId != null && rec.streakRoundId != null
  return (
    <div className="mt-3 text-xs text-(--tx-300-60)">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[125px]">
          Best Score: {rec?.score ?? '—'}
          {newF.score && <NewBestStar />}
        </div>
        <div className="min-w-[125px]">
          Best Streak: {rec?.streak ?? '—'}
          {newF.streak && <NewBestStar />}
        </div>
        {showTag && (
          <span className="shrink-0 ml-auto">
            {rec.scoreRoundId === rec.streakRoundId ? 'Same Round' : 'Different Rounds'}
          </span>
        )}
      </div>
    </div>
  )
}

export default BlitzBestRow
