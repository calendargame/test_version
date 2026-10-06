// tests/engine/cardCalendar.test.js — ONE CARD, ONE CALENDAR (CardMeta.jul).
//
// A date on or before October 4, 1582 has two weekdays — its Julian one and its Gregorian one — and
// the Julian Calendar setting can be switched while a date is on screen. The defect this pins shut: a
// date drawn under one setting and answered under the other was judged by the setting at the answer
// and stored with the calendar it was DRAWN under, so browsing back to it showed a green answer and
// Show Codes for two different calendars.
//
// The rule now: the first thing that JUDGES a card stamps the calendar onto it, and everything that
// judges, shows or re-derives that card afterwards reads the stamp (gameReducer's calendarOf). These
// are the named cases — every judging action, every reader, and what the restore door does with a
// card an older build parked without a stamp. engine/invariants holds every state to the same rule
// and the fuzz's reference model keeps its own copy of it (tests/engine/referenceModel).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  gameReducer,
  initEngine,
  calendarOf,
  correctIndexOf,
} from '../../src/engine/gameReducer.js'
import { checkGameInvariants } from '../../src/engine/invariants.js'
import { buildRunBreakdown } from '../../src/engine/runBreakdown.js'
import { restoreParkedEngine } from '../../src/engine/parkedEngine.js'
import { restoreParked, parkedText } from '../../src/engine/parkedHistory.js'
import { captureError } from '../../src/observability/sentry.js'
import { wday, wdayJulian } from '../../src/lib/calendar.js'
vi.mock('../../src/observability/sentry.js', () => ({ captureError: vi.fn() }))
beforeEach(() => vi.mocked(captureError).mockClear())

// October 14, 1066 (Hastings): a Saturday in the Julian calendar it was fought under, another
// day in the Gregorian one projected back. Every case rests on the two DIFFERING, so that is asserted.
const J = wdayJulian(1066, 10, 14)
const G = wday(1066, 10, 14)
const OTHER = [0, 1, 2, 3, 4, 5, 6].find((i) => i !== J && i !== G) // wrong in both calendars
// `_jul` is the setting the date was DRAWN under. Nothing judges by it; the cases draw under the
// setting OPPOSITE to the one they answer under wherever that could matter.
const hastings = (drawn) => ({ y: 1066, m: 10, d: 14, _fmt: 'numeric-ymd', _jul: drawn })
const MODERN = { y: 2024, m: 1, d: 1, _fmt: 'numeric-ymd', _jul: true }

const act = (s, a) => gameReducer(s, { saveStats: true, tracking: true, elapsed: 1, ...a })
const answer = (s, idx, useJulian, nextDate = MODERN, extra = {}) =>
  act(s, { type: 'ANSWER', idx, useJulian, nextDate, ...extra })
const reveal = (s, useJulian) => act(s, { type: 'REVEAL', useJulian })
const codes = (s, useJulian) => act(s, { type: 'SHOW_CODES', open: true, useJulian })
const override = (s, useJulian, extra = {}) =>
  act(s, { type: 'OVERRIDE', useJulian, nextDate: MODERN, ...extra })
const back = (s) => gameReducer(s, { type: 'BACK' })
const forward = (s, useJulian) => gameReducer(s, { type: 'FORWARD', useJulian })
// The day a grid marks as the answer: its green, or the 'override-wrong' on the answer.
const marked = (btns) =>
  Object.entries(btns)
    .filter(([, v]) => v === 'correct' || v === 'override-wrong')
    .map(([k]) => Number(k))
// Healthy whichever way the setting stands NOW — a judged card no longer depends on it.
const healthy = (s) => {
  expect(checkGameInvariants(s, true)).toEqual([])
  expect(checkGameInvariants(s, false)).toEqual([])
}

it('the fixture: the two calendars disagree about October 14, 1066', () => {
  expect(J).toBe(6)
  expect(G).not.toBe(J)
})

