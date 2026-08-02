import { describe, it, expect, beforeEach } from 'vitest'
import {
  useProgress,
  makeProgressDefaults,
  migrateAoxBestKeys,
  normalizeLookupEntries,
} from '../src/store/progress.js'

// progress.test.js — the saved-progress store (Stage D1). Mirrors settings.test.js.
// Locks the contract: (1) empty defaults (blank stats for all five silos, empty
// bests, empty history); (2) setModeStats updates one silo without disturbing the
// others and supports a functional updater; (3) the best/history setters accept
// direct values AND React-style functional updaters; (4) resetProgress restores
// FRESH defaults (no aliasing). Persistence (localStorage) is verified in-browser,
// like the settings store, since jsdom/node storage timing differs from the runtime.

const blank = { played: 0, good: 0, streak: 0, best: 0, times: [] }

describe('progress store', () => {
  beforeEach(() => {
    useProgress.getState().resetProgress()
  })

  it('starts empty: blank stats for all five silos, no bests, no history', () => {
    const s = useProgress.getState()
    for (const k of ['classic', 'flash', 'dedDay', 'dedMonth', 'dedYear']) {
      expect(s.stats[k]).toEqual(blank)
    }
    expect(s.blitzBest).toEqual({})
    expect(s.suddenBest).toEqual({})
    expect(s.suddenAmBest).toEqual({})
    expect(s.aoxBest).toEqual({})
    expect(s.lookupHistory).toEqual([])
  })

  it('setModeStats updates one silo and leaves the others blank', () => {
    useProgress
      .getState()
      .setModeStats('classic', { played: 5, good: 4, streak: 2, best: 3, times: [1.1, 2.2] })
    const s = useProgress.getState()
    expect(s.stats.classic).toEqual({ played: 5, good: 4, streak: 2, best: 3, times: [1.1, 2.2] })
    expect(s.stats.flash).toEqual(blank)
    expect(s.stats.dedDay).toEqual(blank)
  })

  it('setModeStats accepts a functional updater', () => {
    useProgress
      .getState()
      .setModeStats('flash', { played: 1, good: 1, streak: 1, best: 1, times: [] })
    useProgress
      .getState()
      .setModeStats('flash', (prev) => ({ ...prev, played: prev.played + 1, good: prev.good + 1 }))
    expect(useProgress.getState().stats.flash).toEqual({
      played: 2,
      good: 2,
      streak: 1,
      best: 1,
      times: [],
    })
  })

  it('best setters accept direct values and functional updaters', () => {
    useProgress
      .getState()
      .setBlitzBest({ k1: { score: 7, streak: 5, scoreRoundId: 1, streakRoundId: 1 } })
    expect(useProgress.getState().blitzBest.k1.score).toBe(7)
    useProgress.getState().setSuddenBest((p) => ({ ...p, k2: { score: 3, roundId: 2 } }))
    expect(useProgress.getState().suddenBest.k2.score).toBe(3)
    // The per-Q + Allow Mistakes map (C3a) — BlitzBest-shaped, its own silo.
    useProgress
      .getState()
      .setSuddenAmBest({ k4: { score: 6, streak: 4, scoreRoundId: 3, streakRoundId: 3 } })
    expect(useProgress.getState().suddenAmBest.k4.score).toBe(6)
    useProgress
      .getState()
      .setSuddenAmBest((p) => ({ ...p, k5: { ...p.k4, streak: 5, streakRoundId: 4 } }))
    expect(useProgress.getState().suddenAmBest.k5.streak).toBe(5)
    expect(useProgress.getState().suddenAmBest.k4.streak).toBe(4)
    useProgress.getState().setAoxBest((p) => ({
      ...p,
      k3: { avg: 1.5, avgMed: 1.4, avgRoundId: 1, med: 1.4, medAvg: 1.5, medRoundId: 1 },
    }))
    expect(useProgress.getState().aoxBest.k3.avg).toBe(1.5)
  })

  it('setLookupHistory accepts direct + functional updaters', () => {
    const e = { id: 'a', y: 1776, m: 7, d: 4 }
    useProgress.getState().setLookupHistory([e])
    expect(useProgress.getState().lookupHistory).toHaveLength(1)
    useProgress.getState().setLookupHistory((prev) => [{ ...e, id: 'b' }, ...prev])
    expect(useProgress.getState().lookupHistory).toHaveLength(2)
    expect(useProgress.getState().lookupHistory[0].id).toBe('b')
  })

  it('resetProgress restores fresh defaults, even after changes (no aliasing)', () => {
    const g = useProgress.getState
    g().setModeStats('classic', { played: 9, good: 9, streak: 9, best: 9, times: [9] })
    g().setBlitzBest({ k: { score: 1, streak: 1, scoreRoundId: 1, streakRoundId: 1 } })
    g().setSuddenAmBest({ k: { score: 1, streak: 1, scoreRoundId: 1, streakRoundId: 1 } })
    g().setLookupHistory([{ id: 'a', y: 1, m: 1, d: 1 }])
    g().resetProgress()
    const s = g()
    expect(s.stats.classic).toEqual(blank)
    expect(s.blitzBest).toEqual({})
    expect(s.suddenAmBest).toEqual({})
    expect(s.lookupHistory).toEqual([])
    // The factory returns fresh nested objects — mutating live state must not leak into defaults.
    s.stats.classic.times.push(1)
    expect(makeProgressDefaults().stats.classic.times).toEqual([])
  })
})

