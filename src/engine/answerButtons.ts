// ─────────────────────────────────────────────────────────────────────────
// engine/answerButtons.js — pure helpers for answer-grid button state.
//
// `btns` is a map { buttonIndex: state } where state is one of:
//   'correct' | 'wrong-latest' | 'wrong-prev' | 'override-wrong'.
//
// Shared by App (Classic/Flash/Blitz/Deduction handlers), AoxMode, and the game
// reducer — ONE copy. Pure (no app state, no React). Extracted from main.jsx in
// the mode-untangle (Stage C, Step 6) so the engine and the mode components can
// both import them (the reducer can't import from main.jsx — that'd be circular).
// ─────────────────────────────────────────────────────────────────────────
// A single answer-grid button's state, and the index→state map for a question.
export type ButtonState = 'correct' | 'wrong' | 'wrong-latest' | 'wrong-prev' | 'override-wrong'
export type Btns = Record<string, ButtonState>

// Does this answer state count as a credited (fully-correct) question?
// True iff a 'correct' is present and no wrong markings remain.
export const computeHasCredit = (btns: Btns | null | undefined): boolean => {
  if (!btns) return false
  const vals = Object.values(btns)
  return (
    vals.length > 0 &&
    vals.includes('correct') &&
    !vals.some((v) => v === 'wrong-latest' || v === 'wrong-prev')
  )
}

// Set button `idx` to `state`, demoting any existing 'wrong-latest' to 'wrong-prev'
// (so only the newest wrong shows bright red; older ones dim).
export const markBtns = (btns: Btns, idx: number, state: ButtonState): Btns => {
  const next = { ...btns }
  for (const k in next) {
    if (next[k] === 'wrong-latest') next[k] = 'wrong-prev'
  }
  next[idx] = state
  return next
}

// markBtns(..., 'correct'): mark idx correct, demoting prior wrongs.
export const mkBtnsWithCorrect = (btns: Btns, idx: number): Btns => markBtns(btns, idx, 'correct')

// The grid a card takes into HISTORY: a grid that holds a wrong and no green gets the green
// synthesized onto the answer (`correctIdx` — the caller's, so it is the answer in the card's own
// calendar: gameReducer's correctIndexOf under calendarOf), with any 'wrong-latest' dimmed to
// 'wrong-prev' as beside any other green. Every other grid comes back as it is — the same object.
// (This used to work the answer out for itself, from the calendar the date was DRAWN under — a
// second copy of correctIndexOf, and the one that put a green on a day the card was not judged by.)
export const greenOnMiss = (btns: Btns, correctIdx: number): Btns => {
  const vals = Object.values(btns)
  if (vals.includes('correct')) return btns
  if (!vals.some((v) => v === 'wrong' || v === 'wrong-latest' || v === 'wrong-prev')) return btns
  if (correctIdx < 0) return btns
  return mkBtnsWithCorrect(btns, correctIdx)
}
