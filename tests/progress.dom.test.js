// @vitest-environment jsdom
//
// progress.dom.test.js — the saved-progress store against REAL (jsdom) localStorage: the
// version-gated migration path (v1 → v2, C2) end-to-end. The pure key rewrite is unit-tested in
// progress.test.js (Node); this file proves the wiring — a stored v1 envelope is read, routed
// through `migrate`, and lands in the live store with the AoX keys re-siloed — using
// useProgress.persist.rehydrate(), the same zustand entry point a real reload takes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useProgress, makeProgressDefaults } from '../src/store/progress.js'
import { useSettings } from '../src/store/settings.js'

const rec = { avg: 1.5, avgMed: 1.4, avgRoundId: 1, med: 1.4, medAvg: 1.5, medRoundId: 1 }

describe('progress store — v1 envelope rehydrates through the migration', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
    useProgress.getState().resetProgress()
  })
  afterEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
    useProgress.getState().resetProgress()
  })

  it('a stored v1 payload loads with AoX keys migrated under the LIVE julianChance setting', async () => {
    const v1 = {
      state: {
        stats: makeProgressDefaults().stats,
        blitzBest: {
          'n60|numeric-ymd|random|random|random|1583-10000|true': {
            score: 4,
            streak: 3,
            scoreRoundId: 1,
            streakRoundId: 1,
          },
        },
        suddenBest: {},
        aoxBest: { '10|false|numeric-ymd|random|random|1583-10000|true': rec },
        lookupHistory: [],
      },
      version: 1,
    }
    localStorage.setItem('cg-progress-v1', JSON.stringify(v1))
    useSettings.getState().setJulianChance('always') // the live setting the migration must read
    await useProgress.persist.rehydrate()
    const s = useProgress.getState()
    // The AoX record moved to the 8-segment key, with the live julianChance inserted.
    expect(s.aoxBest).toEqual({
      '10|false|numeric-ymd|random|random|always|1583-10000|true': rec,
    })
    // Everything else passed through untouched.
    expect(s.blitzBest['n60|numeric-ymd|random|random|random|1583-10000|true']?.score).toBe(4)
    expect(s.stats.classic).toEqual({ played: 0, good: 0, streak: 0, best: 0, times: [] })
  })

  it('a current-version (v2) payload rehydrates unchanged — the migration does not re-fire', async () => {
    const newKey = '10|false|numeric-ymd|random|random|random|1583-10000|true'
    const v2 = {
      state: { ...makeProgressDefaults(), aoxBest: { [newKey]: rec } },
      version: 2,
    }
    localStorage.setItem('cg-progress-v1', JSON.stringify(v2))
    await useProgress.persist.rehydrate()
    expect(useProgress.getState().aoxBest).toEqual({ [newKey]: rec })
  })

  // C3a no-migration pin: suddenAmBest was ADDED as a fresh key space (v2 stayed v2). A payload
  // saved before it existed simply lacks the key — zustand's shallow merge must leave the default
  // {} standing, with every pre-existing silo untouched. If this ever fails, a real migration
  // became necessary.
  it('a stored payload WITHOUT suddenAmBest hydrates with the default {} (no migration needed)', async () => {
    const state = {
      ...makeProgressDefaults(),
      blitzBest: {
        'm60|numeric-ymd|random|random|random|1583-10000|true': {
          score: 4,
          streak: 3,
          scoreRoundId: 1,
          streakRoundId: 1,
        },
      },
      suddenBest: {
        '10|numeric-ymd|random|random|random|1583-10000|true': { score: 2, roundId: 1 },
      },
    }
    delete state.suddenAmBest // the pre-C3a payload shape
    localStorage.setItem('cg-progress-v1', JSON.stringify({ state, version: 2 }))
    await useProgress.persist.rehydrate()
    const s = useProgress.getState()
    expect(s.suddenAmBest).toEqual({})
    expect(s.blitzBest['m60|numeric-ymd|random|random|random|1583-10000|true']?.score).toBe(4)
    expect(s.suddenBest['10|numeric-ymd|random|random|random|1583-10000|true']?.score).toBe(2)
  })

  // The write-path twin of the pin above: partialize must persist every data silo — including
  // suddenAmBest (C3a) — and never a setter function. (Asserted here rather than in the Node file:
  // zustand only attaches the .persist API when a storage exists, i.e. under jsdom.)
  it('partialize persists every data value — including suddenAmBest (C3a) — and no setters', () => {
    const out = useProgress.persist.getOptions().partialize(useProgress.getState())
    expect(Object.keys(out).sort()).toEqual([
      'aoxBest',
      'blitzBest',
      'lookupHistory',
      'stats',
      'suddenAmBest',
      'suddenBest',
    ])
    for (const v of Object.values(out)) expect(typeof v).not.toBe('function')
  })
})