describe('calendarOf — which calendar a card is read in', () => {
  it('a weekday date nothing has judged follows the setting as it stands, whatever it was drawn under', () => {
    const s = initEngine(hastings(true))
    expect(s.card.jul).toBeUndefined()
    expect(calendarOf(s.card, s.date, true)).toBe(true)
    expect(calendarOf(s.card, s.date, false)).toBe(false)
  })
  it('a judged card is read in its own calendar, whatever the setting says now', () => {
    expect(calendarOf({ wrongTime: null, answered: null, jul: true }, hastings(false), false)).toBe(
      true,
    )
    expect(calendarOf({ wrongTime: null, answered: null, jul: false }, hastings(true), true)).toBe(
      false,
    )
  })
  it('a Deduction puzzle nothing has judged is read in the calendar it was BUILT in', () => {
    const puzzle = { type: 'day', y: 1066, m: 10, d: 14, w: J, options: [14, 15], _jul: true }
    const blank = { wrongTime: null, answered: null }
    expect(calendarOf(blank, puzzle, false)).toBe(true)
    expect(calendarOf(blank, { ...puzzle, _jul: false }, true)).toBe(false)
    // One built without the record has only the setting to go by.
    const { _jul, ...bare } = puzzle
    expect(calendarOf(blank, bare, false)).toBe(false)
  })
})

describe('every judging action stamps the calendar in force, once', () => {
  // [name, the action under a setting, where the judged card is afterwards]
  const live = (s) => ({ meta: s.card, btns: s.persistBtns })
  const pushed = (s) => ({ meta: s.stack[s.stack.length - 1].meta, btns: s.stack.at(-1).btns })
  const JUDGES = [
    ['a wrong answer', (s, jul) => answer(s, OTHER, jul), live],
    ['a correct answer', (s, jul) => answer(s, jul ? J : G, jul), pushed],
    [
      'a held completing answer',
      (s, jul) => answer(s, jul ? J : G, jul, MODERN, { complete: true }),
      live,
    ],
    ['a Reveal', (s, jul) => reveal(s, jul), live],
    ['Show Codes', (s, jul) => codes(s, jul), live],
    [
      'a per-round timeout',
      (s, jul) => gameReducer(s, { type: 'LOCK_REVEAL', useJulian: jul }),
      live,
    ],
    [
      'a per-question timeout',
      (s, jul) => gameReducer(s, { type: 'TIMEOUT_MISS', useJulian: jul, saveStats: true }),
      live,
    ],
  ]
  for (const jul of [true, false]) {
    it.each(JUDGES)(`%s under Julian ${jul ? 'on' : 'off'}`, (_name, judge, where) => {
      // Drawn under the OPPOSITE setting: the draw has no say.
      const s = judge(initEngine(hastings(!jul)), jul)
      const card = where(s)
      expect(card.meta.jul).toBe(jul)
      // Whatever answer the grid marks is the answer in that calendar.
      for (const day of marked(card.btns)) expect(day).toBe(jul ? J : G)
      healthy(s)
    })
  }

  it('a correct answer leaves the NEXT date unstamped — the stamp went with the card', () => {
    const s = answer(initEngine(hastings(true)), G, false)
    expect(s.stack[0].meta.jul).toBe(false)
    expect(s.card).toEqual({ wrongTime: null, answered: null })
  })

  it('with Save Stats off a judged date is still stamped (the stamp is about the answer, not the score)', () => {
    const s = answer(initEngine(hastings(true)), OTHER, false, MODERN, { saveStats: false })
    expect(s.card.jul).toBe(false)
    expect(s.stats.played).toBe(0)
    healthy(s)
  })
})

describe('the reported defect — drawn under one setting, answered under the other, browsed back', () => {
  it('the green, the codes calendar and the breakdown letter are all the calendar it was ANSWERED in', () => {
    // Drawn with Julian on; the player switches it off, then answers what is now correct.
    let s = answer(initEngine(hastings(true)), G, false)
    expect(s.stats.good).toBe(1) // judged by the setting at the answer, as before
    s = back(s)
    expect(marked(s.persistBtns)).toEqual([G]) //                       the highlighted answer
    expect(calendarOf(s.card, s.date, true)).toBe(false) //             what Show Codes works in…
    expect(correctIndexOf(s.date, calendarOf(s.card, s.date, true))).toBe(G) // …and arrives at
    expect(buildRunBreakdown(s, true).rows[0].wday).toBe(G) //          the breakdown's letter
    healthy(s)
  })

  it('the same the other way round — drawn with Julian off, answered with it on', () => {
    let s = answer(initEngine(hastings(false)), J, true)
    expect(s.stats.good).toBe(1)
    s = back(s)
    expect(marked(s.persistBtns)).toEqual([J])
    expect(calendarOf(s.card, s.date, false)).toBe(true)
    expect(buildRunBreakdown(s, false).rows[0].wday).toBe(J)
    healthy(s)
  })

  it('one history can hold both, and each card keeps its own through Back and Forward', () => {
    let s = answer(initEngine(hastings(true)), J, true, hastings(true)) // card 1, Julian
    s = answer(s, G, false) //                                             card 2, Gregorian
    expect(buildRunBreakdown(s, true).rows.map((r) => r.wday)).toEqual([J, G])
    s = back(back(s))
    expect(calendarOf(s.card, s.date, false)).toBe(true)
    s = forward(s, false)
    expect(calendarOf(s.card, s.date, true)).toBe(false)
    s = forward(s, true)
    expect(s.backDepth).toBe(0)
    expect(s.stack.map((e) => e.meta.jul)).toEqual([true, false])
    healthy(s)
  })
})

