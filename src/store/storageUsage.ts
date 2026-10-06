import { create } from 'zustand'
import { PRESET_STORE_KEYS, FIRST_PRESET_ID, usePresets } from './presets.js'
import { parseTimesKey, CHUNK_TIMES } from './progressStorage.js'
import { isHolding, tryWriteItem, useStorageHealth } from './storageHealth.js'
import { useProgress } from './progress.js'
import { useLookupHistory, LOOKUP_HISTORY_KEY } from './lookupHistory.js'

// store/storageUsage.ts — HOW FULL THE DEVICE'S ROOM FOR THIS APP IS, AND WHAT IS FILLING IT.
//
// Every solve time is kept, so the saved data grows with play, and a browser gives a site a fixed
// allowance. store/storageHealth says what happens when a save does not fit; this file is the
// warning BEFORE that: a reading of how much is used and by what, the "Storage used: N%" line in ⚙
// that shows it, and a popup that opens by itself once when the reading first passes
// STORAGE_WARN_PERCENT (components/StorageUsagePopup).
//
// ★ THE READING is one pass over localStorage's keys — each key's name plus its text, in characters,
// which is the unit the allowance is counted in — sorted into who owns it:
//   • a preset's SOLVE TIMES, per mode: the times inside its progress key, and its sealed chunk keys
//     (store/progressStorage). ⚠ Every chunk key counts toward the SIZE, a superseded one included —
//     Reset Stats for that mode is what gets the room back — but the COUNT of times is the ones a
//     save actually names: the sealed count plus the tail.
//   • LOOKUP HISTORY (one list, shared by every preset);
//   • a preset's OTHER data: its Bests, ⚙ settings, per-mode setup and saved defaults;
//   • everything else (the preset list, small markers).
// It reads the device as it is — bound to localStorage and to nothing else: a session copy of an
// Amnesic preset lives in sessionStorage, which has an allowance of its own and empties itself.
//
// ★ THE LIMIT, AND HOW THE APP KNOWS IT. A browser has no way to ask how much localStorage a site
// may use. Three ways to know were weighed:
//   • MEASURE IT by writing until a write is refused — megabytes written on a device that may be
//     nearly full, and a crash mid-probe leaves the junk behind. Rejected.
//   • A DOCUMENTED FIGURE — DEFAULT_STORAGE_LIMIT below: 5,242,880 characters (10 MiB of two-byte
//     characters), which is what Chromium enforces and what was measured in it for this app. It is
//     the starting belief.
//   • LEARN IT FROM A REFUSAL — the first time the device refuses a save to localStorage, what it
//     holds at that moment IS its limit, to within the size of the refused change. That number
//     replaces the belief and is remembered (LIMIT_KEY), so a browser with a smaller allowance than
//     the figure reads honestly from then on. (Safari's allowance was not measured for this app.)
// The percentage never reads above 100.
//
// ★ WHEN IT IS READ. A reading costs a pass over everything saved, so it is not taken on every
// answer: once when the app opens, whenever ⚙ or the popup opens, at once when something the player
// can clear gets smaller (so the warning lifts the moment room is made), after every
// READ_EVERY_TIMES new solve times or READ_EVERY_LOOKUPS lookups, and when a save is refused.
//
// ★ "ALREADY WARNED" IS REMEMBERED ON THE DEVICE (WARNED_KEY), so the popup opens once per upward
// crossing: not on every open, not on a reload, not again while usage stays above the line. A
// reading back under the line forgets it, so a later rise is a new crossing and warns again. Live
// and staging share one copy of the data, and therefore this marker too: one warning per device.
// While the reading stays above the line the warning is still SHOWN — the ⚙ line in the warning
// colour and the gear's dot — and those two are derived from the reading itself, never stored.

/** The percentage at which the warning starts. */
export const STORAGE_WARN_PERCENT = 80
/** What Chromium allows one site's localStorage, in characters (keys and values together). */
export const DEFAULT_STORAGE_LIMIT = 5_242_880
const LIMIT_KEY = 'cg-storage-limit-v1'
const WARNED_KEY = 'cg-storage-warned-v1'
const READ_EVERY_TIMES = 1000
const READ_EVERY_LOOKUPS = 100

