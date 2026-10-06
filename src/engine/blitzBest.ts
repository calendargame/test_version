// ─────────────────────────────────────────────────────────────────────────
// engine/blitzBest.ts — pure Best-record reconciliation for Blitz (the component wrapper layer).
//
// Blitz keeps a per-config Best Score / Best Streak record, updated when a round ends AND whenever a
// post-round Override edits the just-ended round's score (the BlitzMode `timerDone` effect re-runs on
// S.good / S.best changes). The record holds ONE {score, streak} pair plus the id of the round that
// set each field — which is what the Same Round / Different Rounds tag compares and what the ★ is
// derived from (engine/roundId's isNewBest).
//
// ★★ THE RECORD IS REBUILT FROM THE PRE-ROUND RECORD ON EVERY CALL, the way MoX's
// reconcileAoxStanding has always worked. The caller passes `pre` = the record that stood BEFORE this
// round began (snapshotted at Begin, BlitzMode's prevRoundBestRef), and each field is simply:
//     this round's value, tagged with this round,   if it beats the pre-round value;
//     otherwise the pre-round value WITH ITS OWN HOLDER.
// No "is this the same round?" question is ever asked, because the answer is structural: only THIS
// round can have moved the record since `pre` was taken (the config — the Best key — is locked while
// a round exists). That one rule covers the new high, the Override that raises it, the Override that
// drops it back (never below an earlier round — the cross-round rollback fix), and a drop all the way back.
// ⚠ WHAT IT REPLACED, and why: the old fold took the CURRENT record plus a numeric floor and, on a
// drop, wrote `max(good, floor)` while KEEPING the round's id — so when the floor won, an earlier
// round's score came back credited to the round that had just lost it (a wrong Same Round tag, and,
// now that ★ is derived from the id, a wrong ★). It also asked `cur.scoreRoundId === roundId` to
// recognise its own round, which a round-id counter that restarted at 1 on every screen load answered
// "yes" for a stranger's record — the lowering half of round 23's Amnesic contamination bug.
//
// `undefined` in either direction means NO RECORD: a round begun on a config with none, that has not
// beaten 0 on either field, leaves none behind (rather than a record of 0 that says a round scored
// nothing) — so a round overridden back to 0 removes the record it had created, as if it never scored.
// Extracted so it can be fuzzed directly against an independent oracle (tests/engine/blitzBest: the
// record == the max any round reached, held by the FIRST round to reach it). Pure — no React, no app
// state; `pre` is never mutated.
// ─────────────────────────────────────────────────────────────────────────

export interface BlitzBest {
  score: number
  streak: number
  scoreRoundId: number | null
  streakRoundId: number | null
}
export interface SuddenBest {
  score: number
  roundId: number | null
}

// Per-round (Blitz) — and per-question + Allow Mistakes — Best record after this round reached `good`
// (with engine best-streak `engBest`), tagged `roundId`, rebuilt from `pre` (the record before the
// round). Strict improvement: a round that only TIES a field leaves it with the round that got there
// first.
export function reconcileBlitzBest(
  pre: BlitzBest | undefined,
  good: number,
  engBest: number,
  roundId: number | null,
): BlitzBest | undefined {
  const preScore = pre?.score ?? 0
  const preStreak = pre?.streak ?? 0
  const scoreWins = good > preScore
  const streakWins = engBest > preStreak
  if (!pre && !scoreWins && !streakWins) return undefined
  return {
    score: scoreWins ? good : preScore,
    scoreRoundId: scoreWins ? roundId : (pre?.scoreRoundId ?? null),
    streak: streakWins ? engBest : preStreak,
    streakRoundId: streakWins ? roundId : (pre?.streakRoundId ?? null),
  }
}

// Per-question sudden-death Best record — score only; the same rebuild.
export function reconcileSuddenBest(
  pre: SuddenBest | undefined,
  good: number,
  roundId: number | null,
): SuddenBest | undefined {
  if (good > (pre?.score ?? 0)) return { score: good, roundId }
  return pre
}

// ── THE RECORD AS IT STANDS WITHOUT THIS ROUND — what every reconcile is rebuilt from ───────────────
// "Rebuild from the pre-round record" (above) rests on one claim: only THIS round can have moved
// the record since `pre` was taken. That is true of one screen in one tab, and it is false the
// moment the record has another writer — and it has two:
//   • ANOTHER TAB. A round ends here and is parked; the same preset is played in a second tab, which
//     saves a better Best; this tab is then reloaded. The saved record it loads is the other tab's —
//     and the restored round, rebuilding from the floor it parked with, wrote its own older result
//     straight over it.
//   • ANOTHER ROUND UNDER THE SAME RECORDS, while this one was parked (the Off and Stats Only values
//     of one preset share their Bests).
// So the floor is not the snapshot: it is the record AS IT STANDS (`cur`, read from the store at the
// moment of the write) with this round's own contribution taken back out. Field by field — a field
// this round holds (it carries this round's id, and ids never repeat: engine/roundId) goes back to
// what it was before the round (`pre`); every other field is whoever holds it now, which is the
// pre-round holder when nobody else has written, and the newcomer when somebody has.
// ★ WITH ONE WRITER THIS IS EXACTLY `pre` — the fields the round does not hold are the pre-round
// ones, untouched — so nothing changes for a round played and overridden in one tab; the fuzz in
// tests/engine/blitzBest holds that equality over random rounds. `undefined` when nothing is left
// (no record before the round, and nothing in the record that is not this round's).
// ⚠ What it cannot see is a write this tab's store never loaded: two tabs both open and both
// playing, neither reloaded, still save whole maps over each other (the store keeps no cross-tab
// merge). This closes the restore door; that one is the store's.
const mine = (holder: number | null, roundId: number | null): boolean =>
  roundId !== null && holder === roundId

export function blitzBestWithoutRound(
  pre: BlitzBest | undefined,
  cur: BlitzBest | undefined,
  roundId: number | null,
): BlitzBest | undefined {
  if (!cur) return undefined
  const scoreMine = mine(cur.scoreRoundId, roundId)
  const streakMine = mine(cur.streakRoundId, roundId)
  const rec: BlitzBest = {
    score: scoreMine ? (pre?.score ?? 0) : cur.score,
    scoreRoundId: scoreMine ? (pre?.scoreRoundId ?? null) : cur.scoreRoundId,
    streak: streakMine ? (pre?.streak ?? 0) : cur.streak,
    streakRoundId: streakMine ? (pre?.streakRoundId ?? null) : cur.streakRoundId,
  }
  return rec.score === 0 && rec.streak === 0 ? undefined : rec
}

// The same for the sudden-death record, which is one field.
export function suddenBestWithoutRound(
  pre: SuddenBest | undefined,
  cur: SuddenBest | undefined,
  roundId: number | null,
): SuddenBest | undefined {
  if (!cur) return undefined
  return mine(cur.roundId, roundId) ? pre : cur
}
