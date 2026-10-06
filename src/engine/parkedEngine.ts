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
// ⚠ A DIFFERENT SHAPE IS NEVER MIGRATED, AND THAT IS DELIBERATE. Both slots are keyed by a name only
// builds with TODAY'S engine shape have ever written (`cg-round-v2`, `cg-history-v1`); the older
// shapes lived under a key this build does not read. A later build that changes the shape changes the
// key, and anything else that turns up in a slot is refused below rather than guessed at.
//
// ★ THE ONE THING THE DOOR COMPLETES, FOR ONE RELEASE: A CARD'S CALENDAR (CardMeta.jul). That is a
// field added to today's shape, not another shape: builds up to v2.27.3 write these same slots, and
// judged a card without recording which calendar they judged it in — and one of them can be loaded in
// this tab between two loads of this build, so an unstamped card can turn up at any time, not once.
// Such a card is not refused and not guessed at: its own grid is the record of the judgement
// (withCalendars, below).
// ⏰ TEMPORARY — IT IS REMOVED IN THE RELEASE THAT TURNS SEALING ON. A parked blob lives only for a
// browsing session, so the stamping is needed only while a build that does not stamp (v2.27.3 or
// older) can still be loaded in the same tab as this one — across the update to this release, and
// while the two sites are a release apart. The release after this one is published over builds that
// all stamp. It is the same release that deletes `SEAL_NEW_SILOS` in src/store/progressStorage.ts
// (the staged roll-out of the chunked solve-time layout), and the two removals point at each other so
// that whoever finds one finds the other. What goes then: the whole "calendar of a card an older
// build judged" section below (withCalendars and everything it calls) and its one call in
// restoreParkedEngine; WeekdayQuestion._jul in engine/gameReducer and the line in src/main.tsx's
// genDate that writes it (this section is its only reader); the "as an older build would have parked
// it" half of tests/engine/fuzzHarness; and the restore-door block of tests/engine/cardCalendar. An
// unstamped judged card is then refused by the invariant walk like any other card this engine could
// not have produced.
// ─────────────────────────────────────────────────────────────────────────
import { checkGameInvariants } from './invariants.js'
import { correctIndexOf } from './gameReducer.js'
import { isJulianOnlyDate } from '../lib/calendar.js'
import { captureError } from '../observability/sentry.js'
import type { CardMeta, GameState, Question, StackEntry } from './gameReducer.js'
import type { Btns, ButtonState } from './answerButtons.js'

/** Is this a non-null object — the first question asked of anything read back out of storage. */
export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

// ── THE CALENDAR OF A CARD AN OLDER BUILD JUDGED ─────────────────────────────────────────────────
// ⏰ TEMPORARY: this whole section goes in the release that turns sealing on and deletes
// `SEAL_NEW_SILOS` (src/store/progressStorage.ts) — see the header.
//
// In this build a card has ONE calendar, fixed by the first thing that judges it. An older build
// judged each time by the setting of that moment, and kept no record — but the card's grid AS THE
// PLAYER LEFT IT is the record of those judgements: the grid itself, or, for a card an Override has
// flipped, the as-answered grid stored under it (CardMeta.answered). So the calendar is read off
// that grid, by what it says, strongest first:
//   1. THE ANSWER IT MARKS (its green) decides, when it marks one: the calendar that has the date
//      and whose answer that is. Exact — the card keeps the green it was given, and its codes now
//      arrive at it. (This is the card the stamp exists for: drawn under one setting, answered under
//      the other; that build would have worked its codes in the wrong one.) An answer that is the
//      date's weekday in NEITHER calendar, or two marked answers that no one calendar explains, is
//      no card this engine could have produced: no stamp, and the invariant walk refuses the blob —
//      the history is dropped and the mode starts from its saved stats.
//   2. …and when that leaves both calendars standing — the two agree on that date's weekday (they do
//      across whole centuries), the date is after the reform and has one reading, or the grid marks
//      no answer yet (a live date holding only wrong picks) — THE WRONG PICKS speak next: a calendar
//      whose answer the grid marks WRONG is not the one those picks were judged in, so when exactly
//      one calendar's answer is clear of a wrong mark, it is that one. (Without this a live card
//      could come back in the calendar whose answer the player had already been told was wrong.)
//   3. …then, for an overridden card, THE DAY THE OVERRIDE MARKED (its own grid is that answer
//      alone), when it is one calendar's and not the other's: the green that was on screen stays.
//   4. …then the calendar the date was drawn under — the one that build judged it in unless the
//      setting was switched in between — and, failing that record, the setting now. Nothing on the
//      card contradicts either.
//   A calendar that does not HAVE the date (lib/calendar's isJulianOnlyDate) is never in the running.
//   A Deduction puzzle is read in the calendar it was built in, as every puzzle is (gameReducer's
//   calendarOf).
//
// ★ AN OVERRIDDEN CARD'S OWN GRID IS THEN REBUILT IN THAT CALENDAR. That grid is not a record of
// anything the player did: by rule it is the card's answer alone, marked as a credit or as a credit
// taken away (gameReducer's toggleCard). An older build marked the answer of the setting at the
// press, which could be the other calendar's day than the one the card had been answered in — so an
// Undo brought back a green on a different day from the one the Override showed. The card's
// calendar is the one it was ANSWERED in (above), and its Override mark is moved onto that
// calendar's answer: the card comes back exactly as this build would have left it after the same
// play, and both of its states name one day. (Such a card used to be the whole reason an older
// build's history was refused across the update.)
// So nothing an older build parked can come back showing a green its own codes contradict.
const isWrongMark = (s: ButtonState | undefined): boolean =>
  s === 'wrong' || s === 'wrong-latest' || s === 'wrong-prev'