describe('a card that has been judged cannot be judged again in the other calendar', () => {
  // Answered wrong with Julian on, then the setting is switched off with the date still on screen.
  const burned = () => answer(initEngine(hastings(true)), OTHER, true)

  it('a Reveal after the switch shows the answer it was being judged by', () => {
    const s = reveal(burned(), false)
    expect(marked(s.persistBtns)).toEqual([J])
    healthy(s)
  })
  it('the day that is right in the OTHER calendar is still a wrong answer on this card', () => {
    const s = answer(burned(), G, false)
    expect(s.persistBtns[G]).toBe('wrong-latest')
    expect(s.countedWrong).toBe(true)
    expect(s.date.y).toBe(1066) // not advanced
    healthy(s)
  })
  it('and its own day still finishes it', () => {
    const s = answer(burned(), J, false)
    expect(s.date).toBe(MODERN) // advanced
    expect(marked(s.stack[0].btns)).toEqual([J])
    expect(s.stack[0].meta.jul).toBe(true)
    healthy(s)
  })
  it('a New past it puts the green it never showed on the day it was judged by', () => {
    const s = gameReducer(burned(), {
      type: 'NEW',
      nextDate: MODERN,
      useJulian: false,
      saveStats: true,
    })
    expect(marked(s.stack[0].btns)).toEqual([J])
    healthy(s)
  })
  it('Show Codes after the switch shows that same answer', () => {
    const s = codes(burned(), false)
    expect(marked(s.persistBtns)).toEqual([J])
    healthy(s)
  })
})

describe('an Override reads the card, not the setting', () => {
  it('the newest history card, overridden after a switch: its answer stays where it was judged', () => {
    let s = gameReducer(answer(initEngine(hastings(false)), OTHER, true), {
      type: 'NEW',
      nextDate: MODERN,
      useJulian: true,
      saveStats: true,
    })
    s = override(s, false) //  credit it, with the setting now off
    expect(s.stack[0].hasCredit).toBe(true)
    expect(s.stack[0].btns).toEqual({ [J]: 'correct' })
    s = override(s, false) //  …and Undo
    expect(marked(s.stack[0].btns)).toEqual([J])
    healthy(s)
  })
  it('a browsed card, its credit taken away after a switch: the mark is on its own answer', () => {
    let s = back(answer(initEngine(hastings(true)), G, false))
    s = override(s, true)
    expect(s.persistBtns).toEqual({ [G]: 'override-wrong' })
    healthy(s)
    s = forward(s, true)
    expect(s.stack[0].btns).toEqual({ [G]: 'override-wrong' })
    healthy(s)
  })
  it('the live card, credited and held after a switch', () => {
    let s = answer(initEngine(hastings(true)), OTHER, true)
    s = override(s, false, { hold: true })
    expect(s.persistBtns).toEqual({ [J]: 'correct' })
    healthy(s)
  })
})

describe('a Deduction puzzle is judged in the calendar it was built in', () => {
  const puzzle = (built) => ({
    type: 'day',
    y: 1066,
    m: 10,
    d: 14,
    w: built ? J : G,
    options: [13, 14, 15, 16],
    _jul: built,
  })
  it.each([true, false])('built with Julian %s, answered under the opposite setting', (built) => {
    const s = answer(initEngine(puzzle(built)), 0, !built) // a wrong option
    expect(s.card.jul).toBe(built)
    healthy(s)
  })
})

