import { create } from 'zustand'
import { usePresets } from './presets.js'
import { browsingSessionOpen } from './browsingSession.js'
import { storedAmnesicDefault } from './userDefaults.js'
import { readItem, writeItem, removeItem } from './storageHealth.js'
import { isAmnesicMode, moreAmnesic, readAmnesicMode } from './amnesicMode.js'
import type { AmnesicMode } from './amnesicMode.js'

// store/sessionAmnesic.ts — each preset's Amnesic setting (Off / Stats Only / Full) FOR THIS BROWSING
// SESSION.
//
// ★ THE SETTING IS THE SESSION'S, NOT THE DEVICE'S. Guest mode is temporary by construction: you turn
// it on, somebody plays, the app is closed, and the next time it opens every preset is back on its
// own saved default. So the value in force lives where everything else session-lived does — in
// sessionStorage, which a reload keeps and a real close clears (store/browsingSession) — and the one
// PERMANENT thing is what each preset should start a fresh open on: the Amnesic value in that
// preset's saved defaults (store/userDefaults).
//
// WHAT THAT REPLACED, AND THE TWO FAULTS IT REMOVES. The setting used to be a boolean on each preset
// in the permanent, shared preset registry, put back to its saved default by a write at every fresh
// open.
//   • On a device full to the byte that write was refused and held only in memory, so a reload read
//     the stale flag back: a preset stayed amnesic past a real close. Now a fresh open WRITES NOTHING
//     PERMANENT — the saved default is simply what is read when the session has no value yet.
//   • Two tabs flipped each other's setting through the shared registry (and live and staging are two
//     tabs of one origin). Now each tab has its own sessionStorage, so each has its own value, as it
//     already had its own guest stats.
//
// ★ WHAT A PRESET'S VALUE IS, in the order it is decided when a page loads (openingModes):
//   1. a value this session already holds for it — a reload, the app's own update reload;
//   2. on a FRESH OPEN, its saved default;
//   3. on a load inside a session that holds NO value for it, the more amnesic of its saved default
//      and the flag an older build keeps on the registry (store/presets' `Preset.amnesic`).
// Case 3 is the hand-over from an older build: a guest is playing in an amnesic preset when the app
// updates itself, and the reload that follows is the first time this build runs — in a session it did
// not start. The older build's flag is then the truth about that session, and reading it is what
// keeps the guest a guest. It is also what a refused write of this file's own record falls back to.
// "The more amnesic of the two" because the flag can be stale (this build never writes it), and a
// preset wrongly left amnesic shows a zeroed, dashed strip and loses nothing saved, while one wrongly
// made permanent records a guest for good.
// From then on the value changes ONLY through store/presetControl's setPresetAmnesic, which pairs the
// change with the discard, the reload and the screen remount it implies. Nothing here watches the
// saved default: saving or clearing defaults mid-session does not move the setting in force.
//
// ONE SMALL JSON VALUE under one key — a map of preset id → value. `cg-amnesic-v1` is new, so no
// older build on this shared origin reads it. Every access is guarded: a browser that refuses
// sessionStorage keeps the values in memory for the page, and its next load is a fresh open (the
// answer store/browsingSession gives there too). A write the browser has no room for is held and
// reported like any other refused save (store/storageHealth).

const KEY = 'cg-amnesic-v1'

type Modes = Readonly<Record<number, AmnesicMode>>

