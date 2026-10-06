// @vitest-environment jsdom
// storageUsage — the early "storage is getting full" warning (store/storageUsage, the ⚙ panel's
// "Storage used" line, components/StorageUsagePopup).
//
// What is pinned: the READING (every key counted, sorted to the right owner; a chunk nobody names
// counts toward the size and not toward the number of times); the LIMIT (the documented figure until
// a refused save teaches the real one); the popup opening by itself ONCE per upward crossing of 80%
// — not on a reload, not while usage stays above, again after a drop and a rise; the warning that
// stays (the line's colour, the gear's dot) and what does and does not clear it; and its place
// beside the storage-full notice.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, cleanup, within, act } from '@testing-library/react'
import {
  useStorageUsage,
  readStorageUsage,
  refreshStorageUsage,
  watchStorageUsage,
  usagePercent,
  DEFAULT_STORAGE_LIMIT,
  STORAGE_WARN_PERCENT,
} from '../src/store/storageUsage.js'
import { useStorageHealth, writeItem, forgetStorageHealth } from '../src/store/storageHealth.js'
import { useProgress, makeProgressDefaults } from '../src/store/progress.js'
import { useLookupHistory } from '../src/store/lookupHistory.js'
import { createPreset } from '../src/store/presetControl.js'
import { GEAR_DOT_KEY, markUpdateDot, readUpdateDot } from '../src/changelog.js'
import { seedSealed, chunkId } from './helpers/progressWorld.js'
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

const FILLER = 'zz-test-filler'
// Past the warning line of the documented limit, with room left for the app's own saves.
const fill = (chars = 4_300_000) => localStorage.setItem(FILLER, 'x'.repeat(chars - FILLER.length))
const empty = () => localStorage.removeItem(FILLER)
const freshPage = () =>
  useStorageUsage.setState({ used: 0, rows: [], percent: 0, warning: false, popupOpen: false })
const usage = () => useStorageUsage.getState()
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
const popup = () => screen.queryByRole('dialog', { name: /^Storage used: \d+%$/ })
const line = () => panel().getByRole('button', { name: /^Storage used: \d+%/ })
const gearLit = () => gear().querySelector('[data-update-dot]').getAttribute('data-lit') === 'true'

beforeEach(() => {
  resetAppState()
  forgetStorageHealth()
  freshPage()
})
afterEach(() => {
  unmountApp()
  vi.restoreAllMocks()
})

describe('the reading', () => {
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
    const everything = Object.entries({ ...localStorage }).reduce(
      (sum, [k, v]) => sum + k.length + v.length,
      0,
    )
    expect(reading.used).toBe(everything)
    expect(reading.rows.reduce((sum, row) => sum + row.chars, 0)).toBe(everything)
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
    expect(usagePercent(0, DEFAULT_STORAGE_LIMIT)).toBe(0)
    expect(usagePercent(DEFAULT_STORAGE_LIMIT * 0.796, DEFAULT_STORAGE_LIMIT)).toBe(80)
    expect(usagePercent(DEFAULT_STORAGE_LIMIT * 3, DEFAULT_STORAGE_LIMIT)).toBe(100)
  })
})

describe('the limit', () => {
  it('starts as the documented figure', () => {
    refreshStorageUsage()
    expect(usage().limit).toBe(DEFAULT_STORAGE_LIMIT)
    expect(DEFAULT_STORAGE_LIMIT).toBe(10 * 1024 * 1024 * 0.5)
  })

  it('is learned from the first save the device refuses, and remembered', () => {
    fill(1_000_000)
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'cg-big') throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, key, value)
    })
    writeItem(localStorage, 'cg-big', 'y') // refused, and held
    expect(useStorageHealth.getState().unsaved).toBe(true)
    refreshStorageUsage()
    const used = usage().used
    expect(usage().limit).toBe(used) // what the device held when it said no
    expect(usage().percent).toBe(100)
    // …a later open, with nothing being refused, still knows.
    forgetStorageHealth()
    freshPage()
    refreshStorageUsage()
    expect(usage().limit).toBe(used)
  })

  it('a refusal in sessionStorage teaches nothing about the device', () => {
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === sessionStorage) throw new DOMException('full', 'QuotaExceededError')
      return real.call(this, key, value)
    })
    writeItem(sessionStorage, 'cg-progress-v1', 'y')
    refreshStorageUsage()
    expect(usage().limit).toBe(DEFAULT_STORAGE_LIMIT)
  })
})

describe('the popup opens by itself once per upward crossing of the line', () => {
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

  it('tapping the line always opens it, warning or not', () => {
    usage().openPopup()
    expect(usage()).toMatchObject({ warning: false, popupOpen: true })
  })
})

describe('when the reading is taken', () => {
  it('at once when something the player can clear gets smaller; after a step of growth; not per answer', () => {
    const read = vi.spyOn(Storage.prototype, 'key')
    const readings = () => {
      const n = read.mock.calls.length
      read.mockClear()
      return n > 0
    }
    const stop = watchStorageUsage()
    expect(readings()).toBe(true) // one when the app opens
    useProgress.getState().setModeStats('classic', long(10))
    useProgress.getState().setModeStats('classic', long(11))
    expect(readings()).toBe(false) // an answer does not cost a pass over everything saved
    useProgress.getState().setModeStats('classic', long(1011))
    expect(readings()).toBe(true) // 1,000 more solve times
    useProgress.getState().setModeStats('classic', long(0)) // Reset Stats
    expect(readings()).toBe(true)
    useLookupHistory.getState().setHistory([])
    expect(readings()).toBe(false)
    stop()
    useProgress.getState().setModeStats('classic', long(5000))
    expect(readings()).toBe(false)
  })

  it('the warning lifts the moment room is made — no reopen of ⚙ needed', () => {
    const stop = watchStorageUsage()
    useProgress.getState().setModeStats('classic', long(50))
    fill()
    refreshStorageUsage()
    expect(usage().warning).toBe(true)
    empty() // (stands in for the room a reset frees)
    useProgress.getState().setModeStats('classic', long(0))
    expect(usage().warning).toBe(false)
    stop()
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
    empty()
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
