import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FormatId } from '../lib/format.js'

// settings.js — the ⚙ Settings store (Stage C, Steps 5a + 5b).
//
// Holds the 14 values that live in the Settings popover (13 at the Stage-C extraction; the Input
// style was added Session 10). Originally these were useState hooks inside App; centralizing them
// is the structural groundwork
// for (a) saved-progress and (b) splitting the fused game modes apart later,
// since the modes can read settings from here instead of receiving them all as
// threaded props.
//
// Step 5b — PERSISTENCE: the store is wrapped in Zustand's `persist` middleware,
// so the 14 settings save to the device (localStorage key 'cg-settings-v1') and
// restore on reload. Only the data values are persisted (partialize strips the
// setter functions); Zustand merges the saved values over the fresh store on
// load, so the setters always come from the live code, never from storage. The
// versioned key lets us migrate cleanly if the settings shape ever changes.
//
// DROP-IN CONTRACT: each setter accepts EITHER a direct value OR a functional
// updater (prev => next) — exactly like a React useState setter — so the call
// sites in App that do setUseJulian(v=>!v) keep working verbatim. App binds the
// store fields/setters to the SAME local names it used before, so the ~200 read
// sites and the big settingsStoreAtDefaults / isFullyReset boolean expressions are
// untouched.
//
// NOT in this store (intentionally): minInputVal / maxInputVal — those are
// transient text-input mirror strings, not persisted settings; they stay as
// local useState in App.

// The day-of-week answer input layout: the classic labelled buttons, or the logo's 7-dot grid
// (Settings → Input). Stored as an enum (not a boolean) so more layouts can be added later.
export type InputStyle = 'buttons' | 'dots'

// The 14 settings values, then the full store (values + setters). Each setter takes a direct
// value OR a React-style functional updater (prev => next), matching App's setX(v=>!v) call sites.
export type SettingsValues = {
  randomFormat: boolean
  dateFormat: FormatId
  inputStyle: InputStyle
  useJulian: boolean
  minY: number
  maxY: number
  leapChance: string
  janFebChance: string
  julianChance: string
  saveStats: boolean
  useSystem: boolean
  darkTheme: string
  lightTheme: string
  manualTheme: string
}
type Updater<T> = T | ((prev: T) => T)
export type SettingsState = SettingsValues & {
  setRandomFormat: (v: Updater<boolean>) => void
  setDateFormat: (v: Updater<FormatId>) => void
  setInputStyle: (v: Updater<InputStyle>) => void
  setUseJulian: (v: Updater<boolean>) => void
  setMinY: (v: Updater<number>) => void
  setMaxY: (v: Updater<number>) => void
  setLeapChance: (v: Updater<string>) => void
  setJanFebChance: (v: Updater<string>) => void
  setJulianChance: (v: Updater<string>) => void
  setSaveStats: (v: Updater<boolean>) => void
  setUseSystem: (v: Updater<boolean>) => void
  setDarkTheme: (v: Updater<string>) => void
  setLightTheme: (v: Updater<string>) => void
  setManualTheme: (v: Updater<string>) => void
  /** ⚠ FACTORY reset, NOT the ⚙ panel's Reset Settings button — see the warning at the
   *  implementation below before calling this from anywhere outside the test suite. */
  resetSettings: () => void
  applySettings: (values: SettingsValues) => void
}

// The launch defaults — single source of truth, reused by resetSettings().
// randomFormat launches OFF (Round-2, 2026-07-12, owner-ratified): a newcomer sees one
// consistent format (Written MDY) instead of five rotating ones; Random stays one tap away.
export const SETTINGS_DEFAULTS: SettingsValues = {
  randomFormat: false,
  dateFormat: 'written-mdy',
  inputStyle: 'buttons',
  useJulian: true,
  minY: 1,
  maxY: 10000,
  leapChance: 'random',
  janFebChance: 'random',
  julianChance: 'random',
  saveStats: true,
  useSystem: true,
  darkTheme: 'dusk',
  lightTheme: 'light',
  manualTheme: 'dusk',
}

// resolve(next, prev): support React-style functional updaters.
const resolve = <T>(next: Updater<T>, prev: T): T =>
  typeof next === 'function' ? (next as (prev: T) => T)(prev) : (next as T)

