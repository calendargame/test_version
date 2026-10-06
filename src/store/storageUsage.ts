import { create } from 'zustand'
import { PRESET_STORE_KEYS, presetIdOfSuffix } from './presets.js'
import { parseTimesKey, CHUNK_TIMES } from './progressStorage.js'
import {
  isHolding,
  tryWriteItem,
  removeItem,
  watchStorage,
  measureRoom,
  useStorageHealth,
  SCRATCH_KEY,
} from './storageHealth.js'
import type { StorageWatcher } from './storageHealth.js'
import { LOOKUP_HISTORY_KEY } from './lookupHistory.js'
import { isRecord } from './json.js'
import { isSolveClockRunning, onSolveClocksStopped } from '../lib/solveClock.js'
import { captureError } from '../observability/sentry.js'

// store/storageUsage.ts — HOW FULL THE DEVICE'S ROOM FOR THIS APP IS, AND WHAT IS FILLING IT.
//
// Every solve time is kept, so the saved data grows with play, and a browser gives a site a fixed
// allowance. store/storageHealth says what happens when a save does not fit; this file is the
// warning BEFORE that: how much is used, the "Storage used" line in ⚙ that shows it, and a popup
// that opens by itself once when usage first passes STORAGE_WARN_PERCENT
// (components/StorageUsagePopup).
//
// ★ HOW MUCH IS USED — A RUNNING COUNT, NEVER A RE-READ. What the allowance counts is every key's
// name plus its text, in characters. The device is counted ONCE when the page loads (one pass over
// its keys); from then on store/storageHealth — the door every save goes through — reports each
// write and each removal AFTER it has landed, with the text now there, and the count moves by
// exactly that difference. Another tab's changes arrive the same way (the browser's `storage`
// event, through the same door). So the figure is right the moment a save lands or a reset, a Clear
// History or a preset delete takes something away — and an answer costs it one addition, however
// much is saved. (The two leaf modules that write a few characters around the door are picked up at
// the next count: a page load, or the popup opening.)
// It counts localStorage and nothing else: a session copy of an Amnesic preset lives in
// sessionStorage, which has an allowance of its own and empties itself.
//
// ★ WHAT IS FILLING IT is a second, slower reading (readStorageUsage) — it has to look inside the
// saved progress to tell one mode's solve times from another's — and only the popup shows it, so it
// is taken when the popup opens and at no other time. Sorted into who owns what:
//   • a preset's SOLVE TIMES, per mode: the times inside its progress key, and its sealed chunk keys
//     (store/progressStorage). ⚠ Every chunk key counts toward the SIZE, a superseded one included —
//     Reset Stats for that mode is what gets the room back — but the COUNT of times is the ones a
//     save actually names: the sealed count plus the tail.
//   • LOOKUP HISTORY (one list, shared by every preset);
//   • a preset's OTHER data: its Bests, ⚙ settings, per-mode setup and saved defaults;
//   • everything else (the preset list, small markers).
//
// ★ THE LIMIT IS MEASURED, NOT ASSUMED. A browser has no way to ask how much localStorage a site may
// use, and the browsers do not agree (Chromium allows 5,242,880 characters; Safari is documented at
// half that). A percentage of an assumed figure would read "50%" on a device that is full. So, once
// per device, the app finds out how many MORE characters the device will take
// (store/storageHealth's measureRoom — it writes one scratch key and removes it again), and the
// limit is what is used plus that. It is remembered (LIMIT_KEY) and never measured again unless it
// is shown to be wrong:
//   • a save the device REFUSES teaches a limit on the spot — what the device holds at that moment —
//     marked as not yet measured, because it is short by up to the size of the refused save. It is
//     measured properly once nothing is being refused any more;
//   • usage found ABOVE the remembered limit means the limit was too low: measured again.
// ⚠ WHEN IT MAY RUN. Measuring stops the page for a moment (tens of milliseconds where the first
// guess is right), so it waits for a moment nobody can feel it and nothing can be disturbed: the
// page visible, NO SOLVE CLOCK RUNNING (lib/solveClock), no popup open, no save being held. It looks
// for that moment every IDLE_MS while a measurement is owed, and not at all otherwise.
// ⚠ UNTIL IT HAS RUN there is no percentage, and none is shown: `percent` is null, the ⚙ line shows
// a dash, and there is no warning. An honest blank, for the two seconds it usually lasts.
//
// ★ THE POPUP OPENS BY ITSELF ONCE PER UPWARD CROSSING — and never over a timed question. The line's
// colour and the gear's dot change the moment usage crosses (they are read straight off the count);
// the popup waits for the next moment no solve clock is running — an answered card, an ended round
// or run, an idle screen — or for the player to open ⚙, which is the player stepping away from the
// question by choice. "Already warned" is written down only when the popup has actually opened
// (WARNED_KEY — on the device, so not on every open, not on a reload, not again while usage stays
// above the line; and for this page as well, in case a full device cannot take even that marker).
// A reading back under the line forgets it, so a later rise is a new crossing. Live and staging
// share one copy of the data, and therefore this marker too: one warning per device.

