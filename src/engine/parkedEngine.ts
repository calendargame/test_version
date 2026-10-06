// ─────────────────────────────────────────────────────────────────────────
// engine/parkedEngine.ts — THE RESTORE DOOR: the one way a parked engine state comes back.
//
// Two stores park whole engine states in sessionStorage for the browsing session: store/sessionRound
// (an ended Blitz round / MoX run) and store/sessionHistory (a casual mode's history). Every one of
// them comes back through `restoreParkedEngine` below — each timed mode calls it on its parked
// snapshot at mount, and engine/parkedHistory calls it for the casual modes — BEFORE anything reads
// the state, so a screen's own fields and its engine are kept or dropped together, never one without
// the other.
//
// ★ A PARKED BLOB IS UNTRUSTED, and the door's whole job is to say so. sessionStorage is per ORIGIN,
// and the live site and the staging build share one (calendargame.app/test_version/) — so a build
// this one has never heard of can have written the slot, and a reload keeps it. Unguarded, the first
// bad read threw inside the engine's lazy initializer at mount, and since the blob outlives the
// reload, every reload died the same way for the rest of the browsing session: a mode screen bricked
// until the tab was closed.
//
// ⚠ THERE IS NO MIGRATION HERE, AND THAT IS DELIBERATE. Both slots are keyed by a name only builds
// with TODAY'S engine shape have ever written (`cg-round-v2`, `cg-history-v1`); the older shapes
// lived under a key this build does not read. A later build that changes the shape changes the key,
// and anything else that turns up in a slot is refused below rather than guessed at.
//
// ★ THE ONE THING THE DOOR COMPLETES: A CARD'S CALENDAR (CardMeta.jul). Builds up to v2.27.3 share
// these slots and this shape, and judged a card without recording which calendar they judged it in —
// and one of them can be loaded in this tab between two loads of this build, so an unstamped card
// can turn up at any time, not once. Such a card is not refused and not guessed at: its own grid is
// the record of the judgement (withCalendars, below).
// ─────────────────────────────────────────────────────────────────────────
import { checkGameInvariants } from './invariants.js'
import { correctIndexOf } from './gameReducer.js'
import { captureError } from '../observability/sentry.js'
import type { CardMeta, GameState, Question, StackEntry } from './gameReducer.js'
import type { Btns } from './answerButtons.js'

/** Is this a non-null object — the first question asked of anything read back out of storage. */
export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

