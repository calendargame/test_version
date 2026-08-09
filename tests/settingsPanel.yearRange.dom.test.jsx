// @vitest-environment jsdom
//
// THE YEAR RANGE, AND THE FOUR OFFERS — groups 5 and 6 of the ⚙ settings behaviour net.
//
// WHY THIS FILE EXISTS. The Settings panel is about to be lifted out of App (src/main.tsx), and the
// gate on that move is that this net passes with ZERO edits. These two groups are the largest hole
// in the existing suite and the place a plausible simplifying rewrite is most likely to pass every
// other test while changing what the user gets:
//
//   • NOTHING IN THE REPO HAD EVER TYPED INTO THE YEAR BOXES. Verified by full-text search before
//     this file was written — the only prior references read them with getByDisplayValue. So every
//     commit, revert and clamp below is new ground.
//   • THE YEAR BOXES ARE THE STATE THE THREE at-defaults BOOLEANS DISAGREE ABOUT. There are three
//     of them, they are computed over three different value sets, and all three are drawn as the
//     same grey dim — so a rewrite that collapses them into one looks like a tidy-up and is a
//     behaviour change nobody can see.
//
// ★ EVERYTHING HERE PINS WHAT THE APP DOES TODAY, INCLUDING ITS QUIRKS. That is the whole point:
// the net is the proof that the move changed nothing, so a case written as the behaviour SHOULD be
// would break the gate on the very move it exists to protect. Four places below pin something that
// looks wrong. Each says so, names it, and says it is to be changed separately AFTER the net is
// green. Search this file for "PINS" to find every one of them.
//
// ★ WHERE THE SPEC AND THE CODE DISAGREED, THE CODE WON. Three of the spec's sentences for these
// groups describe behaviour the app does not have; each is called out at the case that corrects it
// (search "SPEC CORRECTION"). The spec is a map drawn by other readers; the app is the territory.
//
// Everything is routed through tests/helpers/settingsPanel.jsx, so no assertion here names a
// component, a parent element or a class string. The stores are driven directly ONLY where the
// value lives on a MODE SCREEN rather than in this panel (the mode prefs), which is the same route
// the existing mode tests take and is deliberately not re-exported by the panel helper.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup, act } from '@testing-library/react'
import { useSettings } from '../src/store/settings.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { markUpdateDot, GEAR_DOT_KEY } from '../src/changelog.js'
import {
  mountApp,
  openSettings,
  closeSettings,
  isSettingsOpen,
  anyModalOpen,
  queryModalCard,
  openModal,
  closeModal,
  offers,
  gearIndicator,
  panelValues,
  pickPill,
  pickerLockState,
  toggleSwitch,
  tapFooter,
  fullResetState,
  yearInput,
  yearValue,
  typeYear,
  focusYear,
  commitYear,
  escapeYear,
  keyInYear,
  beforeInputYear,
  resetAppState,
} from './helpers/settingsPanel.jsx'

// ── Local harness ─────────────────────────────────────────────────────────────
// The settings store, for the two FIXTURE writes that have to come from outside the panel (G5.5 is
// specifically about a write the panel did not make). Never used to assert — every assertion below
// reads what the panel SHOWS.
const settings = () => useSettings.getState()
// The mode-prefs store. The seventeen per-mode setup values live on the MODE SCREENS, not in this
// panel, so there is no panel gesture for them and the store is the honest driver — the same route
// tests/saveDefaults.dom and the mode files already take.
const prefs = () => useModePrefs.getState()
// A store write the way a user's action delivers one: inside act(), so React has re-rendered before
// anything is read. Without it the derived booleans below are read one render stale and every
// assertion in group 6 silently measures the wrong commit.
const write = (fn) => act(fn)

// Stand the app up with the panel open — the state every case here starts from.
const openPanel = () => {
  mountApp()
  openSettings()
}

// The panel's own year boxes, driven as a user drives them: type, then commit by blur.
const setYear = (which, text) => {
  typeYear(which, text)
  commitYear(which)
}

