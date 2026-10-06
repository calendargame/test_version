// @vitest-environment jsdom
// storageUsage — the early "storage is getting full" warning (store/storageUsage, the ⚙ panel's
// "Storage used" line, components/StorageUsagePopup).
//
// What is pinned: the BREAKDOWN (every key counted, sorted to the right owner; a chunk nobody names
// counts toward the size and not toward the number of times); the COUNT (kept by the storage door,
// right the moment a save or a removal lands — after Reset Stats, Clear History and a preset delete
// on a filled device — and never by re-reading); the LIMIT (measured once per device, with a quota
// of several sizes; when it is taken — as the app starts, and when ⚙ or the popup opens — and when
// it may not be; what is shown on a device that cannot be measured; what a refused save teaches,
// and that it teaches it once); the popup opening by itself ONCE per upward crossing of 80% — never
// while the player is busy, not on a reload, not while usage stays above, again after a drop and a
// rise; the warning that stays (the
// line's colour, the gear's dot) and what does and does not clear it; and its place beside the
// storage-full notice.
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, cleanup, within, act, render } from '@testing-library/react'
import {
  useStorageUsage,
  readStorageUsage,
  refreshStorageUsage,
  watchStorageUsage,
  measureStorageLimit,
  announceStorageWarning,
  forgetStorageUsage,
  storageUsed,
  usagePercent,
  DOCUMENTED_LIMITS,
  MAX_STORAGE_LIMIT,
  STORAGE_WARN_PERCENT,
} from '../src/store/storageUsage.js'
import {
  useStorageHealth,
  writeItem,
  readItem,
  forgetStorageHealth,
  measureRoom,
  SCRATCH_KEY,
} from '../src/store/storageHealth.js'
import { useProgress, makeProgressDefaults } from '../src/store/progress.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { useSettings } from '../src/store/settings.js'
import { useLookupHistory } from '../src/store/lookupHistory.js'
import {
  createPreset,
  switchPreset,
  deletePreset,
  setPresetAmnesic,
} from '../src/store/presetControl.js'
import { resetStatsFreesRoom } from '../src/store/amnesic.js'
import { usePlayerBusy } from '../src/lib/playerBusy.js'
import { GEAR_DOT_KEY, markUpdateDot, readUpdateDot } from '../src/changelog.js'
import { seedSealed, chunkId } from './helpers/progressWorld.js'
import { readDate, correctDayName } from './helpers/modeScreen.jsx'
import {
  resetAppState,
  mountApp,
  openSettings,
  closeSettings,
  panel,
  gear,
  tap,
  pressKey,
} from './helpers/settingsPanel.jsx'

const CHROMIUM = DOCUMENTED_LIMITS[0]
const SAFARI = DOCUMENTED_LIMITS[1] // about half of Chromium's
const LIMIT_KEY = 'cg-storage-limit-v1'
const WARNED_KEY = 'cg-storage-warned-v1'
const FILLER = 'zz-test-filler'
// Past the warning line of Chromium's limit, with room left for the app's own saves.
const fill = (chars = 4_300_000) => localStorage.setItem(FILLER, 'x'.repeat(chars - FILLER.length))
const empty = () => localStorage.removeItem(FILLER)
// A page load: everything the page knew is gone, and the device stands measured at `limit`
// (Chromium's unless given; null = never measured).
const freshPage = (limit) => forgetStorageUsage(limit)
const usage = () => useStorageUsage.getState()
const everything = () =>
  Object.entries({ ...localStorage }).reduce((sum, [k, v]) => sum + k.length + v.length, 0)
const long = (n) => ({
  played: n,
  good: n,
  streak: 3,
  best: 40,
  times: Array.from({ length: n }, (_, i) => 2 + (i % 977) / 100),
})
const unmountApp = () => {
  cleanup()
  document.getElementById('root')?.remove()
}
const popup = () =>
  screen.queryByRole('dialog', { name: /^Storage used: (\d+%|not measured yet)$/ })
const line = () => panel().getByRole('button', { name: /^Storage used: / })
const gearLit = () => gear().querySelector('[data-update-dot]').getAttribute('data-lit') === 'true'
// What the gear's dot is saying — which is its colour (components/UpdateDot; index.css).
const gearReason = () => gear().querySelector('[data-update-dot]').getAttribute('data-reason')
const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')
const realSetItem = Storage.prototype.setItem
// The device takes `limit` characters in all (keys and values), as a browser counts them.
function deviceLimit(limit) {
  const real = Storage.prototype.setItem
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (this === localStorage) {
      const was = this.getItem(key)
      const after =
        everything() - (was === null ? 0 : key.length + was.length) + key.length + value.length
      if (after > limit) throw quotaError()
    }
    return real.call(this, key, value)
  })
}
const scratchWrites = (writes) => writes.mock.calls.filter(([key]) => key === SCRATCH_KEY)
// What a mode screen reports of its question (lib/playerBusy): a running solve clock — a timed,
// unanswered casual question — or, with `live`, a round, run or flash under way.
function Clock({ runs, live = false }) {
  usePlayerBusy(live ? 'live' : runs ? 'clock' : null)
  return null
}
// "The player has just become free" is said from a microtask: let it be said.
const settled = () => act(async () => {})

let stop = () => {}
const watch = () => {
  stop()
  stop = watchStorageUsage()
}