/** The percentage at which the warning starts. */
export const STORAGE_WARN_PERCENT = 80
/**
 * The allowances the browsers document, in characters (keys and values together): Chromium's —
 * confirmed by measurement for this app — and Safari's. They are where the measurement LOOKS FIRST
 * (a right guess is confirmed in two tries); neither is ever taken on trust.
 */
export const DOCUMENTED_LIMITS: readonly number[] = [5_242_880, 2_621_440]
/**
 * The most the measurement will ever try: twice the largest documented allowance. A device that
 * takes even this much is recorded as having exactly this much — which can only make it read
 * FULLER than it is, never emptier — rather than being written to without end.
 */
export const MAX_STORAGE_LIMIT = 10_485_760
// How close the measurement gets when no guess is right: under a tenth of a percent of any limit.
const MEASURE_WITHIN = 4096
/** How often a measurement that is owed looks for a moment to run in. */
export const IDLE_MS = 2000
const LIMIT_KEY = 'cg-storage-limit-v1'
const WARNED_KEY = 'cg-storage-warned-v1'

/** One owner's share of the storage. `count` is how many times / lookups it holds, where it has one. */
export type UsageRow =
  | { kind: 'times'; presetId: number; silo: string; chars: number; count: number }
  | { kind: 'lookup'; chars: number; count: number }
  | { kind: 'preset'; presetId: number; chars: number }
  | { kind: 'other'; chars: number }

export type UsageReading = { used: number; rows: UsageRow[] }

// Which preset a per-preset store key belongs to, and whether it is the progress key — or null for
// a key that is not one of the four.
function parsePresetKey(key: string): { presetId: number; progress: boolean } | null {
  for (const base of Object.values(PRESET_STORE_KEYS)) {
    if (!key.startsWith(base)) continue
    const presetId = presetIdOfSuffix(key.slice(base.length))
    if (presetId !== null) return { presetId, progress: base === PRESET_STORE_KEYS.progress }
  }
  return null
}

// How a saved progress spells the start of a mode's solve times.
const TIMES_OPEN = '"times":['

