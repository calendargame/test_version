// progressStorage.olderBuilds — THE OLDER-BUILD MODELS, HELD TO WHAT THE REAL BUILDS STORED.
//
// Live and staging share one browser origin, so v2.27.3 and v2.26.0 read and write the same saved
// progress this build does. The sealed layout (store/progressStorage) rests on one claim about them:
// a build that has never heard of `sealed` carries it, and the `timesLost` beside it, through every
// write it makes, and drops both only on a reset.
// ★ THAT CLAIM WAS RUN, NOT READ. tests/fixtures/olderBuilds/v2.27.3.json and v2.26.0.json are what
// the real app at each tag (fcdcf56, ff506f8) left in storage after each step of
// sealedDrive.dom.test.jsx.txt — mounted, answered, overridden, timing hidden and shown, Amnesic on
// and off, a preset switch and back, a reload, Reset Stats, and play past the old 1,000 cap — over a
// seeded sealed save. This file replays those steps through tests/helpers/progressWorld's models and
// requires the same stored state at every one, so the fuzz that leans on the models leans on the
// builds.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { Disk, olderPage, blankState, MAIN } from './helpers/progressWorld.js'

const recorded = (build) =>
  JSON.parse(readFileSync(new URL(`./fixtures/olderBuilds/${build}.json`, import.meta.url), 'utf8'))
    .filter((e) => e.step)
    .map((e) => [e.step, e])

const TAIL = Array.from({ length: 300 }, (_, i) => 2 + (i % 50) / 10)
const SEALED = { n: 1000, ids: ['aaa0', 'bbb1', 'ccc2', 'ddd3'] }
const seed = (classic) =>
  JSON.stringify({
    state: { ...blankState(), stats: { ...blankState().stats, classic } },
    version: 5,
  })
// The stored classic silo as the fixtures spell it: the times as a count plus their last two.
const stored = (disk) => {
  const text = disk.items.get(MAIN)
  const { state, version } = JSON.parse(text)
  const c = state.stats.classic
  return { version, classic: { ...c, times: c.times.length, lastTimes: c.times.slice(-2) } }
}

describe.each(['v2.27.3', 'v2.26.0'])(
  '%s, replayed against what the real build stored',
  (build) => {
    const steps = new Map(recorded(build))
    const at = (step) => steps.get(step).main
    // The fixture's counts for a step, onto the Stats the page holds — a spread, as the build's are.
    const counts = (step) => {
      const { played, good, streak, best } = at(step).classic
      return { played, good, streak, best }
    }

    it('carries `sealed` and `timesLost` through every write, and drops both on a reset', () => {
      const disk = new Disk()
      disk.put(
        MAIN,
        seed({
          played: 1400,
          good: 1300,
          streak: 3,
          best: 40,
          times: TAIL,
          timesLost: 1000,
          sealed: SEALED,
        }),
      )
      const page = olderPage(build, disk)
      page.load()
      expect(stored(disk)).toEqual(at('loaded'))

      // Three timed answers: the recorded times are the real ones the build measured.
      const three = at('3 timed answers')
      const [t0, t1] = three.classic.lastTimes
      page.update('classic', (s) => ({
        ...s,
        ...counts('3 timed answers'),
        times: [...s.times, t0, t0, t1],
      }))
      expect(stored(disk)).toEqual(three)

      page.update('classic', (s) => ({ ...s, ...counts('a wrong answer') }))
      expect(stored(disk)).toEqual(at('a wrong answer'))

      // An Override in the tail (the wrong answer is given its credit, with a time), then undone.
      const given = at('override in the tail (credit taken back)')
      page.update('classic', (s) => ({
        ...s,
        ...counts('override in the tail (credit taken back)'),
        times: [...s.times, given.classic.lastTimes[1]],
      }))
      expect(stored(disk)).toEqual(given)
      page.update('classic', (s) => ({
        ...s,
        ...counts('override undone'),
        times: s.times.slice(0, -1),
      }))
      expect(stored(disk)).toEqual(at('override undone'))

      // Hiding and showing timing, Amnesic on and off, a switch to another preset: none of them is a
      // write to this key that changes it — the real builds stored the same silo at each.
      for (const step of ['timing hidden', 'timing shown again', 'amnesic on', 'amnesic off'])
        expect(at(step).classic).toEqual(at('override undone').classic)
      expect(at('switched to a new preset and answered').classic).toEqual(
        at('override undone').classic,
      )

      page.load() // the reload
      expect(stored(disk).classic.sealed).toEqual(SEALED)
      expect(at('reloaded and answered').classic.sealed).toEqual(SEALED)
      expect(at('reloaded and answered').classic.timesLost).toBe(1000)

      page.reset('classic')
      expect(stored(disk)).toEqual({
        ...at('Reset Stats'),
        classic: { ...at('Reset Stats').classic, lastTimes: [] },
      })
      expect('sealed' in stored(disk).classic).toBe(false)
      expect('timesLost' in stored(disk).classic).toBe(false)
      // …and no older build touched a chunk key at any step, reset included.
      for (const [, e] of steps) expect(e.chunkKeys).toBe(4)
    })

    it('play past the old 1,000 cap: v2.26.0 trims the tail, v2.27.3 keeps every time', () => {
      const disk = new Disk()
      const tail = Array.from({ length: 999 }, (_, i) => 2 + (i % 50) / 10)
      disk.put(
        MAIN,
        seed({
          played: 1999,
          good: 1999,
          streak: 3,
          best: 40,
          times: tail,
          timesLost: 1000,
          sealed: SEALED,
        }),
      )
      const page = olderPage(build, disk)
      page.load()
      expect(stored(disk)).toEqual(at('trim: loaded a 999-time tail'))
      const after = at('trim: 3 timed answers past 1,000')
      for (let i = 1; i <= 3; i++)
        page.update('classic', (s) => ({
          ...s,
          played: 1999 + i,
          good: 1999 + i,
          streak: 3 + i,
          times: [...s.times, after.classic.lastTimes[i < 3 ? 0 : 1]],
        }))
      expect(stored(disk)).toEqual(after)
      expect(after.classic.times).toBe(build === 'v2.26.0' ? 1000 : 1002)
      expect(after.classic.timesLost).toBe(1000) // carried, never recomputed, by both
    })
  },
)