beforeEach(() => {
  resetAppState()
  forgetStorageHealth()
  freshPage()
})
afterEach(() => {
  stop()
  stop = () => {}
  unmountApp()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('what is filling the device', () => {
  it('counts every key, and sorts it to its owner', () => {
    localStorage.clear()
    const state = makeProgressDefaults()
    state.stats = { ...state.stats, classic: long(3000), flash: long(400) }
    state.blitzBest = { a: { score: 3, streak: 2, scoreRoundId: 1, streakRoundId: 1 } }
    seedSealed({ put: (k, v) => localStorage.setItem(k, v) }, state)
    // A chunk no save names (a deep Override left it): it takes room, it holds no counted time.
    const orphan = JSON.stringify(long(250).times)
    localStorage.setItem(`cg-times-v1:classic:4.${chunkId(orphan)}`, orphan)
    // Preset 2, plain; its settings; the shared Lookup history; something that is nobody's.
    const two = makeProgressDefaults()
    two.stats = { ...two.stats, dedYear: long(120) }
    localStorage.setItem('cg-progress-v1~p2', JSON.stringify({ state: two, version: 5 }))
    localStorage.setItem('cg-settings-v1~p2', '{"state":{"theme":"dusk"},"version":9}')
    localStorage.setItem(
      'cg-lookup-v1',
      JSON.stringify({ state: { history: [1, 2, 3] }, version: 1 }),
    )
    localStorage.setItem('cg-presets-v1', '{"state":{},"version":1}')

    const reading = readStorageUsage(localStorage)
    expect(reading.used).toBe(everything())
    expect(reading.rows.reduce((sum, row) => sum + row.chars, 0)).toBe(everything())
    expect(reading.rows.map((r) => r.chars)).toEqual(
      reading.rows.map((r) => r.chars).sort((a, b) => b - a),
    )
    const times = (presetId, silo) =>
      reading.rows.find((r) => r.kind === 'times' && r.presetId === presetId && r.silo === silo)
    // 3,000 times: the sealed count plus the tail — the orphan's 250 are not times anyone has…
    expect(times(1, 'classic').count).toBe(3000)
    // …but its room is counted, under the mode whose Reset Stats gets it back.
    const chunks = Object.entries({ ...localStorage }).filter(([k]) =>
      k.startsWith('cg-times-v1:classic:'),
    )
    expect(chunks).toHaveLength(11 + 1)
    expect(times(1, 'classic').chars).toBeGreaterThan(
      chunks.reduce((sum, [k, v]) => sum + k.length + v.length, 0),
    )
    expect(times(1, 'flash').count).toBe(400)
    expect(times(2, 'dedYear').count).toBe(120)
    expect(reading.rows.find((r) => r.kind === 'lookup')).toMatchObject({ count: 3 })
    expect(
      reading.rows
        .filter((r) => r.kind === 'preset')
        .map((r) => r.presetId)
        .sort(),
    ).toEqual([1, 2])
    expect(reading.rows.find((r) => r.kind === 'other').chars).toBe(
      'cg-presets-v1'.length + '{"state":{},"version":1}'.length,
    )
  })

  it('reads the device and nothing else: a session copy is not counted', () => {
    localStorage.clear()
    sessionStorage.setItem('cg-progress-v1', 'x'.repeat(5000))
    expect(readStorageUsage(localStorage).used).toBe(0)
  })

  it('a percentage is a whole number and never reads above 100', () => {
    expect(usagePercent(0, CHROMIUM)).toBe(0)
    expect(usagePercent(CHROMIUM * 0.796, CHROMIUM)).toBe(80)
    expect(usagePercent(CHROMIUM * 3, CHROMIUM)).toBe(100)
  })
})

describe('the count is kept by the storage door, and is right the moment a change lands', () => {
  it('follows every save and removal without reading the device again', () => {
    watch()
    const passes = vi.spyOn(Storage.prototype, 'key')
    useProgress.getState().setModeStats('classic', long(10))
    expect(storageUsed()).toBe(everything())
    useProgress.getState().setModeStats('classic', long(4000))
    expect(storageUsed()).toBe(everything())
    useLookupHistory.getState().setHistory([{ id: 'a', y: 2024, m: 3, d: 4 }])
    expect(storageUsed()).toBe(everything())
    useProgress.getState().setModeStats('classic', long(0))
    useLookupHistory.getState().setHistory([])
    passes.mockClear() // (the helper above lists the keys itself)
    useProgress.getState().setModeStats('classic', long(5))
    useProgress.getState().setModeStats('classic', long(6))
    expect(passes).not.toHaveBeenCalled() // an answer costs one addition, not a pass over the keys
    expect(storageUsed()).toBe(everything())
  })

  // The three remedies the popup names, on a device small enough that the test data is the bulk.
  // (Before: the reading was taken by a store subscriber, which runs BEFORE the save that follows
  // the change and before a preset's keys are removed — the line stayed at 100% until ⚙ reopened.)
  describe('after each way of making room, on a filled device', () => {
    beforeEach(() => freshPage(40_000))
    const shownIsTrue = () => {
      expect(usage().percent).toBe(usagePercent(everything(), 40_000))
      expect(usage().warning).toBe(usage().percent >= STORAGE_WARN_PERCENT)
    }

    it('Reset Stats', () => {
      watch()
      useProgress.getState().setModeStats('classic', long(6500))
      expect(usage()).toMatchObject({ percent: 100, warning: true })
      useProgress.getState().setModeStats('classic', long(0))
      shownIsTrue()
      expect(usage().warning).toBe(false)
    })

    it('Clear History', () => {
      watch()
      useLookupHistory
        .getState()
        .setHistory(
          Array.from({ length: 900 }, (_, i) => ({ id: `e${i}`, y: 1000 + i, m: 3, d: 4 })),
        )
      expect(usage().warning).toBe(true)
      useLookupHistory.getState().setHistory([])
      shownIsTrue()
      expect(usage().warning).toBe(false)
    })

    it('deleting a preset', () => {
      const big = createPreset('big')
      switchPreset(big.id)
      useProgress.getState().setModeStats('classic', long(6500))
      switchPreset(1)
      watch()
      expect(usage().warning).toBe(true)
      deletePreset(big.id)
      shownIsTrue()
      expect(usage().warning).toBe(false)
    })

    it('on the mounted app: the line, its colour and the gear dot are right at once', () => {
      useProgress.getState().setModeStats('classic', long(6500))
      // (Above the remembered limit, as this group's device is, the limit reads as wrong and
      // opening ⚙ would measure it afresh — against the test runner's own, far larger, allowance.)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
        if (key === SCRATCH_KEY) throw quotaError()
        return realSetItem.call(this, key, value)
      })
      mountApp()
      pressKey('Escape') // the popup the crossing opened
      expect(gearLit()).toBe(true)
      expect(gearReason()).toBe('storage')
      openSettings()
      expect(line().className).toContain('storage-warn')
      act(() => useProgress.getState().setModeStats('classic', long(0)))
      expect(line().className).not.toContain('storage-warn')
      expect(line().textContent).toBe(`Storage used: ${usagePercent(storageUsed(), 40_000)}%`)
      expect(storageUsed()).toBe(everything()) // the boot's own markers included
      expect(gearLit()).toBe(false)
    })

    // The gear's one dot has two reasons and was the update's blue for both. Its colour now says
    // which: amber for the storage warning — the colour of the line it points at — and amber when
    // both are true.
    it('the gear dot is the storage warning`s colour while there is one, an update`s otherwise', () => {
      mountApp()
      act(() => markUpdateDot(GEAR_DOT_KEY)) // an update landed: the dot is lit, and it is news
      expect(gearLit()).toBe(true)
      expect(gearReason()).toBe('update')
      act(() => useProgress.getState().setModeStats('classic', long(6500))) // …and now the warning too
      pressKey('Escape')
      expect(gearLit()).toBe(true)
      expect(gearReason()).toBe('storage') // both are live: storage wins
      act(() => useProgress.getState().setModeStats('classic', long(0)))
      expect(gearLit()).toBe(true) // the update is still unseen
      expect(gearReason()).toBe('update')
    })

    it('…and the stylesheet gives that reason the "Storage used" line`s own amber, in every theme', () => {
      const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      // One value per theme row, worn by the dot and by the line: amber on the dark themes (which
      // take the root row's), a deeper amber on the two light ones.
      const row = (selector) =>
        css.split(/\r?\n/).find((line) => line.startsWith(`${selector}{--bg1:`))
      expect(row(':root')).toContain('--storage-warn:rgba(251,191,36,.95)')
      for (const theme of ['light', 'parchment'])
        expect(row(`[data-theme="${theme}"]`)).toContain('--storage-warn:rgba(180,83,9,.95)')
      for (const theme of ['dusk', 'midnight', 'nebula'])
        expect(row(`[data-theme="${theme}"]`)).not.toContain('--storage-warn')
      expect((css.match(/--storage-warn:/g) ?? []).length).toBe(3)
      expect(css).toContain(
        '[data-update-dot][data-reason="storage"]{background:var(--storage-warn)}',
      )
      expect(css).toContain('.storage-warn{color:var(--storage-warn)}')
      // The amber rule comes AFTER the light themes' blue one. The two selectors weigh the same,
      // so the later one wins — placed before it, a light theme's storage dot would stay blue.
      const blueLight = css.indexOf('[data-theme="light"] [data-update-dot],')
      const amber = css.indexOf('[data-update-dot][data-reason="storage"]{')
      expect(blueLight).toBeGreaterThan(-1)
      expect(amber).toBeGreaterThan(blueLight)
    })
  })

  it('a change made by another tab is counted from the browser’s own report of it', () => {
    watch()
    const before = storageUsed()
    localStorage.setItem('cg-settings-v1~p7', 'x'.repeat(5000)) // the other tab's write, as seen here
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'cg-settings-v1~p7',
        newValue: 'x'.repeat(5000),
        storageArea: localStorage,
      }),
    )
    expect(storageUsed()).toBe(everything())
    expect(storageUsed()).toBe(before + 'cg-settings-v1~p7'.length + 5000)
    localStorage.clear() // …and a clear there is counted again from nothing
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }))
    expect(storageUsed()).toBe(0)
  })

  // The browser's report arrives after the fact, carrying the text the OTHER tab wrote. If this page
  // has saved to the same place since, that text is the older one — and the count used to be moved
  // by it.
  it('a report that arrives after this page has saved there again is counted as what is there now', () => {
    watch()
    const KEY = 'cg-lookup-v1'
    const theirs = 'x'.repeat(4000)
    localStorage.setItem(KEY, theirs) // the other tab's save…
    writeItem(localStorage, KEY, 'mine') // …then this page's, before the report of theirs arrives
    window.dispatchEvent(
      new StorageEvent('storage', { key: KEY, newValue: theirs, storageArea: localStorage }),
    )
    expect(localStorage.getItem(KEY)).toBe('mine')
    expect(storageUsed()).toBe(everything())
  })

  it('opening the popup counts the device afresh, so a marker written around the door is in it', () => {
    watch()
    markUpdateDot(GEAR_DOT_KEY) // src/changelog writes its own few characters
    expect(storageUsed()).toBe(everything() - GEAR_DOT_KEY.length - 1)
    usage().openPopup()
    expect(storageUsed()).toBe(everything())
  })
})