/**
 * What is filling `area`, by owner. Reads only.
 * ★ A MODE'S TIMES ARE MEASURED WHERE THEY SIT IN THE TEXT — from the bracket that opens them to the
 * one that closes them, which the browser finds at the speed it searches a string — and are never
 * written out again to be measured (that cost as much as saving them, per look).
 */
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
    if (key === null || key === SCRATCH_KEY) continue
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
        // The modes come out of the parse in the order the text spells them, so each one's times
        // are the next ones in the text.
        let at = 0
        for (const [silo, s] of Object.entries(isRecord(stats) ? stats : {})) {
          if (!isRecord(s) || !Array.isArray(s.times)) continue
          const open = text.indexOf(TIMES_OPEN, at)
          const close = text.indexOf(']', open)
          if (open < 0 || close < 0) break // not spelled as a save spells it: the rest is "other data"
          at = close
          const sealed = isRecord(s.sealed) && Array.isArray(s.sealed.ids) ? s.sealed.ids : []
          // The tail's own text, bracket to bracket, and the list that names the chunks.
          const own = close - open - TIMES_OPEN.length + 2 + JSON.stringify(sealed).length
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

export type StorageUsageState = {
  /** The device's limit, in characters — null until it has been measured (or a refusal taught one). */
  limit: number | null
  /** How much of the limit is used, as a whole number — null while the limit is not known. */
  percent: number | null
  /** At or past the line: the ⚙ line wears the warning colour and the gear its dot. */
  warning: boolean
  /** What is filling the device, as read when the popup last opened. */
  rows: UsageRow[]
  /** The breakdown popup is up — opened by the ⚙ line, or by itself on a crossing. */
  popupOpen: boolean
  openPopup: () => void
  closePopup: () => void
}

// ── What this page knows about the device ─────────────────────────────────────────────────────
// Every counted key's size, and their sum — null until the first count.
let sizes: Map<string, number> | null = null
let used = 0
// The limit, and whether it was MEASURED (`firm`) or only taught by a refused save. Kept here as
// well as on the device, because a device too full to take the marker still has a limit.
let known: { limit: number; firm: boolean } | null = null
// This crossing's popup has been shown (or the storage-full notice spoke in its place) — the page's
// own copy of WARNED_KEY, for a device that cannot take the marker.
let warnedHere = false
let settling = false
let timer: ReturnType<typeof setTimeout> | null = null
// Is a popup open? Asked of the app (src/main.tsx hands it in), so a store does not reach into the
// screen's layers.
let popupUp: () => boolean = () => false

const parseLimit = (text: string | null): typeof known => {
  const limit = text === null ? NaN : parseInt(text, 10)
  return Number.isFinite(limit) && limit > 0 ? { limit, firm: !text!.endsWith('?') } : null
}

const warned = (area: Storage): boolean => warnedHere || area.getItem(WARNED_KEY) !== null
const markWarned = (area: Storage): void => {
  warnedHere = true
  tryWriteItem(area, WARNED_KEY, '1')
}

/** How many characters the device holds for the app, as this page has counted them. */
export const storageUsed = (): number => used

const measureOwed = (): boolean =>
  !known || !known.firm || (used > known.limit && known.limit < MAX_STORAGE_LIMIT)

export const useStorageUsage = create<StorageUsageState>()((set, get) => ({
  limit: null,
  percent: null,
  warning: false,
  rows: [],
  popupOpen: false,
  openPopup: () => {
    refreshStorageUsage() // the popup shows the device as it is now, counted afresh
    try {
      const area = window.localStorage
      // Opened by hand above the line: the player has now seen what the popup would have said.
      if (get().warning) markWarned(area)
      set({ popupOpen: true, rows: readStorageUsage(area).rows })
    } catch {
      set({ popupOpen: true }) // localStorage refused: nothing is saved there to list
    }
  },
  closePopup: () => set({ popupOpen: false }),
}))

// Turn the count into what is shown — the limit a refusal teaches, the percentage, the warning —
// then see whether the popup or a measurement is due.
function settle(area: Storage): void {
  if (settling) return // a marker written below is counted by the door; this pass picks it up
  settling = true
  let limit: number | null
  let percent: number | null
  let warning: boolean
  try {
    // ★ A save to THIS area is being held: the device is full at what it holds right now, and that
    // is its limit until it can be measured. Remembered, so the next open starts from it —
    // best-effort (a full device may refuse even that; it is then learned again at the next
    // refusal).
    if (isHolding(area) && used > 0 && known?.limit !== used) {
      tryWriteItem(area, LIMIT_KEY, `${used}?`)
      known = { limit: used, firm: false } // `used` AFTER the marker, if the device took it
    }
    for (;;) {
      limit = known?.limit ?? null
      percent = limit === null ? null : usagePercent(used, limit)
      warning = percent !== null && percent >= STORAGE_WARN_PERCENT
      if (warning || !warned(area)) break
      // Back under the line: the crossing is over, and a later rise is a new one.
      warnedHere = false
      removeItem(area, WARNED_KEY)
    }
  } finally {
    settling = false
  }
  const shown = useStorageUsage.getState()
  if (shown.limit !== limit || shown.percent !== percent || shown.warning !== warning)
    useStorageUsage.setState({
      limit,
      percent,
      warning,
      // An open popup keeps its list in step with its headline.
      ...(shown.popupOpen ? { rows: readStorageUsage(area).rows } : null),
    })
  announceStorageWarning()
  if (measureOwed() && timer === null) timer = setTimeout(measureWhenIdle, IDLE_MS)
}

/**
 * Open the popup by itself, if a crossing has not been announced yet and this is a moment for it:
 * no solve clock running — or `steppedAway`, the player opening ⚙.
 * ⚠ It does not open while the device is REFUSING saves: the storage-full notice is the one that
 * speaks then (components/StorageFullNotice — it says more, and it says it now), and the crossing
 * counts as announced.
 */
export function announceStorageWarning(steppedAway = false): void {
  try {
    const area = window.localStorage
    const shown = useStorageUsage.getState()
    if (!shown.warning || shown.popupOpen || warned(area)) return
    const noticeSpeaks = useStorageHealth.getState().unsaved
    if (!noticeSpeaks && !steppedAway && isSolveClockRunning()) return
    markWarned(area)
    if (!noticeSpeaks)
      useStorageUsage.setState({ popupOpen: true, rows: readStorageUsage(area).rows })
  } catch {
    /* localStorage refused: nothing is saved there, so there is nothing to warn about */
  }
}

// Measure the device's limit, if one is owed and this is a moment for it (the header says which);
// otherwise look again in IDLE_MS.
function measureWhenIdle(): void {
  timer = null
  if (!sizes || !measureOwed()) return
  try {
    const area = window.localStorage
    if (
      document.visibilityState !== 'visible' ||
      isSolveClockRunning() ||
      popupUp() ||
      useStorageHealth.getState().unsaved
    ) {
      timer = setTimeout(measureWhenIdle, IDLE_MS)
      return
    }
    const room = measureRoom(
      area,
      MAX_STORAGE_LIMIT - used,
      DOCUMENTED_LIMITS.map((limit) => limit - used),
      MEASURE_WITHIN,
    )
    known = { limit: used + room, firm: true }
    tryWriteItem(area, LIMIT_KEY, String(known.limit))
    settle(area) // (the door has already settled it if the marker landed; this is for when it did not)
  } catch (e) {
    captureError(e instanceof Error ? e : new Error(String(e)), { tripwire: 'storageMeasure' })
  }
}

/**
 * Count the device again, from nothing, and act on it. Never throws: a browser that refuses
 * localStorage has nothing saved and stays as it was.
 */
export function refreshStorageUsage(): void {
  try {
    const area = window.localStorage
    const counted = new Map<string, number>()
    let total = 0
    for (let i = 0; i < area.length; i++) {
      const key = area.key(i)
      if (key === null || key === SCRATCH_KEY) continue
      const chars = key.length + (area.getItem(key) ?? '').length
      counted.set(key, chars)
      total += chars
    }
    sizes = counted
    used = total
    known = parseLimit(area.getItem(LIMIT_KEY)) ?? known
    settle(area)
  } catch {
    /* localStorage refused: nothing is saved there */
  }
}

// The door's report (store/storageHealth): (storage, key) now holds `value` — null: it is gone.
const noted: StorageWatcher = (storage, key, value) => {
  try {
    const area = window.localStorage
    if (storage !== area) return
    if (key === null || !sizes) return refreshStorageUsage()
    const chars = value === null ? 0 : key.length + value.length
    used += chars - (sizes.get(key) ?? 0)
    if (chars) sizes.set(key, chars)
    else sizes.delete(key)
    // Another tab measured, or learned from a refusal: its answer is this device's too.
    if (key === LIMIT_KEY) known = parseLimit(value) ?? known
    settle(area)
  } catch (e) {
    // The count must never be why a save fails: report it, and let the save stand.
    captureError(e instanceof Error ? e : new Error(String(e)), { tripwire: 'storageUsage' })
  }
}

/**
 * Start keeping the count for this page: the device is counted now, and from here on every save and
 * removal moves it. `isPopupOpen` is the app's answer to "is a popup up?" (a measurement waits for
 * none). Called once, by App's boot effect; returns the undo (tests).
 */
export function watchStorageUsage(isPopupOpen: () => boolean): () => void {
  popupUp = isPopupOpen
  const resettle = () => {
    try {
      if (sizes) settle(window.localStorage)
    } catch {
      /* localStorage refused */
    }
  }
  const stops = [
    watchStorage(noted),
    // The moment a waiting popup may open.
    onSolveClocksStopped(announceStorageWarning),
    // A save refused (the limit it teaches), or the last held save landing.
    useStorageHealth.subscribe((s, was) => {
      if (s.unsaved !== was.unsaved) resettle()
    }),
  ]
  refreshStorageUsage()
  return () => {
    stops.forEach((stop) => stop())
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
}

/**
 * Forget everything this page knows about the device, i.e. "the page was closed" — and take the
 * device to have been measured at `limit` (null: never measured). The app never needs this — a page
 * load starts from nothing known — but the test harness has no page load, so tests/setup/dom.js
 * calls it before every test (the same reason it forgets the storage health), with a limit already
 * known so that an ordinary test is not a device waiting to be measured.
 */
export function forgetStorageUsage(limit: number | null = DOCUMENTED_LIMITS[0]): void {
  sizes = null
  used = 0
  known = limit === null ? null : { limit, firm: true }
  warnedHere = false
  if (timer !== null) clearTimeout(timer)
  timer = null
  useStorageUsage.setState({
    limit: null,
    percent: null,
    warning: false,
    rows: [],
    popupOpen: false,
  })
}