// ── v1 → v2 migration: AoX Best keys gain the julianChance dimension (C2) ────────
// The original AoX key omitted julianChance (Blitz/Sudden include it; How-to-Play documents it as a
// bucket dimension), so v2 inserts it. The pure rewrite is unit-tested here; the full
// localStorage → rehydrate path is covered in progress.dom.test.js (needs jsdom storage).
describe('progress store — migrateAoxBestKeys (v1 → v2)', () => {
  const rec = { avg: 1.5, avgMed: 1.4, avgRoundId: 1, med: 1.4, medAvg: 1.5, medRoundId: 1 }

  it('inserts the julianChance segment before the year range (Blitz segment order)', () => {
    const out = migrateAoxBestKeys(
      { '10|false|numeric-ymd|random|random|1583-10000|true': rec },
      'random',
    )
    expect(out).toEqual({ '10|false|numeric-ymd|random|random|random|1583-10000|true': rec })
  })

  it('uses the CALLER-supplied julianChance (the user’s live setting at migrate time)', () => {
    const out = migrateAoxBestKeys({ '5|true|random|random|natural|1-2025|true': rec }, 'always')
    expect(Object.keys(out)).toEqual(['5|true|random|random|natural|always|1-2025|true'])
  })

  it('distinct old keys stay distinct (injective), values preserved untouched', () => {
    const a = { ...rec, avg: 1.1 }
    const b = { ...rec, avg: 2.2 }
    const out = migrateAoxBestKeys(
      {
        '10|false|numeric-ymd|random|random|1583-10000|true': a,
        '10|true|numeric-ymd|random|random|1583-10000|true': b,
      },
      'random',
    )
    expect(Object.keys(out)).toHaveLength(2)
    expect(out['10|false|numeric-ymd|random|random|random|1583-10000|true']).toEqual(a)
    expect(out['10|true|numeric-ymd|random|random|random|1583-10000|true']).toEqual(b)
  })

  it('leaves an already-8-segment key untouched (idempotent on re-run)', () => {
    const newKey = '10|false|numeric-ymd|random|random|always|1583-10000|true'
    const once = migrateAoxBestKeys({ [newKey]: rec }, 'random')
    expect(once).toEqual({ [newKey]: rec })
  })

  it('empty map → empty map', () => {
    expect(migrateAoxBestKeys({}, 'random')).toEqual({})
  })
})