describe('a card nothing has judged carries no calendar', () => {
  it('a Reset, a kept date and a regenerated date are all unstamped', () => {
    let s = answer(initEngine(hastings(true)), OTHER, true)
    s = gameReducer(s, { type: 'RESET', timingOff: true, nextDate: MODERN })
    expect(s.card.jul).toBeUndefined()
    s = gameReducer(initEngine(hastings(true)), { type: 'REGEN_DATE', nextDate: hastings(false) })
    expect(s.card.jul).toBeUndefined()
    healthy(s)
  })
  it('a mid-round Reset clears it with the grid', () => {
    const s = gameReducer(reveal(initEngine(hastings(true)), true), { type: 'RESET_ROUND' })
    expect(s.card.jul).toBeUndefined()
    healthy(s)
  })
})

describe('the tripwires (engine/invariants)', () => {
  const join = (v) => v.join(' | ')
  it('8 — a judged card with no calendar, on screen and in history', () => {
    const s = answer(initEngine(hastings(true)), OTHER, true)
    const { jul: _j, ...bare } = s.card
    expect(join(checkGameInvariants({ ...s, card: bare }, true))).toContain(
      'on-screen card: a judged card carries no calendar',
    )
    const h = answer(initEngine(hastings(true)), J, true)
    const { jul: _k, ...bareMeta } = h.stack[0].meta
    expect(
      join(checkGameInvariants({ ...h, stack: [{ ...h.stack[0], meta: bareMeta }] }, true)),
    ).toContain('stack[0]: a judged card carries no calendar')
  })
  it('8 — a calendar on a card nothing has judged', () => {
    const s = initEngine(hastings(true))
    expect(join(checkGameInvariants({ ...s, card: { ...s.card, jul: true } }, true))).toContain(
      'a card nothing has judged carries a calendar',
    )
  })
  it('9 — a green that is not the answer in the card’s calendar (the defect itself)', () => {
    // Exactly what the older builds stored: judged Gregorian, read back as Julian.
    const s = back(answer(initEngine(hastings(true)), G, false))
    expect(join(checkGameInvariants({ ...s, card: { ...s.card, jul: true } }, false))).toContain(
      'its grid marks an answer that is not the answer in its calendar',
    )
  })
  it('9 — …or an overridden card whose stored as-answered grid names another day', () => {
    let s = gameReducer(answer(initEngine(hastings(true)), OTHER, true), {
      type: 'NEW',
      nextDate: MODERN,
      useJulian: true,
      saveStats: true,
    })
    s = override(s, true)
    const e = s.stack[0]
    const answeredElsewhere = {
      ...e,
      meta: { ...e.meta, answered: { ...e.meta.answered, btns: { [G]: 'correct' } } },
    }
    expect(join(checkGameInvariants({ ...s, stack: [answeredElsewhere] }, true))).toContain(
      'stack[0]: its grid marks an answer that is not the answer in its calendar',
    )
  })
  it('10 — a puzzle stamped with a calendar it was not built in', () => {
    const p = { type: 'day', y: 1066, m: 10, d: 14, w: J, options: [13, 14], _jul: true }
    const s = answer(initEngine(p), 0, true)
    expect(join(checkGameInvariants({ ...s, card: { ...s.card, jul: false } }, true))).toContain(
      "a puzzle's calendar is not the one it was built in",
    )
  })
})