describe('Year Range — commit, revert, clamp, and the three-way disagreement (net group 5)', () => {
  beforeEach(() => {
    resetAppState()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  // ── What can be typed at all ────────────────────────────────────────────────

  it.each(['min', 'max'])('a year box refuses everything that is not a digit (%s)', (which) => {
    openPanel()
    const before = yearValue(which)
    // Letters and punctuation never reach the box: the field's own filter drops the whole edit, so
    // what the user sees is unchanged. Asserted on what is DISPLAYED, not on a rejected event.
    typeYear(which, '19a0')
    expect(yearValue(which)).toBe(before)
    typeYear(which, '2 000')
    expect(yearValue(which)).toBe(before)
    typeYear(which, '1.5')
    expect(yearValue(which)).toBe(before)
  })

  it.each(['min', 'max'])('a year box refuses a minus on the key press (%s)', (which) => {
    openPanel()
    // Three spellings, because three engines send three different key names for the same key.
    expect(keyInYear(which, '-').prevented).toBe(true)
    expect(keyInYear(which, 'Subtract').prevented).toBe(true)
    expect(keyInYear(which, 'Minus').prevented).toBe(true)
    // The negative control: an ordinary digit is NOT refused, so the block is a block and not a
    // dead field.
    expect(keyInYear(which, '5').prevented).toBe(false)
  })

  it.each(['min', 'max'])('a year box refuses a minus on the insertion too (%s)', (which) => {
    openPanel()
    // The second half of the block — the path that catches an insertion the key press never
    // described (a paste, an IME). ⚠ Only the SINGLE-character form is reachable in this
    // environment; a pasted "-5" is a device check and this file does not imply it is covered.
    expect(beforeInputYear(which, '-').prevented).toBe(true)
    expect(beforeInputYear(which, '5').prevented).toBe(false)
  })

  // ── Committing, reverting, and Escape ───────────────────────────────────────

  it('Enter commits the typed year, gives up the keyboard, and leaves the panel open', () => {
    openPanel()
    focusYear('min')
    typeYear('min', '1900')
    commitYear('min', 'enter')
    expect(yearValue('min')).toBe('1900')
    expect(settings().minY).toBe(1900)
    // The box hands the keyboard back — this is what makes Enter feel like "done" rather than like
    // a keystroke the field swallowed.
    expect(document.activeElement).not.toBe(yearInput('min'))
    expect(isSettingsOpen()).toBe(true)
  })

  it('leaving a year box commits what was typed into it', () => {
    openPanel()
    focusYear('max')
    typeYear('max', '2000')
    commitYear('max', 'blur')
    expect(yearValue('max')).toBe('2000')
    expect(settings().maxY).toBe(2000)
  })

  it('clearing a year box and leaving it restores the committed year', () => {
    openPanel()
    setYear('min', '1900')
    // An empty box is the only text the field's own filter lets through that is not a year, so it
    // is the only way a user can reach the "this cannot be committed" branch at all.
    typeYear('min', '')
    expect(yearValue('min')).toBe('')
    commitYear('min', 'blur')
    expect(yearValue('min')).toBe('1900')
    expect(settings().minY).toBe(1900)
  })

  it('PINS TODAY: Escape in a year box COMMITS a typed year and closes the panel', () => {
    // ⚠⚠ THIS IS NOT WHAT ESCAPE LOOKS LIKE IT DOES, and both halves are pre-existing behaviour
    // that the owner has yet to rule on. Neither is among the spec's eight known defects; both were
    // found while building the panel helper and are documented in full at escapeYear() there.
    //   1. IT COMMITS INSTEAD OF REVERTING. The handler queues the revert and then blurs the box in
    //      the same breath; the blur's own commit runs inside that batch still holding the PRE-
    //      revert text, so the typed number wins the race and lands in the store.
    //   2. IT CLOSES THE PANEL. The panel's Escape handler carves out text inputs by asking what
    //      has focus — but the box has already blurred itself by then, so the carve-out no longer
    //      applies.
    // SPEC CORRECTION: the net's own prose for this case says Escape "reverts the field, does NOT
    // write the store, and does NOT close the panel" — that is the opposite of all three, on every
    // count, verified end to end against the running app.
    openPanel()
    setYear('min', '1900')
    focusYear('min')
    typeYear('min', '2500')
    escapeYear('min')
    expect(settings().minY).toBe(2500)
    expect(isSettingsOpen()).toBe(false)
    openSettings()
    expect(yearValue('min')).toBe('2500')
  })

  it('PINS TODAY: Escape in a year box reverts text that is not a year, and still closes the panel', () => {
    // The mirror image of the case above, and the reason nobody has ever noticed it: unparseable
    // text DOES revert, because the racing commit falls into its own cannot-parse branch. So Escape
    // appears to work exactly as intended for the one input a user is most likely to try it on.
    // The panel still closes either way. Same pending owner decision.
    openPanel()
    setYear('min', '1900')
    focusYear('min')
    typeYear('min', '')
    escapeYear('min')
    expect(settings().minY).toBe(1900)
    expect(isSettingsOpen()).toBe(false)
    openSettings()
    expect(yearValue('min')).toBe('1900')
  })

  // ── The clamps ──────────────────────────────────────────────────────────────
  //
  // Each clamp is read against the OTHER field's LIVE COMMITTED value, which is why the two
  // relative cases set the other end first.
  //
  // ⚠ AND SO DO THE TWO ABSOLUTE ONES, WHICH IS THE WHOLE REASON THEY ARE WRITTEN THIS WAY. The
  // factory bounds ARE 1 and 10000, so a case that starts at the factory range and types '0' or
  // '99999' expects the box to read the value it ALREADY HELD — and a rewrite that REFUSED an
  // out-of-range year instead of clamping it (`if (p < 1 || p > 10000) { revert; return }`) would
  // pass both while silently deleting clamping: the box reverts to the same string, and the store
  // is never written either way, because applyMaxValue short-circuits when the clamped value
  // already equals the committed one. Moving each end off its bound first makes the expected value
  // differ from the standing one, so the clamp has to actually happen for the case to pass.

  it('a first year above the last year clamps down to it', () => {
    openPanel()
    setYear('max', '2000')
    setYear('min', '5000')
    expect(yearValue('min')).toBe('2000')
    expect(settings().minY).toBe(2000)
  })

  it('a first year below 1 clamps up to 1', () => {
    openPanel()
    setYear('min', '50') // off the floor first, so '1' is a value the clamp has to PRODUCE
    expect(yearValue('min')).toBe('50')
    setYear('min', '0')
    expect(yearValue('min')).toBe('1')
    expect(settings().minY).toBe(1)
  })

  it('a last year above 10000 clamps down to 10000', () => {
    openPanel()
    setYear('max', '5000') // off the ceiling first, for the same reason
    expect(yearValue('max')).toBe('5000')
    setYear('max', '99999')
    expect(yearValue('max')).toBe('10000')
    expect(settings().maxY).toBe(10000)
  })

  it('a last year below the first year clamps up to it', () => {
    openPanel()
    setYear('min', '9000')
    setYear('max', '5')
    expect(yearValue('max')).toBe('9000')
    expect(settings().maxY).toBe(9000)
  })

  // ── Focus wins while it is held ─────────────────────────────────────────────

  it('a year box with the keyboard in it is never overwritten from elsewhere, and mirrors the range again once the keyboard leaves', () => {
    openPanel()
    focusYear('min')
    // A range change made from outside the panel entirely — the case this guard exists for is a
    // sync effect landing mid-keystroke and clobbering what is being typed.
    write(() => settings().setMinY(1700))
    expect(yearValue('min')).toBe('1')
    // PINS TODAY: and when the keyboard leaves, the BOX wins — its untouched '1' is committed back
    // over the 1700 that arrived while it held focus. That is the same commit-on-blur that makes
    // typing work, applied to text the user never changed.
    commitYear('min', 'blur')
    expect(yearValue('min')).toBe('1')
    expect(settings().minY).toBe(1)
    // With the keyboard gone the box tracks the range again.
    write(() => settings().setMinY(1700))
    expect(yearValue('min')).toBe('1700')
  })

  // ── The three-way disagreement (D1) ─────────────────────────────────────────

  it('PINS D1: with uncommitted text in a year box the gear stays dark and Save Defaults stays dimmed, while Reset Settings and Full Reset are offered', () => {
    // ⚠⚠ PINS D1 AS IT BEHAVES TODAY. The owner has DECIDED this changes — see spec section 5, D1.
    // It is pinned as-is on purpose: the follow-up change is made after the net is green precisely
    // so this file can show exactly which assertions flip. Do not "fix" it here.
    //
    // WHY IT HAPPENS, so the assertion is not a mystery to whoever changes it: the gear and Save
    // Defaults are computed from the STORE values only, and typed text has not reached the store
    // yet; Reset Settings and Full Reset are computed from a set that also folds in the two boxes'
    // text. The comment in main.tsx calls Reset Settings "the exact mirror of the Save Defaults
    // dim", and this is the reachable state in which that is false.
    openPanel()
    typeYear('min', '1900')
    expect(settings().minY).toBe(1)
    expect(offers()).toEqual({
      gear: false,
      saveDefaults: false,
      resetSettings: true,
      fullReset: true,
    })
  })

  it('committing that same year moves all four offers together', () => {
    // The other half of the pin, and the one that gives it meaning: nothing about the VALUE splits
    // the four apart — only the window between typed and committed does.
    openPanel()
    typeYear('min', '1900')
    commitYear('min', 'blur')
    expect(offers()).toEqual({
      gear: true,
      saveDefaults: true,
      resetSettings: true,
      fullReset: true,
    })
  })

  it('the two chance locks re-evaluate only once the year is committed', () => {
    openPanel()
    // A one-year range on 1900 — a common year in the Gregorian calendar, so no leap year is
    // reachable and Leap Year Chance locks.
    setYear('min', '1900')
    setYear('max', '1900')
    expect(pickerLockState('Leap Year Chance').offered).toBe(false)
    // Typing a year that WOULD unlock it changes nothing while it is still just text.
    typeYear('max', '1904')
    expect(pickerLockState('Leap Year Chance').offered).toBe(false)
    commitYear('max', 'blur')
    expect(pickerLockState('Leap Year Chance').offered).toBe(true)

    // Julian Chance is the same contract on a different boundary: it needs the range to span the
    // 1582 changeover, and 1582 itself counts.
    setYear('min', '1583')
    expect(pickerLockState('Julian Chance').offered).toBe(false)
    typeYear('min', '1582')
    expect(pickerLockState('Julian Chance').offered).toBe(false)
    commitYear('min', 'blur')
    expect(pickerLockState('Julian Chance').offered).toBe(true)
  })

  // ── What each close route does to a half-typed year ─────────────────────────
  //
  // Three routes, three different answers, and none of them was verified before this file. The
  // differences are real behaviour a user meets, so each is pinned separately rather than
  // normalised into "closing commits".

  it('closing the panel by tapping the page behind it COMMITS a half-typed year', () => {
    openPanel()
    focusYear('min')
    typeYear('min', '1900')
    closeSettings('outside')
    expect(isSettingsOpen()).toBe(false)
    // The click-outside close blurs the focused box before it unmounts the panel, on purpose —
    // without that, the typed value is silently dropped on every tap-away.
    expect(settings().minY).toBe(1900)
    openSettings()
    expect(yearValue('min')).toBe('1900')
  })

  it('PINS TODAY: closing the panel with the gear DROPS a half-typed year', () => {
    // ⚠ PINS TODAY, and it differs from the tap-away route above for a reason that is invisible in
    // the markup: the gear is deliberately EXCLUDED from the click-outside rule (so that tapping it
    // toggles rather than double-closing), and the blur-before-close lives inside that rule. So the
    // panel unmounts with the box still focused and the typed year never commits. The text itself
    // survives — see the reopen case below — so nothing is lost, it is just not applied.
    openPanel()
    focusYear('min')
    typeYear('min', '1900')
    closeSettings('gear')
    expect(isSettingsOpen()).toBe(false)
    expect(settings().minY).toBe(1)
  })

  it('Escape does not close the panel while a year box has the keyboard', () => {
    // The text-entry carve-out, asserted at the panel for the first time — it was previously pinned
    // only for the Save popup's sliders. ⚠ Note this is Escape arriving from the PAGE; an Escape
    // sent to the box itself does close the panel, because the box blurs itself first. Both are
    // pinned, and the difference between them is the defect the case above records.
    openPanel()
    focusYear('min')
    typeYear('min', '1900')
    closeSettings('escape')
    expect(isSettingsOpen()).toBe(true)
    expect(settings().minY).toBe(1)
  })

  it('Reset Settings while a year box is half-typed and focused leaves the box reading the default', () => {
    openPanel()
    focusYear('min')
    typeYear('min', '1900')
    tapFooter('Reset Settings')
    expect(yearValue('min')).toBe('1')
    expect(settings().minY).toBe(1)
    // And it does not close the panel — the reset is meant to be inspectable.
    expect(isSettingsOpen()).toBe(true)
  })

  it('PINS TODAY: a half-typed year survives closing and reopening the panel', () => {
    // ⚠ PINS TODAY, AND IT IS THE ONE CASE IN THIS FILE THAT THE EXTRACTION ITSELF DECIDES. The two
    // text mirrors live in App, not in the panel, so they outlive the panel's open state. A panel
    // that OWNS this state would remount them from the store on every open and silently change this
    // answer — with nothing else in the suite noticing. Whichever answer ships must be deliberate;
    // today's answer is that the text survives.
    openPanel()
    typeYear('min', '1900')
    closeSettings('key')
    expect(isSettingsOpen()).toBe(false)
    expect(settings().minY).toBe(1)
    openSettings()
    expect(yearValue('min')).toBe('1900')
    expect(settings().minY).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════

describe('The four offers — gear, Save Defaults, Reset Settings, Full Reset (net group 6)', () => {
  beforeEach(() => {
    resetAppState()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('at launch with nothing saved, the gear is unmodified and none of the three footer buttons is offered', () => {
    openPanel()
    expect(offers()).toEqual({
      gear: false,
      saveDefaults: false,
      resetSettings: false,
      fullReset: false,
    })
  })

  // ── The eleven non-theme settings, each on its own ──────────────────────────
  //
  // Every one driven by the CONTROL a finger lands on, not by a store write — which is what makes
  // this a test of the panel rather than of the boolean. Only leapChance stood in for all eleven
  // before this file.
  const NON_THEME_SETTINGS = [
    ['Random Format', () => toggleSwitch('Random Format')],
    ['Date Format', () => pickPill('Date Format', 'Numeric YMD')],
    ['Input', () => pickPill('Input', 'Dots')],
    ['Julian Calendar', () => toggleSwitch('Julian Calendar (pre-Oct 15, 1582)')],
    ['first year', () => setYear('min', '1900')],
    ['last year', () => setYear('max', '2000')],
    ['Leap Year Chance', () => pickPill('Leap Year Chance', '75%')],
    ['Jan/Feb Chance', () => pickPill('Jan/Feb Chance on Leap Years', '50%')],
    ['Julian Chance', () => pickPill('Julian Chance', '25%')],
    ['Save Stats', () => toggleSwitch('Save Stats')],
    ['Use System Settings', () => toggleSwitch('Use System Settings')],
  ]

  it.each(NON_THEME_SETTINGS)(
    'changing %s alone lights the gear and offers Save Defaults and Reset Settings',
    (_name, change) => {
      openPanel()
      change()
      const { gear, saveDefaults, resetSettings } = offers()
      expect({ gear, saveDefaults, resetSettings }).toEqual({
        gear: true,
        saveDefaults: true,
        resetSettings: true,
      })
    },
  )

  // ── The mode-screen prefs, capturable and not ───────────────────────────────
  //
  // These live on the MODE SCREENS, so there is no panel control for them and the store is the
  // route. The split is the subject: four of the seventeen are captured by Save Defaults and
  // restored by Reset Settings, and thirteen are not — so the four must reach the offers and the
  // thirteen must not. Widening the thirteen into the four would be the worst failure mode
  // available here: an indicator the user cannot clear, because Reset Settings would not restore
  // the thing that lit it.
  const CAPTURABLE_PREFS = [
    ['Flash speed', () => prefs().setFlashMs(800)],
    ['the Blitz round timer', () => prefs().setBlitzSec(30)],
    ['the Blitz per-question timer', () => prefs().setBlitzQSec(5)],
    ['the AoX run length', () => prefs().setAoxN('25')],
  ]

  it.each(CAPTURABLE_PREFS)(
    'changing %s alone lights the gear and offers Save Defaults and Reset Settings',
    (_name, change) => {
      openPanel()
      write(change)
      const { gear, saveDefaults, resetSettings } = offers()
      expect({ gear, saveDefaults, resetSettings }).toEqual({
        gear: true,
        saveDefaults: true,
        resetSettings: true,
      })
    },
  )

  const NON_CAPTURABLE_PREFS = [
    ['the Flash timing toggle', () => prefs().setFlashTimingOff(true)],
    ['the Flash scoring toggle', () => prefs().setFlashScoringOff(true)],
    ['Blitz Per-Round/Question', () => prefs().setBlitzPerQ(true)],
    ['Blitz Allow Mistakes', () => prefs().setBlitzAllowMistakes(false)],
    ['the Blitz timing toggle', () => prefs().setBlitzTimingOff(true)],
    ['AoX Allow Mistakes', () => prefs().setAoxAllowMistakes(true)],
    ['AoX One-by-One', () => prefs().setAoxOneByOne(true)],
    ['the AoX timing toggle', () => prefs().setAoxTimingOff(true)],
    ['the Deduction sub-type', () => prefs().setDedType('month')],
    ['the Deduction timing toggle', () => prefs().setDedTimingOff(false)],
    ['the Deduction scoring toggle', () => prefs().setDedScoringOff(true)],
    ['the Classic timing toggle', () => prefs().setClassicTimingOff(false)],
    ['the Classic scoring toggle', () => prefs().setClassicScoringOff(true)],
  ]

  it.each(NON_CAPTURABLE_PREFS)(
    'changing %s alone leaves the gear dark and offers neither Save Defaults nor Reset Settings',
    (_name, change) => {
      openPanel()
      write(change)
      const { gear, saveDefaults, resetSettings } = offers()
      expect({ gear, saveDefaults, resetSettings }).toEqual({
        gear: false,
        saveDefaults: false,
        resetSettings: false,
      })
    },
  )

  it('SPEC CORRECTION: changing ANY mode-screen pref offers Full Reset, capturable or not', () => {
    // The net's prose for the capturable four says a change there "does NOT offer Full Reset".
    // Verified false against the running app, for both halves of the split, and the reason is
    // structural rather than incidental: Full Reset is offered whenever anything on any screen is
    // away from launch state, and each mode reports its own prefs as part of that. So the four and
    // the thirteen differ on the GEAR and on Reset Settings — which is the real distinction — and
    // agree on Full Reset. Pinned here so the correction cannot be lost.
    openPanel()
    write(() => prefs().setFlashMs(800))
    expect(offers().fullReset).toBe(true)
    cleanup()
    document.getElementById('root')?.remove()
    resetAppState()
    openPanel()
    write(() => prefs().setBlitzPerQ(true))
    expect(offers().fullReset).toBe(true)
  })

  // ── The AoX run length is text, and text is normalised before it is compared ─

  it.each([
    ['an empty box', ''],
    ['a padded 10', '0010'],
    ['0, which the clamp reads as 10 rather than as 2', '0'],
  ])(
    'a transient AoX run length that normalises to the default leaves the gear dark (%s)',
    (_name, raw) => {
      // ⚠ The '0' row PINS pre-existing defect D5: the clamp is `parseInt(s) || 10`, and 0 is falsy,
      // so '0' becomes 10 and not the floor of 2. It is pinned rather than fixed — a future change
      // from `|| 10` to a NaN check would move it silently, and this is the case that would say so.
      openPanel()
      write(() => prefs().setAoxN(raw))
      expect(offers().gear).toBe(false)
    },
  )

  it.each([
    ['007, which reads as 7', '007'],
    ['1, which the clamp lifts to 2', '1'],
  ])(
    'a transient AoX run length that normalises to something else lights the gear (%s)',
    (_name, raw) => {
      // The negative control for the case above, and it corrects the spec, which offered '007' as an
      // example of a string that should NOT light the gear: '007' parses to 7, and 7 is not the
      // default of 10, so it is a real divergence and the gear is right to say so.
      openPanel()
      write(() => prefs().setAoxN(raw))
      expect(offers().gear).toBe(true)
    },
  )

  // ── Once personal defaults exist, "default" means them ──────────────────────

  it('after saving personal defaults, every offer is measured against the SAVED values and not the factory ones', () => {
    openPanel()
    pickPill('Leap Year Chance', '75%')
    setYear('min', '1900')
    openModal('save')
    closeModal('save', 'save')
    // The saved state is now the resting state: nothing diverges, so nothing is offered — even
    // though every one of these values is away from factory.
    expect(offers()).toEqual({
      gear: false,
      saveDefaults: false,
      resetSettings: false,
      fullReset: false,
    })
    expect(panelValues().leapChance).toEqual(['75%'])
    expect(yearValue('min')).toBe('1900')
    // And returning a value to its FACTORY setting is now a divergence, which is the whole point.
    pickPill('Leap Year Chance', 'Random')
    const { gear, saveDefaults, resetSettings } = offers()
    expect({ gear, saveDefaults, resetSettings }).toEqual({
      gear: true,
      saveDefaults: true,
      resetSettings: true,
    })
  })

  it('the gear states both of its flags, in all four combinations, in the name a screen reader hears', () => {
    // Read with the panel CLOSED, because opening it retires the update mark — and because the
    // violet stripe is only drawn while closed, so the name is the only place both flags are
    // readable at once. About a dozen helpers across five test files find the gear by this string,
    // so its exact composition is load-bearing well beyond this group.
    mountApp()
    expect(gearIndicator().name).toBe('Settings')
    write(() => prefs().setFlashMs(800))
    expect(gearIndicator().name).toBe('Settings (modified)')

    cleanup()
    document.getElementById('root')?.remove()
    resetAppState()
    markUpdateDot(GEAR_DOT_KEY) // a build change was detected on an earlier boot
    mountApp()
    expect(gearIndicator().name).toBe('Settings (update)')
    write(() => prefs().setFlashMs(800))
    expect(gearIndicator().name).toBe('Settings (modified, update)')
  })

  // ── What a press on a NOT-OFFERED footer button actually does ───────────────
  //
  // The dim is CSS only, so a keyboard or programmatic path reaches all three handlers. Only one of
  // them guards itself. That asymmetry is pre-existing defect D7 and an owner decision, and the
  // three cases below pin whichever way each one currently falls — a rewrite that adds or removes a
  // guard is invisible without them.

  it('a press on the not-offered Full Reset does nothing at all', () => {
    openPanel()
    expect(fullResetState().offered).toBe(false)
    tapFooter('Full Reset')
    // It does not even arm: the caption stays put and no confirm ring appears.
    expect(fullResetState()).toEqual({ caption: 'Full Reset', armed: false, offered: false })
    expect(isSettingsOpen()).toBe(true)
  })

  it('PINS D7: a press on the not-offered Save Defaults still opens the popup', () => {
    // ⚠ PINS TODAY. There is nothing to save — every value is already the default — and the popup
    // opens anyway, because this handler has no guard. Pre-existing defect D7; an owner decision,
    // not a bug this net resolves.
    openPanel()
    expect(offers().saveDefaults).toBe(false)
    tapFooter('Save Defaults')
    expect(queryModalCard('save')).not.toBeNull()
  })

  it('PINS D7: a press on the not-offered Reset Settings runs a silent no-op', () => {
    // ⚠ PINS TODAY, and it is deliberately the OPPOSITE shape to Save Defaults above: no guard
    // either, but the action itself is empty when everything is already at its default. Nothing the
    // user can see changes, nothing opens, and the panel stays up.
    openPanel()
    const before = panelValues()
    expect(offers().resetSettings).toBe(false)
    tapFooter('Reset Settings')
    expect(panelValues()).toEqual(before)
    expect(anyModalOpen()).toBe(false)
    expect(isSettingsOpen()).toBe(true)
  })
})