// What the popup and the storage-full notice may truthfully recommend (store/amnesic's
// resetStatsFreesRoom, and the two remedies that hold under every value).
describe.each(['off', 'stats', 'full'])(
  'what makes room while the preset is on Amnesic: %s',
  (mode) => {
    const manyLookups = Array.from({ length: 900 }, (_, i) => ({
      id: `e${i}`,
      y: 1000 + i,
      m: 3,
      d: 4,
    }))
    beforeEach(() => {
      freshPage(100_000)
      useProgress.getState().setModeStats('classic', long(6500)) // saved, on Off
      useLookupHistory.getState().setHistory(manyLookups)
      if (mode !== 'off') setPresetAmnesic(1, mode)
      watch()
    })

    it(`Reset Stats ${mode === 'off' ? 'frees the mode’s solve times' : 'clears the session’s copy and frees nothing'}`, () => {
      expect(resetStatsFreesRoom(mode)).toBe(mode === 'off')
      const saved = localStorage.getItem('cg-progress-v1')
      const before = storageUsed()
      useProgress.getState().setModeStats('classic', long(3)) // play, on whichever copy is live
      useProgress.getState().setModeStats('classic', long(0)) // Reset Stats
      if (mode === 'off') expect(before - storageUsed()).toBeGreaterThan(40_000)
      else {
        expect(storageUsed()).toBe(before)
        expect(localStorage.getItem('cg-progress-v1')).toBe(saved)
      }
    })

    it('Clear History frees the Lookup history', () => {
      const before = storageUsed()
      useLookupHistory.getState().setHistory([])
      expect(before - storageUsed()).toBeGreaterThan(30_000)
    })

    it('deleting a preset frees everything it holds — the one you are on included', () => {
      createPreset('spare')
      const before = storageUsed()
      deletePreset(1)
      expect(before - storageUsed()).toBeGreaterThan(40_000)
      expect(localStorage.getItem('cg-progress-v1')).toBeNull()
    })
  },
)

// ── The limit ─────────────────────────────────────────────────────────────────────────────────

// A storage area with a quota, counting what a measurement costs it.
function fakeArea(limit, held = 0) {
  const map = new Map()
  if (held) map.set('held', 'h'.repeat(held - 4))
  const size = () => [...map].reduce((sum, [k, v]) => sum + k.length + v.length, 0)
  const cost = { tries: 0, written: 0 }
  return {
    cost,
    keys: () => [...map.keys()],
    getItem: (k) => map.get(k) ?? null,
    removeItem: (k) => void map.delete(k),
    setItem(k, v) {
      cost.tries++
      const was = map.get(k)
      if (size() - (was === undefined ? 0 : k.length + was.length) + k.length + v.length > limit)
        throw quotaError()
      cost.written += k.length + v.length
      map.set(k, v)
    },
  }
}
const guessesFor = (held) => DOCUMENTED_LIMITS.map((limit) => limit - held)