/** One owner's share of the storage. `count` is how many times / lookups it holds, where it has one. */
export type UsageRow =
  | { kind: 'times'; presetId: number; silo: string; chars: number; count: number }
  | { kind: 'lookup'; chars: number; count: number }
  | { kind: 'preset'; presetId: number; chars: number }
  | { kind: 'other'; chars: number }

export type UsageReading = { used: number; rows: UsageRow[] }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

// Which preset a per-preset store key belongs to, and whether it is the progress key — or null for
// a key that is not one of the four.
function parsePresetKey(key: string): { presetId: number; progress: boolean } | null {
  for (const base of Object.values(PRESET_STORE_KEYS)) {
    if (!key.startsWith(base)) continue
    const scope = key.slice(base.length)
    const presetId = scope === '' ? FIRST_PRESET_ID : /^~p\d+$/.test(scope) ? +scope.slice(2) : NaN
    if (!Number.isNaN(presetId)) return { presetId, progress: base === PRESET_STORE_KEYS.progress }
  }
  return null
}

/** The reading: everything in `area`, by owner. Reads only. */
export function readStorageUsage(area: Storage): UsageReading {
  const times = new Map<string, { presetId: number; silo: string; chars: number; count: number }>()
  const presets = new Map<number, number>()
  const lookup = { chars: 0, count: 0 }
  let other = 0
  let used = 0
  const timesRow = (presetId: number, silo: string) => {
    const id = `${presetId}:${silo}`
    let row = times.get(id)
    if (!row) times.set(id, (row = { presetId, silo, chars: 0, count: 0 }))
    return row
  }
  for (let i = 0; i < area.length; i++) {
    const key = area.key(i)
    if (key === null) continue
    const text = area.getItem(key) ?? ''
    const chars = key.length + text.length
    used += chars
    const chunk = parseTimesKey(key)
    if (chunk) {
      timesRow(chunk.presetId, chunk.silo).chars += chars
      continue
    }
    if (key === LOOKUP_HISTORY_KEY) {
      lookup.chars += chars
      try {
        const saved: unknown = JSON.parse(text)
        const history = isRecord(saved) && isRecord(saved.state) ? saved.state.history : null
        if (Array.isArray(history)) lookup.count = history.length
      } catch {
        /* unreadable: its size still counts */
      }
      continue
    }
    const owner = parsePresetKey(key)
    if (!owner) {
      other += chars
      continue
    }
    let rest = chars
    if (owner.progress) {
      try {
        const saved: unknown = JSON.parse(text)
        const stats = isRecord(saved) && isRecord(saved.state) ? saved.state.stats : null
        for (const [silo, s] of Object.entries(isRecord(stats) ? stats : {})) {
          if (!isRecord(s) || !Array.isArray(s.times)) continue
          const sealed = isRecord(s.sealed) && Array.isArray(s.sealed.ids) ? s.sealed.ids : []
          // The tail's own text, and the list that names the chunks.
          const own = JSON.stringify(s.times).length + JSON.stringify(sealed).length
          const row = timesRow(owner.presetId, silo)
          row.chars += own
          row.count += s.times.length + sealed.length * CHUNK_TIMES
          rest -= own
        }
      } catch {
        /* unreadable: the whole key counts as the preset's other data */
      }
    }
    presets.set(owner.presetId, (presets.get(owner.presetId) ?? 0) + rest)
  }
  const rows: UsageRow[] = [
    ...[...times.values()].map((row) => ({ kind: 'times' as const, ...row })),
    ...[...presets].map(([presetId, chars]) => ({ kind: 'preset' as const, presetId, chars })),
  ]
  if (lookup.chars) rows.push({ kind: 'lookup', ...lookup })
  if (other) rows.push({ kind: 'other', chars: other })
  rows.sort((a, b) => b.chars - a.chars)
  return { used, rows }
}

/** A whole-number percentage of `limit`, never above 100. */
export const usagePercent = (used: number, limit: number): number =>
  Math.min(100, Math.round((used / limit) * 100))

