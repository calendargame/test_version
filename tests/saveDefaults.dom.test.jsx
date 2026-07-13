// @vitest-environment jsdom
//
// Save Defaults (Q7) + the gear "modified" indicator (Q8) — App-level behavior tests.
//
// Drives the real <App/> like a user: the ⚙ footer's Save Defaults button opens a centered
// confirmation popup (portaled to #root) whose edits touch ONLY a pending snapshot; Save makes
// that snapshot the EFFECTIVE defaults (store/userDefaults) that Reset Settings, Full Reset,
// the gear indicator, and the Save-Defaults dim all mean by "default" from then on. The pure
// store/helper contract is locked in tests/userDefaults.test.js; visual polish (the violet bar,
// footer wrap) is on-device per the standing lesson.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { useModePrefs, MODE_PREFS_DEFAULTS } from '../src/store/modePrefs.js'
import { useUserDefaults } from '../src/store/userDefaults.js'
import { useProgress } from '../src/store/progress.js'

// ── Harness helpers ─────────────────────────────────────────────────────────
function mountApp() {
  // CustomSelect panels AND the Save Defaults popup portal into #root; provide one. App's own
  // tree mounts into RTL's container (not #root), so there's no duplicate auto-mount.
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

// /^Settings/ — the gear's accessible name flips to "Settings (modified)" when live state
// diverges from the effective defaults (the Q8 indicator); match both states.
const gear = () => screen.getByRole('button', { name: /^Settings/ })
const openSettings = () => act(() => fireEvent.click(gear()))
const btn = (name) => screen.getByRole('button', { name })
const isDimmed = (b) => b.className.includes('pointer-events-none')
const openPopup = () => act(() => fireEvent.click(btn('Save Defaults')))
const popupTitle = () => screen.queryByText('Save current settings as your defaults?')
const nField = () => screen.getByRole('textbox', { name: 'AoX run length (N)' })
const flashSlider = () => screen.getByRole('slider', { name: 'Flash speed' })

describe('Save Defaults (Q7) + gear indicator (Q8)', () => {
  beforeEach(() => {
    // All three persisted singletons back to a clean baseline.
    localStorage.clear()
    useSettings.getState().resetSettings()
    useModePrefs.getState().resetModePrefs()
    useUserDefaults.getState().clearDefaults()
    useProgress.getState().resetProgress()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Save → Reset Settings restores the personal panel values (store + year-range mirrors)', () => {
    useSettings.getState().setLeapChance('75')
    useSettings.getState().setMinY(1600)
    mountApp()
    openSettings()
    openPopup()
    act(() => fireEvent.click(btn('Save'))) // capture the personal defaults
    // Diverge, then Reset Settings — it must mean the SAVED values now, not factory.
    act(() => {
      useSettings.getState().setLeapChance('random')
      useSettings.getState().setMinY(1583)
    })
    act(() => fireEvent.click(btn('Reset Settings')))
    expect(useSettings.getState().leapChance).toBe('75')
    expect(useSettings.getState().minY).toBe(1600)
    expect(screen.getByDisplayValue('1600')).toBeInTheDocument() // the min-year text mirror
  })

  it('Save → Full Reset pushes the 4 captured prefs; the rest of modePrefs stays factory; the snapshot survives', () => {
    const p = useModePrefs.getState()
    p.setFlashMs(800)
    p.setBlitzSec(90)
    p.setBlitzQSec(15) // every captured value diverges from factory (blitzQSec launches at 10)
    p.setAoxN('25')
    p.setBlitzPerQ(true) // non-capturable — must reset to factory
    p.setDedType('month') // non-capturable — must reset to factory
    mountApp()
    openSettings()
    openPopup()
    act(() => fireEvent.click(btn('Save')))
    // Diverge the live prefs again, then Full Reset.
    act(() => {
      useModePrefs.getState().setFlashMs(1500)
      useModePrefs.getState().setAoxN('50')
    })
    act(() => fireEvent.click(btn('Full Reset')))
    act(() => fireEvent.click(btn('Confirm?')))
    const r = useModePrefs.getState()
    expect(r.flashMs).toBe(800)
    expect(r.blitzSec).toBe(90)
    expect(r.blitzQSec).toBe(15)
    expect(r.aoxN).toBe('25')
    expect(r.blitzPerQ).toBe(MODE_PREFS_DEFAULTS.blitzPerQ) // factory, not captured
    expect(r.dedType).toBe(MODE_PREFS_DEFAULTS.dedType) // factory, not captured
    expect(useUserDefaults.getState().saved).not.toBeNull() // Full Reset never clears the snapshot
  })

  it('Full Reset honors + dims against the personal defaults — the freshness-literal rewiring', () => {
    useModePrefs.getState().setFlashMs(800)
    mountApp()
    openSettings()
    openPopup()
    act(() => fireEvent.click(btn('Save')))
    // live == saved defaults → the app ALREADY reads fully reset: the mode freshness checks
    // compare against the EFFECTIVE defaults (flashMs 800) — with the old factory literals
    // (flashMs===500) Full Reset would never dim while a personal Flash speed is active.
    expect(isDimmed(btn('Full Reset'))).toBe(true)
    expect(isDimmed(btn('Save Defaults'))).toBe(true) // nothing to save either
    // Diverge → it comes live; Full Reset (two-tap) restores the PERSONAL default and re-dims.
    act(() => useModePrefs.getState().setFlashMs(1500))
    expect(isDimmed(btn('Full Reset'))).toBe(false)
    act(() => fireEvent.click(btn('Full Reset')))
    act(() => fireEvent.click(btn('Confirm?'))) // fires; the panel closes
    expect(useModePrefs.getState().flashMs).toBe(800)
    openSettings()
    expect(isDimmed(btn('Full Reset'))).toBe(true)
    expect(isDimmed(btn('Save Defaults'))).toBe(true)
  })

  it('popup Cancel discards edits; Save persists the EDITED values; live stores stay untouched', () => {
    mountApp()
    openSettings()
    openPopup()
    act(() => fireEvent.change(flashSlider(), { target: { value: '1200' } }))
    act(() => fireEvent.change(nField(), { target: { value: '25' } }))
    act(() => fireEvent.click(btn('Cancel')))
    expect(useUserDefaults.getState().saved).toBeNull() // nothing saved
    expect(useModePrefs.getState().flashMs).toBe(2000) // live store never touched (factory default)
    openPopup() // re-seeded fresh from the live stores — the cancelled edits are gone
    expect(flashSlider().value).toBe('2000')
    expect(nField().value).toBe('10')
    act(() => fireEvent.change(flashSlider(), { target: { value: '1200' } }))
    act(() => fireEvent.change(nField(), { target: { value: '25' } }))
    act(() => fireEvent.click(btn('Save')))
    expect(useUserDefaults.getState().saved.prefs).toEqual({
      flashMs: 1200,
      blitzSec: 60,
      blitzQSec: 10,
      aoxN: '25',
    })
    expect(useUserDefaults.getState().saved.settings).toEqual(
      expect.objectContaining({ minY: 1, maxY: 10000 }), // panel captured as-is at open
    )
    expect(useModePrefs.getState().flashMs).toBe(2000) // saving defaults never edits live prefs
  })

  it('the popup sliders seed UNCLAMPED from live prefs beyond the pre-Round-2 maxes (ranges stay in lockstep with the mode screens)', () => {
    // The popup seeds from the LIVE stores, so its mirrors must accept every value the widened
    // mode-screen ranges can commit — a 4000ms Flash fed into a max=3000 mirror would clamp on
    // the first drag and silently corrupt the pending snapshot.
    const p = useModePrefs.getState()
    p.setFlashMs(4000) // > the old 3000 cap
    p.setBlitzSec(300) // > the old 180 cap
    p.setBlitzQSec(25) // > the old 20 cap
    mountApp()
    openSettings()
    openPopup()
    expect(flashSlider().value).toBe('4000')
    expect(screen.getByRole('slider', { name: 'Blitz round timer' }).value).toBe('300')
    expect(screen.getByRole('slider', { name: 'Blitz question timer' }).value).toBe('25')
  })

  it("the popup's N field applies the AoX validation trio (digits only, clamp on commit, Escape revert)", () => {
    mountApp()
    openSettings()
    openPopup()
    act(() => fireEvent.change(nField(), { target: { value: 'abc' } }))
    expect(nField().value).toBe('10') // non-digits rejected outright
    act(() => fireEvent.change(nField(), { target: { value: '' } }))
    act(() => fireEvent.blur(nField()))
    expect(nField().value).toBe('10') // empty commits to the fallback
    act(() => fireEvent.change(nField(), { target: { value: '2000' } }))
    act(() => fireEvent.keyDown(nField(), { key: 'Enter' }))
    expect(nField().value).toBe('1000') // Enter commits with the 2–1000 clamp
    act(() => fireEvent.change(nField(), { target: { value: '1' } }))
    // Focus first (as a real keypress implies): the popup's document-level Escape handler skips
    // the press only while an input holds focus — the field's own handler then normalize-commits
    // (the AoX field's Escape semantics) and dismisses the keyboard, NOT the popup or the panel.
    act(() => {
      nField().focus()
      fireEvent.keyDown(nField(), { key: 'Escape' })
    })
    expect(nField().value).toBe('2') // Escape commits the clamped current value
    expect(popupTitle()).toBeInTheDocument() // …and the popup (and panel) survived the press
    act(() => fireEvent.click(btn('Save')))
    expect(useUserDefaults.getState().saved.prefs.aoxN).toBe('2')
  })

  it('gear indicator + Save-Defaults dim derive from ONE at-defaults comparison across both stores', () => {
    mountApp()
    expect(gear().className).not.toContain('gear-modified')
    expect(gear()).toHaveAttribute('aria-label', 'Settings')
    // Divergence in the SETTINGS store lights the gear…
    act(() => useSettings.getState().setLeapChance('75'))
    expect(gear().className).toContain('gear-modified')
    expect(gear()).toHaveAttribute('aria-label', 'Settings (modified)')
    act(() => useSettings.getState().setLeapChance('random'))
    expect(gear().className).not.toContain('gear-modified')
    // …and so does divergence in the MODE-PREFS store (one of the 4 capturable values).
    act(() => useModePrefs.getState().setFlashMs(900))
    expect(gear().className).toContain('gear-modified')
    openSettings()
    expect(gear().className).not.toContain('gear-modified') // hidden while open (solid gear)
    expect(gear()).toHaveAttribute('aria-label', 'Settings (modified)') // the label still tells
    expect(isDimmed(btn('Save Defaults'))).toBe(false) // something to save
    openPopup()
    act(() => fireEvent.click(btn('Save'))) // live == saved now
    expect(isDimmed(btn('Save Defaults'))).toBe(true)
    // The subtle case: live returns to FACTORY but saved says 900 — that IS a divergence from
    // the effective defaults, so the button stays live (re-saving factory is meaningful).
    act(() => useModePrefs.getState().setFlashMs(2000))
    expect(isDimmed(btn('Save Defaults'))).toBe(false)
    act(() => fireEvent.click(gear())) // close the panel → the indicator bar shows again
    expect(gear().className).toContain('gear-modified')
  })

  it("the popup's Clear-saved-defaults link shows only when a snapshot exists, clears it, and keeps the popup open", () => {
    mountApp()
    openSettings()
    openPopup()
    expect(screen.queryByRole('button', { name: /Clear saved defaults/ })).toBeNull() // nothing saved yet (popup AND footer)
    act(() => fireEvent.click(btn('Save')))
    openPopup()
    // Exact name — with a snapshot saved, the ⚙ footer shows its own "Clear saved defaults" link too.
    act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Clear saved defaults (back to factory)' }),
      ),
    )
    expect(useUserDefaults.getState().saved).toBeNull() // back to factory semantics
    expect(screen.queryByRole('button', { name: /Clear saved defaults/ })).toBeNull() // both links vanish…
    expect(btn('Save')).toBeInTheDocument() // …but the popup stays open, still saveable
  })

  it('the ⚙ footer Clear-saved-defaults link: hidden without a snapshot, reachable at steady state (Save Defaults dimmed), clears it', () => {
    mountApp()
    openSettings()
    expect(screen.queryByRole('button', { name: 'Clear saved defaults' })).toBeNull() // nothing saved
    openPopup()
    act(() => fireEvent.click(btn('Save'))) // live == saved → the Save Defaults button dims…
    expect(isDimmed(btn('Save Defaults'))).toBe(true) // …making the POPUP's clear link unreachable
    const footerLink = screen.getByRole('button', { name: 'Clear saved defaults' }) // the footer link is the escape hatch
    act(() => fireEvent.click(footerLink))
    expect(useUserDefaults.getState().saved).toBeNull() // snapshot forgotten (live settings untouched)
    expect(screen.queryByRole('button', { name: 'Clear saved defaults' })).toBeNull() // and the link hides itself
  })

  it('the popup is a real modal: role=dialog + aria-modal, focus moves in on open, Tab wraps inside it', () => {
    mountApp()
    openSettings()
    openPopup()
    const dialog = screen.getByRole('dialog', { name: 'Save current settings as your defaults?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(dialog) // focus landed IN the dialog on open
    // Tab from the LAST control wraps to the first (the N field) instead of escaping to the panel
    // under the scrim (where Enter would edit the LIVE store while Save persists the open snapshot).
    const save = btn('Save')
    act(() => {
      save.focus()
      fireEvent.keyDown(save, { key: 'Tab' })
    })
    expect(document.activeElement).toBe(nField())
    // Shift+Tab from the FIRST control wraps back to the last.
    act(() => fireEvent.keyDown(nField(), { key: 'Tab', shiftKey: true }))
    expect(document.activeElement).toBe(save)
  })

  it('Escape closes the popup even while a slider holds focus (range inputs have no Escape semantics of their own)', () => {
    mountApp()
    openSettings()
    openPopup()
    act(() => {
      flashSlider().focus()
      fireEvent.keyDown(flashSlider(), { key: 'Escape' })
    })
    expect(popupTitle()).toBeNull() // the popup dismissed…
    expect(btn('Reset Settings')).toBeInTheDocument() // …and the panel survived (capture handler consumed the press)
  })

  it('scrim mousedown/click and Escape cancel the POPUP only; the settings panel closes on the next Escape', () => {
    mountApp()
    openSettings()
    openPopup()
    const scrim = document.querySelector('[data-save-defaults]')
    // The settings click-outside handler must treat the scrim as "inside" (mousedown path)…
    act(() => fireEvent.mouseDown(scrim))
    expect(btn('Reset Settings')).toBeInTheDocument()
    // …and a scrim CLICK cancels only the popup.
    act(() => fireEvent.click(scrim))
    expect(popupTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument()
    openPopup()
    act(() => fireEvent.keyDown(document.body, { key: 'Escape' })) // capture-phase popup handler wins
    expect(popupTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument()
    act(() => fireEvent.keyDown(document.body, { key: 'Escape' }))
    expect(screen.queryByRole('button', { name: 'Reset Settings' })).toBeNull()
  })

  it('Android Back closes the popup first, then Settings (LIFO overlay stack)', async () => {
    mountApp()
    // Flush jsdom's queued history traversals first: earlier tests' UI closes each ran
    // popOverlay's guarded history.back(), whose to-be-ignored popstate fires on a LATER task —
    // unflushed, a stale ignorePop would swallow the first synthetic Back below. A single
    // setTimeout(0) tick is NOT enough under full-suite CPU load (a flushed popstate can queue
    // another traversal), so flush until QUIESCENT: two consecutive ticks with zero popstate
    // events (bounded at 20 ticks).
    await act(async () => {
      let quiet = 0
      let seen = 0
      const count = () => {
        seen++
      }
      window.addEventListener('popstate', count)
      for (let i = 0; i < 20 && quiet < 2; i++) {
        seen = 0
        await new Promise((r) => setTimeout(r, 0))
        quiet = seen === 0 ? quiet + 1 : 0
      }
      window.removeEventListener('popstate', count)
    })
    openSettings()
    openPopup()
    expect(popupTitle()).toBeInTheDocument()
    // A real Back press manifests as a popstate the useBackButton stack consumes newest-first.
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(popupTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument() // settings survived the first Back
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.queryByRole('button', { name: 'Reset Settings' })).toBeNull()
  })
})