describe('measuring how much more a device will take', () => {
  it('a documented limit is confirmed exactly, in one large write that fits and one that does not', () => {
    for (const limit of DOCUMENTED_LIMITS) {
      const area = fakeArea(limit, 1000)
      expect(measureRoom(area, MAX_STORAGE_LIMIT - 1000, guessesFor(1000), 4096)).toBe(limit - 1000)
      // The empty key, the guess, the guess plus one — and, for the smaller limit, the larger
      // limit's guess refused first (a refused write stores nothing).
      expect(area.cost.tries).toBeLessThanOrEqual(4)
      expect(area.cost.written).toBe(SCRATCH_KEY.length + limit - 1000)
      expect(area.keys()).toEqual(['held']) // the scratch key is gone
    }
  })

  it('any other limit is found to within the tolerance, never above it, in a bounded number of tries', () => {
    for (const limit of [3_000_000, 1_234_567, 7_777_777, 40_000]) {
      for (const held of [0, 1000, limit - 300, limit - 5, limit]) {
        const area = fakeArea(limit, held)
        const room = measureRoom(area, MAX_STORAGE_LIMIT - held, guessesFor(held), 4096)
        expect(room).toBeLessThanOrEqual(limit - held)
        expect(room).toBeGreaterThanOrEqual(Math.min(limit - held, SCRATCH_KEY.length) - 16)
        expect(limit - held - room).toBeLessThan(4096 + SCRATCH_KEY.length)
        expect(area.cost.tries).toBeLessThanOrEqual(20)
        expect(area.keys()).toEqual(held ? ['held'] : [])
      }
    }
  })

  it('a device that is already nearly full costs next to nothing to measure', () => {
    const held = CHROMIUM - 3000
    const area = fakeArea(CHROMIUM, held)
    expect(measureRoom(area, MAX_STORAGE_LIMIT - held, guessesFor(held), 4096)).toBe(3000)
    expect(area.cost.written).toBeLessThan(4000)
  })

  it('a device with no limit in reach is written to at the most it will ever try, and no further', () => {
    const area = fakeArea(Infinity, 500)
    expect(measureRoom(area, MAX_STORAGE_LIMIT - 500, guessesFor(500), 4096)).toBe(
      MAX_STORAGE_LIMIT - 500,
    )
    // The empty key; the larger guess and one past it, both fitting; then the most — and that is
    // all (the smaller guess is below what is already known to fit, and is never tried).
    expect(area.cost.tries).toBe(4)
  })

  it('a scratch key left by a crash is removed before anything is measured', () => {
    const area = fakeArea(50_000)
    area.setItem(SCRATCH_KEY, 'x'.repeat(40_000))
    expect(measureRoom(area, MAX_STORAGE_LIMIT, [], 1)).toBe(50_000)
    expect(area.keys()).toEqual([])
  })

  it('anything but "no room" is not swallowed, and still leaves no scratch key', () => {
    const area = fakeArea(50_000)
    area.setItem = () => {
      throw new Error('disk on fire')
    }
    expect(() => measureRoom(area, 1000, [], 1)).toThrow('disk on fire')
    expect(area.keys()).toEqual([])
  })
})