// ── WHAT AN OLDER BUILD PARKED ───────────────────────────────────────────────────────────────────
// Builds up to v2.27.3 park in these same slots and stamp nothing. `asOlderBuild` turns a state this
// build produced into what they would have parked: the same state with every stamp removed. Where the
// case needs the older build's DEFECT too, the grid is rewritten by hand to what it would have stored.
describe('the restore door — a card an older build parked without its calendar', () => {
  const strip = ({ jul: _j, ...meta }) => meta
  const asOlderBuild = (s) => {
    const j = JSON.parse(JSON.stringify(s))
    return {
      ...j,
      card: strip(j.card),
      stack: j.stack.map((e) => ({ ...e, meta: strip(e.meta) })),
      forwardStack: j.forwardStack.map((e) => ({ ...e, meta: strip(e.meta) })),
    }
  }

  it('the card the stamp exists for: its green names one calendar, and that is its stamp', () => {
    // Drawn with Julian on (`_jul: true`), answered with it off — green on the Gregorian day.
    const s = answer(initEngine(hastings(true)), G, false)
    const old = asOlderBuild(s)
    expect(old.stack[0].meta.jul).toBeUndefined()
    // Restored with the setting either way: the green decides, not the setting and not the draw.
    for (const now of [true, false]) {
      const back = restoreParkedEngine(old, now, 'classic')
      expect(back.stack[0].meta.jul).toBe(false)
      expect(marked(back.stack[0].btns)).toEqual([G])
    }
    expect(captureError).not.toHaveBeenCalled()
  })

  it('…and the other way round', () => {
    const old = asOlderBuild(answer(initEngine(hastings(false)), J, true))
    expect(restoreParkedEngine(old, false, 'flash').stack[0].meta.jul).toBe(true)
  })

  it('a green both calendars agree on falls back to the calendar the date was drawn under', () => {
    // A date after the reform has one weekday, so its green cannot tell — and cannot be wrong.
    const s = answer(initEngine(MODERN), wday(2024, 1, 1), false)
    expect(restoreParkedEngine(asOlderBuild(s), false, 'classic').stack[0].meta.jul).toBe(true)
    // …and with no record of the draw either, the setting now.
    const bare = asOlderBuild(s)
    delete bare.stack[0]._jul
    expect(restoreParkedEngine(bare, false, 'classic').stack[0].meta.jul).toBe(false)
  })

  it('a live date holding only wrong picks is stamped with the calendar it was drawn under', () => {
    const old = asOlderBuild(answer(initEngine(hastings(true)), OTHER, true))
    const back = restoreParkedEngine(old, false, 'classic')
    expect(back.card.jul).toBe(true)
    // …so the answer it goes on to show is that calendar's, whatever the setting is now.
    expect(marked(reveal(back, false).persistBtns)).toEqual([J])
  })

  it('a live date nothing has judged stays unstamped', () => {
    const back = restoreParkedEngine(asOlderBuild(initEngine(hastings(true))), true, 'classic')
    expect(back.card.jul).toBeUndefined()
  })

  it('a puzzle is stamped with the calendar it was built in', () => {
    const p = { type: 'day', y: 1066, m: 10, d: 14, w: J, options: [13, 14, 15], _jul: true }
    const old = asOlderBuild(answer(initEngine(p), 0, false))
    expect(restoreParkedEngine(old, false, 'dedDay').card.jul).toBe(true)
  })

  it('the parked LIVE card and the cards ahead of a browsed one are stamped too', () => {
    let s = answer(initEngine(hastings(true)), G, false, hastings(true))
    s = answer(s, J, true, hastings(false))
    s = reveal(s, false) //    the live card: revealed, Gregorian
    s = back(back(s)) //       browsed to card 1; card 2 and the live card are parked ahead
    const restored = restoreParkedEngine(asOlderBuild(s), true, 'classic')
    expect(restored.card.jul).toBe(false)
    expect(restored.forwardStack.map((e) => e.meta.jul)).toEqual([false, true])
    healthy(restored)
  })

  it('a state THIS build parked comes back as the very same object', () => {
    const j = JSON.parse(JSON.stringify(back(answer(initEngine(hastings(true)), G, false))))
    expect(restoreParkedEngine(j, true, 'classic')).toBe(j)
  })

  it('an overridden card whose two grids name different days is refused, not shown', () => {
    // The older build could override a card with the setting switched: state O's grid on one
    // calendar's day, the stored as-answered grid on the other's. No stamp makes both right, and an
    // Undo would bring back a green the codes contradict — so the whole history is dropped.
    let s = gameReducer(answer(initEngine(hastings(true)), OTHER, true), {
      type: 'NEW',
      nextDate: MODERN,
      useJulian: true,
      saveStats: true,
    })
    s = override(s, true)
    const old = asOlderBuild(s)
    old.stack[0].btns = { [G]: 'correct' } // overridden with Julian off: O's green on the Gregorian day
    expect(restoreParkedEngine(old, true, 'classic')).toBe(null)
    expect(vi.mocked(captureError).mock.calls[0][1].reason).toBe('breaks an engine invariant')
  })

  it('a green that is the answer in NEITHER calendar is refused', () => {
    const old = asOlderBuild(back(answer(initEngine(hastings(true)), G, false)))
    old.persistBtns = { [OTHER]: 'correct' }
    expect(restoreParkedEngine(old, true, 'classic')).toBe(null)
  })

  it('a casual history from an older build comes back whole, through parkedHistory', () => {
    const s = back(answer(initEngine(hastings(true)), G, false))
    const text = parkedText(asOlderBuild({ ...s, stats: s.stats }), { config: 'c' })
    const restored = restoreParked(JSON.parse(text), s.stats, true, 'classic')
    expect(restored.engine.card.jul).toBe(false)
    expect(marked(restored.engine.persistBtns)).toEqual([G])
  })
})
