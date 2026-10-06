// ─────────────────────────────────────────────────────────────────────────
// engine/freeze.ts — an engine state, made unchangeable all the way down.
//
// The engine is a pure reducer: every transition returns NEW objects for what changed and shares the
// rest. Several things rest on that and cannot see it broken — React's bail-out on an unchanged
// state, a mode screen's effects keyed on `state.stats`, and above all engine/invariants, whose walk
// remembers which history cards have already passed its calendar tripwires by OBJECT IDENTITY
// (passedStack / passedForward): a card changed in place would keep its place in that memory and
// never be asked again. Nothing changes a state in place today. `deepFreeze` is what makes "today"
// "ever": on a frozen state an in-place write throws (every module here is strict), at the line that
// tried it.
//
// Who freezes:
//   • the fuzz survey (tests/engine/fuzzHarness) — every state it produces, before the next action
//     is applied, across every profile;
//   • a DEVELOPMENT build and the test suite (engine/useGameEngine, behind `import.meta.env.DEV`) —
//     every state the hook hands a screen, so a screen, a hook or a store that wrote into one would
//     throw in front of whoever wrote it;
//   • NOT production: `import.meta.env.DEV` is the literal `false` there, the branch is dropped and
//     this module with it (it has no side effects) — the app pays nothing, and behaves exactly as it
//     did.
//
// ★ INCREMENTAL: an object that is already frozen is not entered again. A reducer's result shares
// almost everything with the state before it, which was frozen on the way in — so freezing it costs
// the objects the transition made (a state, a stats record, a history array and the one entry that
// changed) plus one frozen-or-not question per slot of each new array, never a walk of the history's
// cards. That skip is sound because this function is the only thing that freezes engine data, and it
// never leaves an object frozen with something unfrozen underneath (it finishes the whole tree it
// enters).
// ─────────────────────────────────────────────────────────────────────────
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) deepFreeze(value[i])
  else for (const k in value) deepFreeze(value[k])
  return value
}