describe('the limit', () => {
  it('is not known on a device that has not been measured: no percentage, no warning', () => {
    freshPage(null)
    fill()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ limit: null, percent: null, warning: false, popupOpen: false })
  })

  // Safari's documented allowance — the size the old assumed figure got wrong by half — and one
  // no browser documents.
  it.each([
    ['half of Chromium’s', SAFARI, true],
    ['a size nobody documents', 3_333_333, false],
  ])(
    'is measured as the app starts, before anything is on screen — a device whose limit is %s',
    (_name, limit, exact) => {
      freshPage(null)
      useProgress.getState().setModeStats('classic', long(3000))
      const writes = deviceLimit(limit)
      measureStorageLimit() // the entry's call, ahead of the first render
      if (exact) expect(usage().limit).toBe(limit)
      else {
        expect(usage().limit).toBeLessThanOrEqual(limit)
        expect(usage().limit).toBeGreaterThan(limit - 4200)
      }
      expect(usage().percent).toBe(usagePercent(everything(), usage().limit))
      expect(localStorage.getItem(SCRATCH_KEY)).toBeNull()
      expect(localStorage.getItem(LIMIT_KEY)).toBe(String(usage().limit))
      // …and it is not measured again: not when ⚙ or the popup opens, not on the next page.
      writes.mockClear()
      measureStorageLimit()
      usage().openPopup()
      usage().closePopup()
      freshPage(null)
      measureStorageLimit()
      watch()
      expect(scratchWrites(writes)).toHaveLength(0)
      expect(usage().limit).toBe(Number(localStorage.getItem(LIMIT_KEY)))
    },
  )

  it('the measurement at the start opens nothing: there is no screen yet to open it over', () => {
    freshPage(null)
    fill(SAFARI - 20_000)
    deviceLimit(SAFARI)
    measureStorageLimit()
    expect(usage().limit).toBe(SAFARI)
    expect(usage()).toMatchObject({ percent: 99, warning: true, popupOpen: false })
    watch() // the app is on screen, and nobody is busy
    expect(usage().popupOpen).toBe(true)
  })

  // The device used to be measured from a poll that needed no solve clock running — and a casual
  // mode with its timing shown always has one, so there it was never measured at all; and an open
  // popup held the poll off, the Storage used popup included.
  it('a timed question on screen does not stop ⚙, or the popup, from measuring', () => {
    freshPage(null)
    deviceLimit(SAFARI)
    render(<Clock runs={true} />)
    watch()
    expect(usage().limit).toBeNull()
    usage().openPopup() // "Storage used: —", tapped
    expect(usage()).toMatchObject({ limit: SAFARI, popupOpen: true })
    expect(usage().percent).toBe(usagePercent(everything(), SAFARI))
  })

  it('it is not taken while a round, run or flash is under way, or while a save is held', () => {
    freshPage(null)
    deviceLimit(SAFARI)
    watch()
    const { rerender } = render(<Clock live />)
    measureStorageLimit()
    expect(usage().limit).toBeNull()
    rerender(<Clock />)

    act(() => useStorageHealth.setState({ unsaved: true }))
    measureStorageLimit()
    expect(usage().limit).toBeNull()
    act(() => useStorageHealth.setState({ unsaved: false }))

    measureStorageLimit() // nothing in the way any more
    expect(usage().limit).toBe(SAFARI)
  })

  it('a refused save teaches a limit at once, and it is measured properly when nothing is refused', () => {
    freshPage(null)
    const limit = 1_000_000
    fill(990_000)
    deviceLimit(limit)
    watch()
    writeItem(localStorage, 'cg-big', 'y'.repeat(50_000)) // refused, and held
    expect(useStorageHealth.getState().unsaved).toBe(true)
    // What the device held when it said no — short of the truth by up to the refused save.
    expect(usage().limit).toBe(everything())
    expect(usage().percent).toBe(100)
    expect(localStorage.getItem(LIMIT_KEY)).toMatch(/^\d+\?$/)
    measureStorageLimit()
    expect(usage().limit).toBe(everything()) // not measured while a save is held
    // …a later page, with nothing being refused, starts from what was learned, then measures.
    forgetStorageHealth()
    freshPage(null)
    refreshStorageUsage()
    expect(usage().percent).toBe(100)
    measureStorageLimit()
    expect(usage().limit).toBeLessThanOrEqual(limit)
    expect(usage().limit).toBeGreaterThan(limit - 4200)
    expect(usage().percent).toBe(99)
    expect(localStorage.getItem(LIMIT_KEY)).toBe(String(usage().limit))
  })

  // ★ THE WHOLE EPISODE: refuse, make room, land. The limit a refusal teaches used to be taught
  // again on every change while the save was held — so the remedy the notice recommends, which
  // empties the device, taught "the limit is the little that is left": 100% and the warning on a
  // device that was 2% full, written down for every other tab and the next open to inherit.
  it('the limit a refusal teaches is taught ONCE: making room while the save is held does not shrink it', () => {
    const LIMIT = 60_000
    const closeTo = (limit) => {
      expect(limit).toBeLessThanOrEqual(LIMIT)
      expect(limit).toBeGreaterThan(LIMIT - 4200)
    }
    freshPage(null)
    deviceLimit(LIMIT)
    measureStorageLimit()
    watch()
    closeTo(usage().limit)
    expect(localStorage.getItem(LIMIT_KEY)).toBe(String(usage().limit))
    let n = 1000
    for (; !useStorageHealth.getState().unsaved; n += 200)
      useProgress.getState().setModeStats('classic', long(n))
    const taught = usage().limit
    expect(taught).toBe(everything())
    expect(taught).toBeGreaterThan(LIMIT * 0.9)
    expect(usage().percent).toBe(100)
    const marker = localStorage.getItem(LIMIT_KEY)
    expect(marker).toMatch(/^\d+\?$/)

    useProgress.getState().setModeStats('classic', long(0)) // Reset Stats: the held save now fits
    expect(useStorageHealth.getState().unsaved).toBe(false)
    expect(usage().limit).toBe(taught)
    expect(localStorage.getItem(LIMIT_KEY)).toBe(marker)
    expect(usage().percent).toBe(usagePercent(everything(), LIMIT))
    expect(usage().percent).toBeLessThan(10)
    expect(usage().warning).toBe(false)

    measureStorageLimit() // the next time ⚙ opens: measured properly, and remembered as such
    closeTo(usage().limit)
    expect(localStorage.getItem(LIMIT_KEY)).toBe(String(usage().limit))
  })

  it('a device that fills while the SESSION’s area is already refusing still teaches its limit', () => {
    const real = Storage.prototype.setItem
    let full = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === sessionStorage || (full && key === 'cg-big')) throw quotaError()
      return real.call(this, key, value)
    })
    watch()
    writeItem(sessionStorage, 'cg-progress-v1', 'y')
    expect(usage().limit).toBe(CHROMIUM) // a refusal in sessionStorage teaches nothing about the device
    full = true
    writeItem(localStorage, 'cg-big', 'y')
    expect(usage().limit).toBe(everything())
  })

  it('a save refused before the count began is heard when it begins', () => {
    deviceLimit(1000)
    writeItem(localStorage, 'cg-big', 'y'.repeat(5000)) // one of the app's own, as it loaded
    expect(useStorageHealth.getState().unsaved).toBe(true)
    watch()
    expect(usage()).toMatchObject({ limit: everything(), percent: 100 })
  })

  it('usage found above the remembered limit means the limit was wrong: it is measured again', () => {
    freshPage(2000) // a limit remembered from some earlier, smaller allowance
    fill(100_000)
    deviceLimit(SAFARI)
    measureStorageLimit() // the next start
    expect(usage().limit).toBe(SAFARI)
    expect(usage().warning).toBe(false)
  })

  it('a second tab is told the limit by the first one’s marker, and does not measure', () => {
    freshPage(null)
    const writes = deviceLimit(SAFARI)
    watch()
    localStorage.setItem(LIMIT_KEY, String(SAFARI))
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: LIMIT_KEY,
        newValue: String(SAFARI),
        storageArea: localStorage,
      }),
    )
    expect(usage().limit).toBe(SAFARI)
    measureStorageLimit()
    expect(scratchWrites(writes)).toHaveLength(0)
  })

  // With no limit there is no percentage — which used to read as "back under the line", so the
  // marker was cleared and the popup shown a second time once the device had been measured.
  it('an announced crossing stays announced while there is no reading', () => {
    fill()
    watch()
    expect(usage().popupOpen).toBe(true)
    usage().closePopup()
    expect(localStorage.getItem(WARNED_KEY)).toBe('1')
    stop()
    localStorage.removeItem(LIMIT_KEY)
    freshPage(null) // the next page, on a device whose remembered limit is gone
    deviceLimit(CHROMIUM)
    watch()
    expect(usage().percent).toBeNull()
    expect(localStorage.getItem(WARNED_KEY)).toBe('1')
    measureStorageLimit()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
  })
})

describe('a measurement is invisible to everything that keeps track of saved data', () => {
  it('the scratch key is not counted, not listed, and another tab’s is not "your data changed"', () => {
    watch()
    const real = Storage.prototype.setItem
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'cg-held') throw quotaError()
      return real.call(this, key, value)
    })
    writeItem(localStorage, 'cg-held', 'mine') // a save this page is holding
    const before = storageUsed()
    // Another tab is measuring: its scratch key appears here, and the browser reports it.
    localStorage.setItem(SCRATCH_KEY, 'x'.repeat(100_000))
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: SCRATCH_KEY,
        newValue: 'x'.repeat(100_000),
        storageArea: localStorage,
      }),
    )
    expect(storageUsed()).toBe(before)
    expect(readItem(localStorage, 'cg-held')).toBe('mine') // still held
    // …and it was not retried on the strength of it.
    expect(refuse.mock.calls.filter(([key]) => key === 'cg-held')).toHaveLength(1)
    refreshStorageUsage() // a full count while it is there
    expect(storageUsed()).toBe(before)
    expect(readStorageUsage(localStorage).used).toBe(before)
    usage().openPopup()
    expect(usage().rows.reduce((sum, row) => sum + row.chars, 0)).toBe(before)
  })

  it('a save is never refused because of a scratch key: the key goes, and the save is tried again', () => {
    watch()
    deviceLimit(60_000)
    localStorage.setItem(SCRATCH_KEY, 'x'.repeat(50_000)) // left by a crash, or another tab's
    expect(writeItem(localStorage, 'cg-lookup-v1', 'y'.repeat(20_000))).toBe(true)
    expect(localStorage.getItem(SCRATCH_KEY)).toBeNull()
    expect(useStorageHealth.getState()).toMatchObject({ unsaved: false, noticeOpen: false })
    // …and a save that does not fit with it gone is refused as ever.
    expect(writeItem(localStorage, 'cg-big', 'y'.repeat(70_000))).toBe(false)
    expect(useStorageHealth.getState().unsaved).toBe(true)
  })

  it('a scratch key left by a crash is not counted at the next open, and goes at the measurement', () => {
    freshPage(null)
    localStorage.setItem(SCRATCH_KEY, 'x'.repeat(200_000))
    deviceLimit(SAFARI)
    refreshStorageUsage()
    expect(storageUsed()).toBe(everything() - SCRATCH_KEY.length - 200_000)
    measureStorageLimit()
    expect(localStorage.getItem(SCRATCH_KEY)).toBeNull()
    expect(usage().limit).toBe(SAFARI)
  })
})

