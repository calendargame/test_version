// @vitest-environment jsdom
//
// View saved defaults (Q12) — the ⚙ footer's read-only inspect twin of the Save Defaults popup.
//
// Drives the real <App/> like a user: once a snapshot exists, a "View saved defaults" link appears
// LEFT of "Clear saved defaults" (non-destructive inspect before destructive wipe; both hide
// together when nothing is saved — nothing to view). It opens a read-only modal fed by the SAME
// effective-defaults memo + formatters as the Save card, with full modal parity (focus-on-open,
// capture Escape, close-with-settings, Android Back, the shared Tab trap) and the renamed
// [data-settings-modal] marker shared with the Save popup (the marker-rename regression lives
// here). Visual polish (one-line fit, themes, drag-release) is on-device per the standing lesson.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, within, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings, SETTINGS_DEFAULTS } from '../src/store/settings.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { useUserDefaults } from '../src/store/userDefaults.js'
import { useProgress } from '../src/store/progress.js'

// ── Harness helpers (the saveDefaults.dom harness, plus the View popup's own) ──
function mountApp() {
  // CustomSelect panels AND both settings modals portal into #root; provide one. App's own
  // tree mounts into RTL's container (not #root), so there's no duplicate auto-mount.
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

const gear = () => screen.getByRole('button', { name: /^Settings/ })
const openSettings = () => act(() => fireEvent.click(gear()))
const btn = (name) => screen.getByRole('button', { name })
const openView = () => act(() => fireEvent.click(btn('View saved defaults')))
const viewTitle = () => screen.queryByText('Your saved defaults')
const viewDialog = () => screen.getByRole('dialog', { name: 'Your saved defaults' })
// Save a snapshot through the UI (settings must be open): Save Defaults → Save.
const saveSnapshot = () => {
  act(() => fireEvent.click(btn('Save Defaults')))
  act(() => fireEvent.click(btn('Save')))
}
// A row's static value text, located from its visible label span (label + value share a row div).
const rowValue = (label) =>
  within(viewDialog()).getByText(label).parentElement.lastElementChild.textContent

describe('View saved defaults (Q12)', () => {
  beforeEach(() => {
    // All persisted singletons back to a clean baseline.
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

  it('the link hides without a snapshot, appears LEFT of Clear after a save, and opens the read-only modal', () => {
    act(() => useModePrefs.getState().setFlashMs(800)) // something to save
    mountApp()
    openSettings()
    expect(screen.queryByRole('button', { name: 'View saved defaults' })).toBeNull() // nothing saved — nothing to view
    saveSnapshot()
    const view = btn('View saved defaults')
    const clear = btn('Clear saved defaults')
    // One flex row, View LEFT of Clear (non-destructive inspect before destructive wipe).
    expect(view.parentElement).toBe(clear.parentElement)
    expect(view.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    openView()
    const dialog = viewDialog()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(dialog) // focus landed IN the dialog on open
    // Read-only by construction: the one control is Close — no fields, no sliders.
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(dialog).queryAllByRole('slider')).toHaveLength(0)
    expect(within(dialog).getAllByRole('button')).toHaveLength(1)
  })

  it('shows the four saved values through the SAME formatters as the Save card', () => {
    const p = useModePrefs.getState()
    p.setFlashMs(800)
    p.setBlitzSec(90)
    p.setBlitzQSec(10.5)
    p.setAoxN('25')
    mountApp()
    openSettings()
    saveSnapshot()
    openView()
    expect(rowValue('AoX Run Length')).toBe('25') // normalizeAoxN
    expect(rowValue('Flash Speed')).toBe('0.8s') // fmtFlashT
    expect(rowValue('Blitz Round Timer')).toBe('1m 30s') // fmtBlitzT
    expect(rowValue('Blitz Question Timer')).toBe('10.5s') // +"s"
  })

  it('a legacy snapshot missing a field forward-merges to factory — never undefined', () => {
    // Simulate a snapshot persisted before blitzQSec existed (the saver never saw the field);
    // effectivePrefDefaults forward-merges it over the factory constants (store/userDefaults).
    act(() =>
      useUserDefaults.getState().saveDefaults({
        settings: { ...SETTINGS_DEFAULTS },
        prefs: { flashMs: 800, blitzSec: 90, aoxN: '25' },
      }),
    )
    mountApp()
    openSettings()
    openView()
    expect(rowValue('Blitz Question Timer')).toBe('10s') // factory 10, forward-merged
    expect(rowValue('Flash Speed')).toBe('0.8s') // the saved fields still read saved
    expect(rowValue('AoX Run Length')).toBe('25')
  })

  it('Close, scrim mousedown/click and Escape dismiss the popup only — the settings panel survives', () => {
    act(() => useModePrefs.getState().setFlashMs(800))
    mountApp()
    openSettings()
    saveSnapshot()
    openView()
    act(() => fireEvent.click(btn('Close')))
    expect(viewTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument()
    openView()
    // The settings click-outside handler must treat the scrim as "inside" — the renamed
    // [data-settings-modal] marker (the marker-rename regression, shared with the Save popup)…
    const scrim = document.querySelector('[data-settings-modal]')
    act(() => fireEvent.mouseDown(scrim))
    expect(btn('Reset Settings')).toBeInTheDocument()
    // …and a scrim CLICK cancels only the popup.
    act(() => fireEvent.click(scrim))
    expect(viewTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument()
    openView()
    act(() => fireEvent.keyDown(document.body, { key: 'Escape' })) // capture-phase popup handler wins
    expect(viewTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument()
  })

  it('closing Settings closes the popup with it (child flow of the panel)', () => {
    act(() => useModePrefs.getState().setFlashMs(800))
    mountApp()
    openSettings()
    saveSnapshot()
    openView()
    expect(viewTitle()).toBeInTheDocument()
    act(() => fireEvent.click(gear())) // any settings close counts
    expect(viewTitle()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset Settings' })).toBeNull()
  })

  it('the single-button Tab trap wraps in place on Close; the mode dropdown stays suppressed', () => {
    act(() => useModePrefs.getState().setFlashMs(800))
    mountApp()
    openSettings()
    saveSnapshot()
    openView()
    const close = btn('Close')
    // first === last in the shared trapModalTab → Tab and Shift+Tab both wrap to Close itself.
    act(() => {
      close.focus()
      fireEvent.keyDown(close, { key: 'Tab' })
    })
    expect(document.activeElement).toBe(close)
    act(() => fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }))
    expect(document.activeElement).toBe(close)
    // The app-wide Tab shortcut bails while a settings modal is up (the [data-settings-modal]
    // guard) — the mode dropdown must not open behind the aria-modal dialog.
    act(() => fireEvent.keyDown(window, { key: 'Tab' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(viewTitle()).toBeInTheDocument()
  })

  it('Android Back closes the popup first, then Settings (LIFO overlay stack)', async () => {
    act(() => useModePrefs.getState().setFlashMs(800))
    mountApp()
    openSettings()
    saveSnapshot()
    // Flush jsdom's queued history traversals until quiescent (the saveDefaults.dom pattern):
    // earlier tests' UI closes — and saveSnapshot's own Save-popup close just above — each ran
    // popOverlay's guarded history.back(), whose to-be-ignored popstate fires on a later task
    // and would otherwise swallow the first synthetic Back below.
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
    openView()
    expect(viewTitle()).toBeInTheDocument()
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(viewTitle()).toBeNull()
    expect(btn('Reset Settings')).toBeInTheDocument() // settings survived the first Back
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.queryByRole('button', { name: 'Reset Settings' })).toBeNull()
  })
})