// ── C2 Part 4: the save/rehydrate ROUND-TRIP fuzz + corruption tolerance ─────────────────────────
// The persisted progress store is the only place saved stats can silently corrupt across sessions.
// Two nets: (1) a round-trip fuzz — random valid progress states written as a stored envelope must
// rehydrate EXACTLY (no field lost, re-keyed, capped, or coerced); (2) corruption tolerance — a
// damaged payload (truncated JSON, wrong shapes, impossible scores) must never crash hydration (the
// app must still boot; the rehydrate tripwire reports impossible saved scores instead of throwing).
describe('progress store — save/rehydrate round-trip fuzz + corruption tolerance (C2)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
    useProgress.getState().resetProgress()
  })
  afterEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
    useProgress.getState().resetProgress()
  })

  function mulberry32(a) {
    return function () {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const randStats = (rnd) => {
    const played = Math.floor(rnd() * 200)
    const good = Math.floor(rnd() * (played + 1))
    const streak = Math.floor(rnd() * (good + 1))
    const best = streak + Math.floor(rnd() * (good - streak + 1))
    const times = Array.from({ length: Math.min(good, Math.floor(rnd() * 40)) }, () => rnd() * 9)
    return { played, good, streak, best, times }
  }
  const randKey = (rnd) =>
    `${2 + Math.floor(rnd() * 99)}|${rnd() < 0.5}|numeric-ymd|random|random|random|${1500 + Math.floor(rnd() * 100)}-${3000 + Math.floor(rnd() * 100)}|${rnd() < 0.5}`

  it('random valid progress states survive the stored-envelope round trip EXACTLY (60 seeds)', async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = mulberry32(seed)
      const values = {
        stats: {
          classic: randStats(rnd),
          flash: randStats(rnd),
          dedDay: randStats(rnd),
          dedMonth: randStats(rnd),
          dedYear: randStats(rnd),
        },
        blitzBest: Object.fromEntries(
          Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => [
            randKey(rnd) + i,
            {
              score: Math.floor(rnd() * 50),
              streak: Math.floor(rnd() * 50),
              scoreRoundId: rnd() < 0.3 ? null : Math.floor(rnd() * 9),
              streakRoundId: rnd() < 0.3 ? null : Math.floor(rnd() * 9),
            },
          ]),
        ),
        suddenBest: Object.fromEntries(
          Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => [
            randKey(rnd) + i,
            { score: Math.floor(rnd() * 50), roundId: rnd() < 0.3 ? null : Math.floor(rnd() * 9) },
          ]),
        ),
        suddenAmBest: Object.fromEntries(
          Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => [
            randKey(rnd) + i,
            {
              score: Math.floor(rnd() * 50),
              streak: Math.floor(rnd() * 50),
              scoreRoundId: rnd() < 0.3 ? null : Math.floor(rnd() * 9),
              streakRoundId: rnd() < 0.3 ? null : Math.floor(rnd() * 9),
            },
          ]),
        ),
        aoxBest: Object.fromEntries(
          Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => [
            randKey(rnd) + i,
            {
              avg: rnd() * 9,
              avgMed: rnd() * 9,
              avgRoundId: 1 + Math.floor(rnd() * 9),
              med: rnd() * 9,
              medAvg: rnd() * 9,
              medRoundId: 1 + Math.floor(rnd() * 9),
            },
          ]),
        ),
        lookupHistory: Array.from({ length: Math.floor(rnd() * 6) }, (_, i) => ({
          id: `e${seed}-${i}`,
          label: `entry ${i}`,
          weekday: 'Thursday',
          result: 'r',
          y: 1583 + Math.floor(rnd() * 400),
          m: 1 + Math.floor(rnd() * 12),
          d: 1 + Math.floor(rnd() * 28),
        })),
      }
      localStorage.setItem('cg-progress-v1', JSON.stringify({ state: values, version: 2 }))
      await useProgress.persist.rehydrate()
      const s = useProgress.getState()
      expect(s.stats, `seed ${seed}`).toEqual(values.stats)
      expect(s.blitzBest, `seed ${seed}`).toEqual(values.blitzBest)
      expect(s.suddenBest, `seed ${seed}`).toEqual(values.suddenBest)
      expect(s.suddenAmBest, `seed ${seed}`).toEqual(values.suddenAmBest)
      expect(s.aoxBest, `seed ${seed}`).toEqual(values.aoxBest)
      expect(s.lookupHistory, `seed ${seed}`).toEqual(values.lookupHistory)
    }
  })

  it('corrupt payloads never crash hydration (the app must still boot)', async () => {
    const corrupt = [
      '{truncated', // invalid JSON
      'null',
      '{"state":null,"version":2}',
      '{"state":{"stats":"nope"},"version":2}', // wrong type
      '{"state":{"stats":{"classic":{"played":1,"good":7,"streak":9,"best":0,"times":[1]}}},"version":2}', // impossible scores → tripwire reports, still loads
      '{"version":2}', // no state at all
      JSON.stringify({ state: { aoxBest: { 'short|key': { avg: 1 } } }, version: 1 }), // v1 with a non-7-segment key → migration passes it through
    ]
    for (const payload of corrupt) {
      localStorage.setItem('cg-progress-v1', payload)
      await expect(useProgress.persist.rehydrate(), payload).resolves.not.toThrow()
    }
    // And the store is still usable afterwards.
    useProgress.getState().resetProgress()
    useProgress
      .getState()
      .setModeStats('classic', { played: 1, good: 1, streak: 1, best: 1, times: [1] })
    expect(useProgress.getState().stats.classic.played).toBe(1)
  })

  it('the solve-times rolling cap holds on the WRITE path (storage stays bounded)', () => {
    const times = Array.from({ length: 1500 }, (_, i) => i)
    useProgress
      .getState()
      .setModeStats('classic', { played: 1500, good: 1500, streak: 1, best: 1, times })
    const t = useProgress.getState().stats.classic.times
    expect(t).toHaveLength(1000) // STATS_TIMES_CAP
    expect(t[0]).toBe(500) // the most RECENT 1000 are kept
    expect(t[999]).toBe(1499)
  })
})