describe('the popup opens by itself once per upward crossing of the line', () => {
  beforeEach(() => watch()) // the app is on screen: only then is there anything to open it over

  it('opens on the crossing — and not again while usage stays above, nor on a reload', () => {
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: false, popupOpen: false })
    fill()
    refreshStorageUsage()
    expect(usage().percent).toBeGreaterThanOrEqual(STORAGE_WARN_PERCENT)
    expect(usage()).toMatchObject({ warning: true, popupOpen: true })
    usage().closePopup()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
    freshPage() // a reload, or the app closed and opened again: the device remembers
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
  })

  it('a drop back under and a later rise is a NEW crossing', () => {
    fill()
    refreshStorageUsage()
    usage().closePopup()
    empty()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: false, popupOpen: false })
    expect(localStorage.getItem(WARNED_KEY)).toBeNull()
    fill()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: true, popupOpen: true })
  })

  it('does not open by itself while the device is refusing saves — the storage-full notice speaks', () => {
    useStorageHealth.setState({ unsaved: true, noticeOpen: true })
    fill()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
    // …and the crossing counts as announced: it does not pop up afterwards either.
    useStorageHealth.setState({ unsaved: false, noticeOpen: false })
    refreshStorageUsage()
    expect(usage().popupOpen).toBe(false)
  })

  it('tapping the line always opens it, warning or not — and above the line that IS the announcement', async () => {
    usage().openPopup()
    expect(usage()).toMatchObject({ warning: false, popupOpen: true })
    usage().closePopup()
    const { rerender } = render(<Clock runs={true} />)
    fill()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false }) // waiting for the clock
    usage().openPopup()
    usage().closePopup()
    rerender(<Clock runs={false} />) // the clock stops: nothing is left to announce
    await settled()
    expect(usage().popupOpen).toBe(false)
  })

  it('never over a timed question: it waits for the clock to stop — the line and the dot do not', async () => {
    const { rerender } = render(<Clock runs={true} />)
    fill()
    refreshStorageUsage()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
    expect(localStorage.getItem(WARNED_KEY)).toBeNull() // not "announced" until it has been
    // A reload before it could open does not lose it.
    freshPage()
    watch()
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
    rerender(<Clock runs={false} />) // an answered card, an ended round, a page with no clock
    await settled()
    expect(usage().popupOpen).toBe(true)
    expect(localStorage.getItem(WARNED_KEY)).toBe('1')
  })

  // One screen's clock stops and the next one's starts inside a single commit (a mode letter, a
  // preset switch, a Deduction type change). "The last clock stopped" used to be said in the gap
  // between the two, and the popup opened over the fresh question.
  it('not in the gap between one timed screen and the next', async () => {
    const Screens = ({ on }) => (
      <>
        <Clock runs={on === 'classic'} />
        <Clock runs={on === 'deduction'} />
      </>
    )
    const { rerender } = render(<Screens on="classic" />)
    fill()
    refreshStorageUsage()
    rerender(<Screens on="deduction" />) // the earlier sibling stops, the later one starts
    await settled()
    expect(usage().popupOpen).toBe(false)
    rerender(<Screens on="classic" />) // …and the other way round
    await settled()
    expect(usage().popupOpen).toBe(false)
    rerender(<Screens on="lookup" />)
    await settled()
    expect(usage().popupOpen).toBe(true)
  })

  it('not while a text box has the keyboard: it waits for the box to be left', async () => {
    const box = document.createElement('input')
    const next = document.createElement('input')
    const button = document.createElement('button')
    document.body.append(box, next, button)
    try {
      box.focus()
      fill()
      refreshStorageUsage()
      expect(usage()).toMatchObject({ warning: true, popupOpen: false })
      next.focus() // from one box straight into another: still typing
      await settled()
      expect(usage().popupOpen).toBe(false)
      button.focus()
      await settled()
      expect(usage().popupOpen).toBe(true)
    } finally {
      box.remove()
      next.remove()
      button.remove()
    }
  })

  it('…or for the player to open ⚙, which is stepping away from the question by choice', () => {
    render(<Clock runs={true} />)
    fill()
    refreshStorageUsage()
    expect(usage().popupOpen).toBe(false)
    announceStorageWarning(true)
    expect(usage().popupOpen).toBe(true)
  })

  it('…but not from a round, a run or a flash: that keeps running behind the menu', async () => {
    const { rerender } = render(<Clock live />)
    fill()
    refreshStorageUsage()
    announceStorageWarning(true)
    expect(usage().popupOpen).toBe(false)
    rerender(<Clock />)
    await settled()
    expect(usage().popupOpen).toBe(true)
  })

  it('a device too full to take the "already warned" marker still warns only once per page', async () => {
    fill()
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === WARNED_KEY) throw quotaError()
      return real.call(this, key, value)
    })
    refreshStorageUsage()
    expect(usage().popupOpen).toBe(true)
    usage().closePopup()
    expect(localStorage.getItem(WARNED_KEY)).toBeNull()
    // Everything that could reopen it: a recount, ⚙ opening, the clock stopping, a save.
    refreshStorageUsage()
    announceStorageWarning(true)
    const { rerender } = render(<Clock runs={true} />)
    rerender(<Clock runs={false} />)
    await settled()
    useProgress.getState().setModeStats('classic', long(3))
    expect(usage()).toMatchObject({ warning: true, popupOpen: false })
  })
})