// ── the lookup-history normalizer: shape + validation (Q2) ───────────────────────
// label/weekday/result were snapshots of how the date read at lookup time; the card derives all
// three now, so the stored copies were not merely redundant but WRONG after a Date Format change.
// The VALIDATION half matters just as much: LookupCard carries no per-field guards any more, so an
// entry that survives this filter is one the card can render. The pure function is unit-tested
// here; the localStorage → rehydrate path (where it runs on EVERY version) is in progress.dom.
describe('progress store — normalizeLookupEntries', () => {
  it('keeps the date and the id, drops the rendered text', () => {
    expect(
      normalizeLookupEntries([
        { id: 'a', label: 'July 4, 1776', weekday: 'Thursday', result: 'r', y: 1776, m: 7, d: 4 },
      ]),
    ).toEqual([{ id: 'a', y: 1776, m: 7, d: 4 }])
  })

  it('keeps the gap marker — it is an input, not a rendering', () => {
    expect(
      normalizeLookupEntries([
        {
          id: 'g',
          label: 'x',
          weekday: 'Does Not Exist',
          result: 'r',
          y: 1582,
          m: 10,
          d: 10,
          isGap: true,
        },
      ]),
    ).toEqual([{ id: 'g', y: 1582, m: 10, d: 10, isGap: true }])
  })

  it('is idempotent on an already-v3 entry, and passes an empty history through', () => {
    const v3 = [{ id: 'a', y: 1776, m: 7, d: 4 }]
    expect(normalizeLookupEntries(v3)).toEqual(v3)
    expect(normalizeLookupEntries([])).toEqual([])
  })

  it('drops junk elements instead of throwing (it reads untrusted localStorage)', () => {
    expect(
      normalizeLookupEntries([null, { id: 'a', y: 1, m: 1, d: 1 }, undefined, 'nope']),
    ).toEqual([{ id: 'a', y: 1, m: 1, d: 1 }])
  })

  // The guard the card leans on. A truncated write, an interrupted serialize or a hand-edited key
  // can leave an object that IS an object but can't answer "which date?" — it must not reach the
  // render, where it would produce MONTH[NaN] and a blank weekday.
  it('drops entries missing or corrupting any of id/y/m/d', () => {
    expect(
      normalizeLookupEntries([
        { id: 'x' }, // truncated: no date at all
        { id: 'y', y: 1776, m: 7 }, // partial date
        { id: 'z', y: 1776, m: 'seven', d: 4 }, // wrong type
        { id: 'n', y: NaN, m: 7, d: 4 }, // NaN is a number and still unusable
        { y: 1776, m: 7, d: 4 }, // no id — the React key and the selection handle
        { id: 'ok', y: 1776, m: 7, d: 4 },
      ]),
    ).toEqual([{ id: 'ok', y: 1776, m: 7, d: 4 }])
  })

  // It is the sole owner of the shape, so it also owns "there is no history".
  it('returns an empty history for a non-array payload', () => {
    expect(normalizeLookupEntries(undefined)).toEqual([])
    expect(normalizeLookupEntries(null)).toEqual([])
    expect(normalizeLookupEntries('nope')).toEqual([])
  })

  // ── The date must be REAL, not merely number-shaped (round-11 Q2) ───────────────────────────
  // Number-shaped is not enough now that the card answers rather than refuses: the day-number
  // arithmetic underneath rolls February 30 into March and would print a confident weekday for a
  // date that never happened. Same either-calendar rule Lookup validates with — a date counts if a
  // calendar it can be read in has it.
  it('drops days no calendar has', () => {
    expect(
      normalizeLookupEntries([
        { id: 'a', y: 1776, m: 2, d: 30 }, // February never has 30 days, under either rule
        { id: 'b', y: 1776, m: 4, d: 31 }, // April has 30
        { id: 'c', y: 1776, m: 1, d: 32 },
        { id: 'd', y: 1776, m: 1, d: 0 },
        { id: 'e', y: 1776, m: 13, d: 1 }, // MONTH[12] is undefined
        { id: 'f', y: 1776, m: 0, d: 1 },
        { id: 'ok', y: 1776, m: 7, d: 4 },
      ]),
    ).toEqual([{ id: 'ok', y: 1776, m: 7, d: 4 }])
  })

  // The either-calendar half. February 29, 1500 is a real Julian date and no Gregorian date at all;
  // 1900's is neither, because the Julian rule has stopped applying by then.
  it('keeps a pre-reform February 29 that only the Julian rule grants, and only that', () => {
    expect(
      normalizeLookupEntries([
        { id: 'jul', y: 1500, m: 2, d: 29 },
        { id: 'both', y: 1200, m: 2, d: 29 },
        { id: 'neither', y: 1900, m: 2, d: 29 },
        { id: 'plain', y: 1500, m: 2, d: 28 },
      ]),
    ).toEqual([
      { id: 'jul', y: 1500, m: 2, d: 29 },
      { id: 'both', y: 1200, m: 2, d: 29 },
      { id: 'plain', y: 1500, m: 2, d: 28 },
    ])
  })

  // Whole numbers, for the same reason: month 1.5 indexes MONTH to `undefined` and day 1.5 lands on
  // a weekday belonging to no day. A gap entry is still an ordinary October date to this check.
  it('requires whole numbers, and lets the gap days through as ordinary October dates', () => {
    expect(
      normalizeLookupEntries([
        { id: 'a', y: 1776.5, m: 7, d: 4 },
        { id: 'b', y: 1776, m: 1.5, d: 4 },
        { id: 'c', y: 1776, m: 7, d: 4.5 },
        { id: 'gap', y: 1582, m: 10, d: 10, isGap: true },
      ]),
    ).toEqual([{ id: 'gap', y: 1582, m: 10, d: 10, isGap: true }])
  })

  // Deliberately NOT bounded to Lookup's 1–10000 years: an out-of-range year still names a real
  // date and still reads correctly, so there is nothing wrong to drop — unlike an impossible day,
  // which can only be answered wrongly. Pinned so the omission reads as a decision, not an oversight.
  it('leaves a year outside the input range alone — it is unusual, not impossible', () => {
    const odd = [{ id: 'a', y: 20000, m: 7, d: 4 }]
    expect(normalizeLookupEntries(odd)).toEqual(odd)
  })
})