// The session's record as stored. Anything unreadable is an empty record; an entry whose value this
// build does not know reads as Full (store/amnesicMode argues the direction).
function readRecord(): Record<number, AmnesicMode> {
  const modes: Record<number, AmnesicMode> = {}
  try {
    const raw = readItem(window.sessionStorage, KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return modes
    for (const [id, value] of Object.entries(parsed)) {
      const presetId = Number(id)
      if (Number.isInteger(presetId)) modes[presetId] = isAmnesicMode(value) ? value : 'full'
    }
  } catch {
    /* storage refused, or not JSON — nothing is on record */
  }
  return modes
}

function writeRecord(modes: Modes): void {
  try {
    const text = JSON.stringify(modes)
    if (readItem(window.sessionStorage, KEY) !== text) writeItem(window.sessionStorage, KEY, text)
  } catch {
    /* storage refused — the values live in this page's memory, and its next load is a fresh open */
  }
}

// Every listed preset's value as a page load finds it — see the header's three cases.
function openingModes(): Record<number, AmnesicMode> {
  const cold = !browsingSessionOpen()
  const kept = cold ? {} : readRecord()
  const modes: Record<number, AmnesicMode> = {}
  for (const preset of usePresets.getState().presets) {
    const saved = storedAmnesicDefault(preset.id)
    modes[preset.id] =
      kept[preset.id] ?? (cold ? saved : moreAmnesic(saved, readAmnesicMode(preset)))
  }
  return modes
}

// ★ A STORE, NOT JUST THE TWO FUNCTIONS ABOVE, because three things have to MOVE when a value does:
// the ⚙ pill, the dashed outline on the screens, and src/main.tsx's remount of the mode screens — which
// is a subscription, and has to run synchronously inside the change (store/presetControl's
// switchPreset argues why).
export const useSessionAmnesic = create<{ modes: Modes }>()(() => ({ modes: openingModes() }))

/**
 * One preset's Amnesic value this session. A preset this page holds no value for reads Off: every
 * preset listed when the page loaded was given one then, and one created since is given Off as it is
 * made, so that is a preset this page has never shown.
 */
export const amnesicModeOf = (presetId: number): AmnesicMode =>
  useSessionAmnesic.getState().modes[presetId] ?? 'off'

/**
 * Set one preset's value, in memory and on the session's record.
 * ⚠⚠ NOT FOR APP CODE. The value decides which storage a preset's stats and bests are read from, so
 * changing it under mounted screens is the 500-cards-becomes-4 bug. Its callers are
 * store/presetControl — setPresetAmnesic, which pairs it with the work the change implies, and
 * createPreset — and the test suite.
 */
export function setSessionAmnesic(presetId: number, mode: AmnesicMode): void {
  const modes = { ...useSessionAmnesic.getState().modes, [presetId]: mode }
  useSessionAmnesic.setState({ modes })
  writeRecord(modes)
}

/** Forget a deleted preset's value. (Ids are never reused, so this is tidiness, not safety.) */
export function forgetSessionAmnesicOf(presetId: number): void {
  const { [presetId]: _gone, ...modes } = useSessionAmnesic.getState().modes
  useSessionAmnesic.setState({ modes })
  writeRecord(modes)
}

/**
 * Write down the values this page opened with — called once per page load, by src/main.tsx's boot
 * effect. This is what makes case 1 in the header true for a preset nobody touched: its saved default
 * is read once, at the fresh open, and the reload that follows reads the record instead — so clearing
 * or re-saving defaults mid-session cannot move the setting under a guest at the next reload.
 * A session-storage write; nothing permanent.
 */
export const commitSessionAmnesic = (): void => writeRecord(useSessionAmnesic.getState().modes)

/**
 * Work every preset's value out again from what is stored, as a page load does. The app never needs
 * this — the store is created by the page load itself — but the test harness has no page load, so a
 * test that models a reload or a real close calls it after putting the registry back (the same
 * reason tests/setup/dom.js forgets the browsing session).
 */
export const reopenSessionAmnesic = (): void =>
  useSessionAmnesic.setState({ modes: openingModes() })

/** Forget the record and every value, i.e. "the app was closed and nothing is saved" — the harness. */
export function forgetSessionAmnesic(): void {
  try {
    removeItem(window.sessionStorage, KEY)
  } catch {
    /* storage refused — nothing was ever written */
  }
  useSessionAmnesic.setState({ modes: {} })
}