describe('on the mounted app', () => {
  it('⚙ always shows "Storage used: N%", and tapping it opens the breakdown as a stacked popup', () => {
    useProgress.getState().setModeStats('classic', long(40))
    mountApp()
    expect(popup()).toBeNull()
    openSettings()
    expect(line().textContent).toMatch(/^Storage used: \d+%$/)
    expect(line().className).not.toContain('storage-warn')
    tap(line())
    const card = popup()
    expect(card).not.toBeNull()
    // The shared popup shell: its scrim, and the status-bar strip of the popup in front.
    const scrim = card.closest('[data-settings-modal]')
    expect(scrim.querySelector('[data-status-bar-dim]')).not.toBeNull()
    // It names the real controls, and never the word for the mechanism.
    const text = card.textContent
    for (const control of ['Reset Stats', 'Clear History', 'Manage Presets'])
      expect(text).toContain(control)
    expect(text).not.toMatch(/localStorage/i)
    pressKey('Escape')
    expect(popup()).toBeNull()
    expect(panel()).not.toBeNull() // only the popup closed; ⚙ is still open under it
  })

  it('past 80% it opens by itself once — not after a reload — and the warning stays', () => {
    fill()
    mountApp()
    expect(popup()).not.toBeNull()
    expect(popup().textContent).toContain('running out of room')
    pressKey('Escape')
    expect(popup()).toBeNull()
    unmountApp()
    freshPage()
    mountApp() // the reload
    expect(popup()).toBeNull()
    expect(gearLit()).toBe(true)
    expect(gear().getAttribute('aria-label')).toContain('storage almost full')
    // Opening ⚙ does NOT put the dot out while usage is still above the line…
    openSettings()
    expect(gearLit()).toBe(true)
    expect(line().className).toContain('storage-warn')
    expect(line().textContent).toContain('almost full')
    closeSettings()
    expect(gearLit()).toBe(true)
    // …it goes out when usage drops back under.
    act(() => {
      empty()
      refreshStorageUsage()
    })
    openSettings()
    expect(gearLit()).toBe(false)
    expect(line().className).not.toContain('storage-warn')
  })

  it('the update dot keeps its own rule: opening ⚙ clears THAT reason and only that one', () => {
    fill()
    refreshStorageUsage()
    usage().closePopup()
    markUpdateDot(GEAR_DOT_KEY)
    mountApp()
    expect(gearLit()).toBe(true)
    openSettings()
    expect(readUpdateDot(GEAR_DOT_KEY)).toBe(false) // the update breadcrumb was read
    expect(gearLit()).toBe(true) // the storage warning still stands
    empty()
    act(() => refreshStorageUsage())
    expect(gearLit()).toBe(false)
    // …and with no storage warning, the update dot alone behaves as it always has.
    closeSettings()
    act(() => markUpdateDot(GEAR_DOT_KEY))
    expect(gearLit()).toBe(true)
    openSettings()
    expect(gearLit()).toBe(false)
  })

  it('names each preset’s share when there is more than one', () => {
    createPreset('Weekend')
    useProgress.getState().setModeStats('classic', long(9000))
    mountApp()
    openSettings()
    tap(line())
    const rows = within(popup())
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(rows.some((t) => /^Preset 1: Classic solve times \(9,000\)\d+%$/.test(t))).toBe(true)
  })

  it('the storage-full notice opens on top of it, and closes first', () => {
    mountApp()
    openSettings()
    tap(line())
    act(() => useStorageHealth.setState({ unsaved: true, noticeOpen: true }))
    const notice = screen.getByRole('dialog', { name: /^Your progress isn.t being saved$/ })
    const scrims = [...document.querySelectorAll('[data-settings-modal]')]
    expect(scrims.at(-1).contains(notice)).toBe(true)
    expect(scrims.filter((s) => s.querySelector('[data-status-bar-dim]'))).toHaveLength(1)
    pressKey('Escape')
    expect(screen.queryByRole('dialog', { name: /^Your progress isn.t being saved$/ })).toBeNull()
    expect(popup()).not.toBeNull()
  })
})

describe('on the mounted app, while a date is being typed into Lookup', () => {
  // It used to open two seconds after the app did, with the keyboard in the box, and take it.
  it('the popup waits for the box to be left', async () => {
    fill()
    mountApp()
    pressKey('Escape') // the popup the crossing opened at once: nobody was busy
    act(() => {
      empty()
      refreshStorageUsage()
    })
    pressKey('L')
    const box = document.querySelector('input[type="text"]')
    act(() => box.focus())
    act(() => {
      fill() // a new crossing, with the keyboard in the box
      refreshStorageUsage()
    })
    expect(gearLit()).toBe(true)
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(box)
    await act(async () => box.blur())
    expect(popup()).not.toBeNull()
  })
})

describe('on the mounted app, with a timed question on screen', () => {
  const answer = (name) => tap(screen.getByRole('button', { name }))
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  beforeEach(() => {
    const s = useSettings.getState()
    s.setRandomFormat(false)
    s.setDateFormat('numeric-ymd')
    s.setMinY(1583)
    s.setMaxY(10000)
    useModePrefs.getState().setClassicTimingOff(false) // Classic's times are shown, so recorded
  })

  it('the popup does not open over it; the dot lights at once; a wrong answer is the moment', () => {
    mountApp()
    expect(popup()).toBeNull()
    act(() => {
      fill()
      refreshStorageUsage()
    })
    expect(gearLit()).toBe(true)
    expect(popup()).toBeNull()
    answer(correctDayName(readDate())) // right, and on to the next question: its clock is running
    expect(popup()).toBeNull()
    const right = correctDayName(readDate())
    answer(DAYS.find((day) => day !== right)) // judged: no time will be taken from this card
    expect(popup()).not.toBeNull()
  })

  it('opening ⚙ is the moment too', () => {
    mountApp()
    act(() => {
      fill()
      refreshStorageUsage()
    })
    expect(popup()).toBeNull()
    openSettings()
    expect(popup()).not.toBeNull()
  })

  it('with timing hidden nothing is being timed, and it opens at once', () => {
    useModePrefs.getState().setClassicTimingOff(true)
    mountApp()
    act(() => {
      fill()
      refreshStorageUsage()
    })
    expect(popup()).not.toBeNull()
  })

  // A casual mode with its timing shown always has a question on the clock — which is exactly where
  // the device used never to be measured, and the line stayed on its dash.
  it('a device not measured yet is measured as ⚙ opens: the line shows a number at once', () => {
    freshPage(null)
    deviceLimit(SAFARI)
    mountApp()
    expect(usage().percent).toBeNull()
    openSettings()
    expect(usage().limit).toBe(SAFARI)
    expect(line().textContent).toBe(`Storage used: ${usagePercent(everything(), SAFARI)}%`)
  })

  it('on a device that cannot be measured the line shows a dash, and says why', () => {
    freshPage(null)
    useProgress.getState().setModeStats('classic', long(40))
    // The measurement fails for a reason that is not "no room": there is nothing to learn from it.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SCRATCH_KEY) throw new DOMException('The operation is insecure.', 'SecurityError')
      return realSetItem.call(this, key, value)
    })
    mountApp()
    openSettings()
    // On screen: a dash, the app's sign for "no number to show". Read aloud: the reason.
    expect(line().textContent).toBe('Storage used: —not measured yet')
    expect(line().querySelector('[aria-hidden="true"]').textContent).toBe('—')
    expect(line().querySelector('.sr-only').textContent).toBe('not measured yet')
    expect(line().className).not.toContain('storage-warn')
    tap(line())
    const card = popup()
    expect(card).not.toBeNull()
    // The popup has the room to say it in words, and says what happens next.
    expect(card.querySelector('#storage-usage-title').textContent).toBe(
      'Storage used: not measured yet',
    )
    expect(card.textContent).toMatch(/couldn.t be measured, so there are no percentages/)
    expect(card.textContent).toMatch(/tries again each time it starts, and each time you open ⚙/)
    // What is saved is still listed by name — with no figure beside anything.
    const rows = within(card)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(rows).toContain('Classic solve times (40)')
    expect(card.textContent).not.toMatch(/%/)
  })
})