const readNumber = (key: string): number | null => {
  try {
    const n = Number(window.localStorage.getItem(key))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export type StorageUsageState = UsageReading & {
  /** The device's limit, in characters: the documented figure until a refusal has taught the real one. */
  limit: number
  percent: number
  /** At or past the line: the ⚙ line wears the warning colour and the gear its dot. */
  warning: boolean
  /** The breakdown popup is up — opened by the ⚙ line, or by itself on a crossing. */
  popupOpen: boolean
  openPopup: () => void
  closePopup: () => void
}

export const useStorageUsage = create<StorageUsageState>()((set) => ({
  used: 0,
  rows: [],
  limit: DEFAULT_STORAGE_LIMIT,
  percent: 0,
  warning: false,
  popupOpen: false,
  openPopup: () => {
    refreshStorageUsage() // the popup shows the device as it is now
    set({ popupOpen: true })
  },
  closePopup: () => set({ popupOpen: false }),
}))

/**
 * Take a reading now, and act on it: the limit a refusal teaches, the percentage, the warning, and —
 * once per upward crossing of the line — the popup. Never throws: a browser that refuses
 * localStorage has nothing saved and reads as empty.
 */
export function refreshStorageUsage(): void {
  let area: Storage
  let reading: UsageReading
  try {
    area = window.localStorage
    reading = readStorageUsage(area)
  } catch {
    return
  }
  // ★ A save to THIS area is being held: the device is full at what it holds right now, and that is
  // its limit. Remembered, so the next open starts from the truth — best-effort (a full device may
  // refuse even that; it is then learned again at the next refusal).
  let limit = readNumber(LIMIT_KEY) ?? DEFAULT_STORAGE_LIMIT
  if (isHolding(area) && reading.used > 0 && reading.used !== limit) {
    limit = reading.used
    tryWriteItem(area, LIMIT_KEY, String(limit))
  }
  const percent = usagePercent(reading.used, limit)
  const warning = percent >= STORAGE_WARN_PERCENT
  // Once per crossing. ⚠ The popup does not open by itself while the device is REFUSING saves: the
  // storage-full notice is the one that speaks then (components/StorageFullNotice — it says more,
  // and it says it now). The crossing still counts as announced.
  const warned = readNumber(WARNED_KEY) !== null
  let announce = false
  if (warning && !warned) {
    tryWriteItem(area, WARNED_KEY, '1')
    announce = !useStorageHealth.getState().unsaved
  } else if (!warning && warned) {
    area.removeItem(WARNED_KEY)
  }
  useStorageUsage.setState((s) => ({
    ...reading,
    limit,
    percent,
    warning,
    popupOpen: s.popupOpen || announce,
  }))
}

// How much the player could clear, cheaply: every saved solve time, Best, lookup and preset.
const clearable = () => {
  const progress = useProgress.getState()
  let times = 0
  for (const silo of Object.values(progress.stats)) times += silo.times.length
  const bests =
    Object.keys(progress.blitzBest).length +
    Object.keys(progress.suddenBest).length +
    Object.keys(progress.suddenAmBest).length +
    Object.keys(progress.aoxBest).length
  return {
    times,
    lookups: useLookupHistory.getState().history.length,
    rest: bests + usePresets.getState().presets.length,
  }
}

/**
 * Start keeping the reading current for this page: one reading now, then one whenever something the
 * player can clear gets smaller, the saved data has grown by a step, or a save is refused. Called
 * once, by App's boot effect; returns the undo (tests).
 */
export function watchStorageUsage(): () => void {
  // `seen` is what the last change left; `read` is what the last reading saw.
  let seen = clearable()
  let read = seen
  refreshStorageUsage()
  const look = () => {
    const now = clearable()
    const smaller = now.times < seen.times || now.lookups < seen.lookups || now.rest < seen.rest
    const grown =
      now.times - read.times >= READ_EVERY_TIMES || now.lookups - read.lookups >= READ_EVERY_LOOKUPS
    seen = now
    if (!smaller && !grown) return
    read = now
    refreshStorageUsage()
  }
  const stops = [
    useProgress.subscribe(look),
    useLookupHistory.subscribe(look),
    usePresets.subscribe(look),
    useStorageHealth.subscribe((s, was) => {
      if (s.unsaved !== was.unsaved) refreshStorageUsage()
    }),
  ]
  return () => stops.forEach((stop) => stop())
}