// The set of keys we persist — exactly the data values (not the setters). DERIVED from
// SETTINGS_DEFAULTS rather than listed, so the "14" every comment in this file quotes cannot drift
// from the code: add a setting to SETTINGS_DEFAULTS and it is persisted by construction. ⚠ 14 here
// counts the STORE's settings only. The Save Defaults snapshot is 18 (these 14 + 4 mode prefs) and
// the gear's "modified" comparison is 17 or 16 of that 18 — both counted in main.tsx, at
// resetSettings and settingsStoreAtDefaults respectively. Do not carry this number over to them.
const PERSISTED_KEYS = Object.keys(SETTINGS_DEFAULTS) as (keyof SettingsValues)[]

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...SETTINGS_DEFAULTS,
      setRandomFormat: (v) => set((s) => ({ randomFormat: resolve(v, s.randomFormat) })),
      setDateFormat: (v) => set((s) => ({ dateFormat: resolve(v, s.dateFormat) })),
      setInputStyle: (v) => set((s) => ({ inputStyle: resolve(v, s.inputStyle) })),
      setUseJulian: (v) => set((s) => ({ useJulian: resolve(v, s.useJulian) })),
      setMinY: (v) => set((s) => ({ minY: resolve(v, s.minY) })),
      setMaxY: (v) => set((s) => ({ maxY: resolve(v, s.maxY) })),
      setLeapChance: (v) => set((s) => ({ leapChance: resolve(v, s.leapChance) })),
      setJanFebChance: (v) => set((s) => ({ janFebChance: resolve(v, s.janFebChance) })),
      setJulianChance: (v) => set((s) => ({ julianChance: resolve(v, s.julianChance) })),
      setSaveStats: (v) => set((s) => ({ saveStats: resolve(v, s.saveStats) })),
      setUseSystem: (v) => set((s) => ({ useSystem: resolve(v, s.useSystem) })),
      setDarkTheme: (v) => set((s) => ({ darkTheme: resolve(v, s.darkTheme) })),
      setLightTheme: (v) => set((s) => ({ lightTheme: resolve(v, s.lightTheme) })),
      setManualTheme: (v) => set((s) => ({ manualTheme: resolve(v, s.manualTheme) })),
      // ⚠⚠ THIS IS NOT THE ⚙ PANEL'S "RESET SETTINGS" BUTTON, DESPITE THE NAME. It restores the
      // FACTORY values (SETTINGS_DEFAULTS) unconditionally. The panel's Reset Settings is App's own
      // resetSettings in main.tsx, which restores the user's EFFECTIVE defaults — their SAVED
      // personal defaults (Q7, store/userDefaults) when a snapshot exists, factory only when none
      // does — and additionally restores the two year-range text mirrors and the four capturable
      // mode prefs. The two names differ by one qualifier and by everything else.
      //   → REACHING FOR THIS ONE FROM APP CODE SILENTLY REVERTS THE WHOLE SAVED-DEFAULTS FEATURE:
      //     the user's saved snapshot survives in its own store, so nothing looks broken, but
      //     "reset" quietly stops meaning what the feature promises. Use applySettings(values) with
      //     effectiveSettingsDefaults instead — that is what App does.
      //   ★ NO APP CODE CALLS THIS. Its only consumers are the test suite's per-case store cleanup
      //     (52 call sites across 17 files under tests/, incl. tests/setup/dom.js and
      //     tests/helpers/settingsPanel.jsx), where factory-reset is exactly the wanted semantic.
      //     ⚠ Count `resetSettings()` with the parens: a bare grep also catches the UNRELATED
      //     `offers().resetSettings` boolean in the panel helper, which is the Reset Settings
      //     BUTTON's offered/dimmed state, not this action. That is what inflated an earlier
      //     draft of this note to "~86 across 20 files".
      //     Round 14 judged the honest rename (→ resetToFactory) correct but deferred it: it cannot
      //     land in this lane without leaving those 17 files red. Tracked as a follow-up — rename
      //     the action and every caller in ONE commit, and delete this paragraph's caveat with it.
      // Because the store is persisted, this also overwrites the saved copy back to factory.
      resetSettings: () => set(() => ({ ...SETTINGS_DEFAULTS })),
      // Apply a full 14-value snapshot in one shot — the values half of what App's Reset Settings
      // and Full Reset restore (the user's SAVED personal defaults via store/userDefaults; the
      // factory SETTINGS_DEFAULTS only when none are saved). This, not resetSettings above, is the
      // action app code should reach for. Persisted like any set, so the applied values become the
      // stored copy.
      applySettings: (values) => set(() => ({ ...values })),
    }),
    {
      name: 'cg-settings-v1', // localStorage key (versioned for future migrations)
      version: 1,
      // Persist only the data values, never the setter functions.
      partialize: (state) =>
        Object.fromEntries(PERSISTED_KEYS.map((k) => [k, state[k]])) as Partial<SettingsState>,
    },
  ),
)