// ── WHAT THE POPUP LISTS, ON A DEVICE WITH LITTLE ON IT ──────────────────────────────────────────
// Everything under 1% used to be gathered into one line, so a device with little saved showed a
// single row — "Everything saved <1%" — that named nothing. The largest owners are now listed by
// name whatever they hold.
describe('the breakdown names what is saved at every size', () => {
  beforeEach(() => resetAppState())
  afterEach(unmountApp)
  const rowsShown = () =>
    within(popup())
      .getAllByRole('listitem')
      .filter((li) => !li.closest('.list-disc'))
      .map((li) => li.textContent)

  it('an almost-empty device: each thing saved is named, with "<1%" beside it', () => {
    useProgress.getState().setModeStats('classic', long(12))
    useLookupHistory.getState().setHistory([{ id: 'a', y: 2001, m: 1, d: 1 }])
    mountApp()
    openSettings()
    tap(line())
    const rows = rowsShown()
    expect(rows).toContain('Classic solve times (12)<1%')
    expect(rows).toContain('Lookup history (1)<1%')
    expect(rows.some((t) => /^Bests, settings and saved defaults<1%$/.test(t))).toBe(true)
    expect(rows.join('|')).not.toMatch(/Everything saved/)
    // A mode nobody has played is not named: "Flash solve times (0)" would be a line about nothing.
    expect(rows.join('|')).not.toMatch(/\(0\)/)
    expect(rows).toHaveLength(4)
    // The app's own few keys are nobody's to clear: they are the one unnamed line, and the last.
    expect(rows.at(-1)).toBe('Everything else<1%')
  })

  it('largest first; small owners past the first five are gathered, large ones never are', () => {
    freshPage(1_000_000)
    for (let i = 0; i < 4; i++) createPreset(`P${i + 2}`)
    // Preset 1: one big owner and four small ones.
    useProgress.getState().setModeStats('classic', long(9000))
    for (const silo of ['flash', 'dedDay', 'dedMonth', 'dedYear'])
      useProgress.getState().setModeStats(silo, long(30))
    mountApp()
    openSettings()
    tap(line())
    const rows = rowsShown()
    expect(rows[0]).toMatch(/^Preset 1: Classic solve times \(9,000\)\d+%$/)
    expect(rows.at(-1)).toMatch(/^Everything else/)
    expect(rows.length).toBe(6) // the five largest, and the rest in one line
  })
})

// ── "TO MAKE ROOM" SAYS ONLY WHAT IS TRUE FOR THE PRESET YOU ARE ON ──────────────────────────────
// Reset Stats frees room only while Amnesic is Off (store/amnesic's resetStatsFreesRoom, proved
// against the device in the group above). Both popups used to recommend it whatever the value.
describe.each([
  ['off', null],
  ['stats', 'Stats Only'],
  ['full', 'Full'],
])('the advice while the preset is on Amnesic: %s', (mode, label) => {
  beforeEach(() => {
    resetAppState()
    act(() => setPresetAmnesic(1, mode))
  })
  afterEach(unmountApp)
  const bullets = (card) => [...card.querySelectorAll('.list-disc li')].map((li) => li.textContent)

  it('the Storage used popup', () => {
    mountApp()
    openSettings()
    tap(line())
    const advice = bullets(popup())
    // The two that work under every value are always offered.
    expect(advice.some((t) => /^Clear History, on the Lookup page, empties/.test(t))).toBe(true)
    expect(
      advice.some((t) => /^Deleting a preset you no longer use removes everything/.test(t)),
    ).toBe(true)
    const offered = advice.some((t) => /^Reset Stats, on a mode.s own screen, clears/.test(t))
    expect(offered).toBe(resetStatsFreesRoom(mode))
    if (label === null) expect(advice).toHaveLength(3)
    else {
      // Named, because it is the first thing a player reaches for — as something that will NOT
      // help here, with the value by its name and what to do instead.
      const warning = advice.find((t) => /^Reset Stats won.t make room/.test(t))
      expect(warning).toContain(`Amnesic is on ${label}`)
      expect(warning).toMatch(/set Amnesic to Off first/)
      expect(advice.at(-1)).toBe(warning)
    }
  })

  it('the storage-full notice', () => {
    mountApp()
    act(() => useStorageHealth.setState({ unsaved: true, noticeOpen: true }))
    const notice = screen.getByRole('dialog', { name: /^Your progress isn.t being saved$/ })
    expect(notice.textContent).toMatch(/delete a preset you no longer use/)
    if (label === null) {
      expect(notice.textContent).toMatch(/or use\s+Reset Stats in a mode whose history/)
      expect(notice.textContent).not.toMatch(/won.t\s+make room/)
    } else {
      expect(notice.textContent).toMatch(/Clear History, on the Lookup page/)
      expect(notice.textContent).toMatch(
        new RegExp(`Reset Stats won.t\\s+make room while this preset.s Amnesic is on ${label}`),
      )
      expect(notice.textContent).not.toMatch(/or use\s+Reset Stats in a mode whose history/)
    }
    expect(notice.textContent).toMatch(/saved by itself/)
  })
})