// ── THE CALENDAR OF A CARD AN OLDER BUILD JUDGED ─────────────────────────────────────────────────
// The answer that build marked on the card's grid — its green, or the 'override-wrong' an Override
// left on the answer — IS the judgement, so the card's calendar is whichever one that answer belongs
// to. Read off the grid, in this order:
//   • the marked answer is the date's weekday in exactly ONE calendar → that calendar. Exact: the
//     card keeps the green it was given, and its codes now arrive at it. (This is the card the stamp
//     exists for — drawn under one setting, answered under the other — and that build would have
//     worked its codes in the wrong one.)
//   • the marked answer fits BOTH — the two calendars agree on that date's weekday (they do across
//     whole centuries), or the date is after the reform and has only one — or the grid marks no
//     answer yet (a live date holding only wrong picks) → the calendar the date was drawn under,
//     which is the one that build judged it in unless the setting was switched in between; and,
//     failing that record, the setting now. The green cannot be wrong either way.
//   • a Deduction puzzle → the calendar it was built in, as for every puzzle (gameReducer's
//     calendarOf).
//   • the marked answer fits NEITHER calendar → no stamp: the card is not one this engine could
//     have produced, and the invariant walk refuses the whole blob for it, as it refuses a card whose
//     overridden grid and stored as-answered grid name different days (that build could override a
//     card under the other setting).
// So nothing an older build parked can come back showing a green its own codes contradict: the card
// is read in the calendar its green belongs to, or the history is dropped and the mode starts from
// its saved stats.
const markedAnswer = (btns: Btns | undefined): number | null => {
  for (const k in btns) if (btns[k] === 'correct' || btns[k] === 'override-wrong') return Number(k)
  return null
}
function calendarFromGrid(q: Question, btns: Btns | undefined, useJulian: boolean): boolean | null {
  const drawn = q._jul ?? useJulian
  if (q.type !== undefined) return drawn
  const marked = markedAnswer(btns)
  if (marked === null) return drawn
  const julian = marked === correctIndexOf(q, true)
  const gregorian = marked === correctIndexOf(q, false)
  return julian && gregorian ? drawn : julian ? true : gregorian ? false : null
}
// The card's record with its calendar, when the card has been judged (its grid is marked) and
// carries none; otherwise the very same record.
function stamped(
  meta: CardMeta,
  q: Question,
  btns: Btns | undefined,
  useJulian: boolean,
): CardMeta {
  if (typeof meta.jul === 'boolean' || !btns || Object.keys(btns).length === 0) return meta
  const jul = calendarFromGrid(q, btns, useJulian)
  return jul === null ? meta : { ...meta, jul }
}
// Every card of a parked state with its calendar. A state this build parked comes back as the same
// object: all of its judged cards are stamped already.
function withCalendars(state: GameState, useJulian: boolean): GameState {
  const entries = (list: StackEntry[]): StackEntry[] => {
    let out = list
    list.forEach((e, i) => {
      const meta = stamped(e.meta, e, e.btns, useJulian)
      if (meta === e.meta) return
      if (out === list) out = list.slice()
      out[i] = { ...e, meta }
    })
    return out
  }
  const stack = entries(state.stack)
  const forwardStack = entries(state.forwardStack)
  const card = stamped(state.card, state.date, state.persistBtns, useJulian)
  return stack === state.stack && forwardStack === state.forwardStack && card === state.card
    ? state
    : { ...state, stack, forwardStack, card }
}

// A parked blob in, today's engine state out, or null when the blob is not one. Null means "nothing
// is parked": the caller drops its WHOLE snapshot (its own fields ride on this engine, so a fresh
// engine under a restored "ended" screen would be a state no play reaches) and the mode comes up
// fresh — and the slot goes the way its store retires any other (a timed mode's mirror effect
// discards it on its first run; a casual history's is replaced the next time that screen parks).
//
// Two layers, and every rejection is reported with its reason (no honest path produces one) — an
// older build's judged cards being given their calendars in between (see the note above):
//   • the SHAPE check names every field the invariant walk and the first render need before they can
//     even be asked — a date, the history arrays, each card's Override record (the Override button
//     reads it on the first paint), the grid, the stats and their times;
//   • then the state must satisfy EVERY ENGINE INVARIANT (engine/invariants — the ledgers, every
//     card's Override record). That walk runs inside a catch, so a card deep in the history that is
//     not one (the shape check does not walk every field of every entry, and should not have to)
//     lands here too rather than on the error card.
export function restoreParkedEngine(
  blob: unknown,
  useJulian: boolean,
  mode: string,
): GameState | null {
  const reject = (reason: string, extra?: { error?: unknown; violations?: string[] }): null => {
    captureError(extra?.error ?? new Error(`Unreadable parked engine: ${reason}`), {
      where: 'restore-parked-engine',
      mode,
      reason,
      ...(extra?.violations ? { violations: extra.violations } : {}),
    })
    return null
  }
  if (!isObj(blob)) return reject('not an object')
  const stats = blob.stats
  if (!isObj(blob.date)) return reject('no date')
  if (!Array.isArray(blob.stack) || !Array.isArray(blob.forwardStack))
    return reject('no history arrays')
  if (![...blob.stack, ...blob.forwardStack].every((e) => isObj(e) && isObj(e.meta)))
    return reject('a history entry is not a card')
  if (!isObj(blob.card)) return reject('no card record')
  if (!isObj(blob.persistBtns)) return reject('no grid')
  if (!isObj(stats) || !Array.isArray(stats.times)) return reject('no stats')
  try {
    const state = withCalendars(blob as unknown as GameState, useJulian)
    const violations = checkGameInvariants(state, useJulian)
    if (violations.length) return reject('breaks an engine invariant', { violations })
    return state
  } catch (error) {
    return reject('the invariant check threw', { error })
  }
}