const isAnswerMark = (s: ButtonState | undefined): boolean =>
  s === 'correct' || s === 'override-wrong'
// Is `answer` every answer this grid marks? (True of a grid that marks none.)
const marksOnly = (btns: Btns, answer: number): boolean => {
  for (const k in btns) if (isAnswerMark(btns[k]) && Number(k) !== answer) return false
  return true
}
function calendarFromGrid(
  q: Question,
  btns: Btns,
  meta: CardMeta,
  useJulian: boolean,
): boolean | null {
  const julianOnly = isJulianOnlyDate(q.y, q.m, q.d)
  const drawn = julianOnly || (q._jul ?? useJulian)
  if (q.type !== undefined) return drawn
  const asAnswered = meta.answered?.btns ?? btns
  const julianDay = correctIndexOf(q, true)
  const gregorianDay = correctIndexOf(q, false)
  // 1 — the answer the as-answered grid marks.
  const julian = marksOnly(asAnswered, julianDay)
  const gregorian = !julianOnly && marksOnly(asAnswered, gregorianDay)
  if (julian !== gregorian) return julian
  if (!julian) return null
  if (julianDay !== gregorianDay) {
    // 2 — the wrong picks.
    const julianWrong = isWrongMark(asAnswered[julianDay])
    const gregorianWrong = isWrongMark(asAnswered[gregorianDay])
    if (julianWrong !== gregorianWrong) return gregorianWrong
    // 3 — the day the Override marked.
    if (meta.answered) {
      if (isAnswerMark(btns[julianDay]) !== isAnswerMark(btns[gregorianDay]))
        return isAnswerMark(btns[julianDay])
    }
  }
  return drawn
}
// An overridden card's own grid, on its calendar's answer: the same grid when it already is (or is
// not the single mark every overridden grid is — the invariant walk reports that one).
function overrideGridIn(q: Question, btns: Btns, jul: boolean): Btns {
  const marks = Object.keys(btns)
  const answer = correctIndexOf(q, jul)
  if (marks.length !== 1 || !isAnswerMark(btns[marks[0]]) || Number(marks[0]) === answer)
    return btns
  return { [answer]: btns[marks[0]] }
}
// A card with its calendar — its record stamped and, if it is overridden, its grid on that
// calendar's answer — when it has been judged (its grid is marked) and carries none; otherwise the
// very same grid and record.
function completed(
  q: Question,
  btns: Btns | undefined,
  meta: CardMeta,
  useJulian: boolean,
): { btns: Btns | undefined; meta: CardMeta } {
  if (typeof meta.jul === 'boolean' || !btns || Object.keys(btns).length === 0)
    return { btns, meta }
  const jul = calendarFromGrid(q, btns, meta, useJulian)
  if (jul === null) return { btns, meta }
  return {
    btns: meta.answered && q.type === undefined ? overrideGridIn(q, btns, jul) : btns,
    meta: { ...meta, jul },
  }
}
// Every card of a parked state with its calendar. A state this build parked comes back as the same
// object: all of its judged cards are stamped already.
function withCalendars(state: GameState, useJulian: boolean): GameState {
  const entries = (list: StackEntry[]): StackEntry[] => {
    let out = list
    list.forEach((e, i) => {
      const { btns, meta } = completed(e, e.btns, e.meta, useJulian)
      if (meta === e.meta) return
      if (out === list) out = list.slice()
      out[i] = { ...e, btns, meta }
    })
    return out
  }
  const stack = entries(state.stack)
  const forwardStack = entries(state.forwardStack)
  const { btns, meta } = completed(state.date, state.persistBtns, state.card, useJulian)
  return stack === state.stack && forwardStack === state.forwardStack && meta === state.card
    ? state
    : { ...state, stack, forwardStack, card: meta, persistBtns: btns ?? state.persistBtns }
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
