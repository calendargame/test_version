import { describe, it, expect, beforeEach } from 'vitest'
import {
  useUserDefaults,
  effectiveSettingsDefaults,
  effectivePrefDefaults,
  normalizeAoxN,
  prefsMatchDefaults,
} from '../src/store/userDefaults.js'
import { SETTINGS_DEFAULTS } from '../src/store/settings.js'
import { MODE_PREFS_DEFAULTS } from '../src/store/modePrefs.js'

// userDefaults.test.js — the saved-personal-defaults store (Session 11, Q7 "Save Defaults")
// and its pure helpers. Mirrors settings.test.js/modePrefs.test.js: locks the pure state
// contract (snapshot round-trip, null = factory semantics, the effective-defaults fallbacks,
// the aoxN normalization every comparison must route through). Persistence (localStorage
// 'cg-userdefaults-v1') is verified in-browser like the other stores. The App-level behavior
// (Reset Settings / Full Reset / the gear indicator honoring these values) is covered in
// tests/saveDefaults.dom.test.jsx.

const CUSTOM_SETTINGS = { ...SETTINGS_DEFAULTS, leapChance: '75', minY: 1600, useJulian: false }
const CUSTOM_PREFS = { flashMs: 800, blitzSec: 90, blitzQSec: 10, aoxN: '25' }
const FACTORY_PREFS = {
  flashMs: MODE_PREFS_DEFAULTS.flashMs,
  blitzSec: MODE_PREFS_DEFAULTS.blitzSec,
  blitzQSec: MODE_PREFS_DEFAULTS.blitzQSec,
  aoxN: MODE_PREFS_DEFAULTS.aoxN,
}

describe('userDefaults store', () => {
  beforeEach(() => {
    // Reset to a known baseline (the store is a singleton).
    useUserDefaults.getState().clearDefaults()
  })

  it('starts with no saved defaults (null = factory semantics)', () => {
    expect(useUserDefaults.getState().saved).toBeNull()
  })

  it('saveDefaults round-trips a snapshot; clearDefaults returns to null', () => {
    useUserDefaults.getState().saveDefaults({ settings: CUSTOM_SETTINGS, prefs: CUSTOM_PREFS })
    const saved = useUserDefaults.getState().saved
    expect(saved.settings).toEqual(CUSTOM_SETTINGS)
    expect(saved.prefs).toEqual(CUSTOM_PREFS)
    useUserDefaults.getState().clearDefaults()
    expect(useUserDefaults.getState().saved).toBeNull()
  })

  it('saveDefaults copies the snapshot — mutating the input never leaks into the store', () => {
    const settings = { ...CUSTOM_SETTINGS }
    const prefs = { ...CUSTOM_PREFS }
    useUserDefaults.getState().saveDefaults({ settings, prefs })
    settings.leapChance = 'random'
    prefs.flashMs = 12345
    expect(useUserDefaults.getState().saved.settings.leapChance).toBe('75')
    expect(useUserDefaults.getState().saved.prefs.flashMs).toBe(800)
  })
})

describe('userDefaults pure helpers', () => {
  it('effectiveSettingsDefaults: factory when null, the saved panel when present', () => {
    expect(effectiveSettingsDefaults(null)).toBe(SETTINGS_DEFAULTS)
    const saved = { settings: CUSTOM_SETTINGS, prefs: CUSTOM_PREFS }
    expect(effectiveSettingsDefaults(saved)).toEqual(CUSTOM_SETTINGS)
  })

  it('effectivePrefDefaults: exactly the 4 capturable factory keys when null, saved prefs when present', () => {
    expect(effectivePrefDefaults(null)).toEqual(FACTORY_PREFS)
    expect(Object.keys(effectivePrefDefaults(null))).toHaveLength(4)
    const saved = { settings: CUSTOM_SETTINGS, prefs: CUSTOM_PREFS }
    expect(effectivePrefDefaults(saved)).toEqual(CUSTOM_PREFS)
  })

  it('a saved snapshot is FORWARD-MERGED over factory — fields a release adds after the save mean factory, never undefined', () => {
    // Simulate a snapshot persisted by an OLDER build: strip a field from each half. Without the
    // merge, the missing fields would come back undefined — permanently failing every at-defaults
    // comparison (gear stuck on "modified") and writing undefined into the live store on Reset.
    const { leapChance: _dropS, ...oldSettings } = CUSTOM_SETTINGS
    const { blitzQSec: _dropP, ...oldPrefs } = CUSTOM_PREFS
    const saved = { settings: oldSettings, prefs: oldPrefs }
    expect(effectiveSettingsDefaults(saved)).toEqual({
      ...CUSTOM_SETTINGS,
      leapChance: SETTINGS_DEFAULTS.leapChance, // the unsaved field falls back to factory
    })
    expect(effectivePrefDefaults(saved)).toEqual({
      ...CUSTOM_PREFS,
      blitzQSec: FACTORY_PREFS.blitzQSec,
    })
  })

  it('normalizeAoxN applies the AoX commit clamp (2–1000, non-numeric → 10)', () => {
    expect(normalizeAoxN('10')).toBe('10')
    expect(normalizeAoxN('007')).toBe('7') // transient leading zeros normalize
    expect(normalizeAoxN('1')).toBe('2') // clamp low
    expect(normalizeAoxN('5000')).toBe('1000') // clamp high
    expect(normalizeAoxN('')).toBe('10') // empty mid-typing → fallback
    expect(normalizeAoxN('abc')).toBe('10') // non-numeric → fallback
  })

  it('prefsMatchDefaults compares the 4 prefs with aoxN normalized on BOTH sides', () => {
    expect(prefsMatchDefaults(FACTORY_PREFS, FACTORY_PREFS)).toBe(true)
    // A transient unclamped aoxN string must not read as a divergence its committed value lacks.
    expect(prefsMatchDefaults({ ...FACTORY_PREFS, aoxN: '010' }, FACTORY_PREFS)).toBe(true)
    // Each field diverging alone flips the answer.
    expect(prefsMatchDefaults({ ...FACTORY_PREFS, flashMs: 800 }, FACTORY_PREFS)).toBe(false)
    expect(prefsMatchDefaults({ ...FACTORY_PREFS, blitzSec: 90 }, FACTORY_PREFS)).toBe(false)
    expect(prefsMatchDefaults({ ...FACTORY_PREFS, blitzQSec: 10 }, FACTORY_PREFS)).toBe(false)
    expect(prefsMatchDefaults({ ...FACTORY_PREFS, aoxN: '25' }, FACTORY_PREFS)).toBe(false)
  })
})
