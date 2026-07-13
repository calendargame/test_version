// @vitest-environment jsdom
//
// Footer-button caption auto-fit (Round-2) — the ⚙ Save Defaults / Reset Settings / Full Reset
// trio shares ONE font-size, measured against hidden static twins of the widest caption set so
// the Full Reset → "Confirm?" swap can never jiggle the row.
//
// jsdom has no layout, so this pins the WIRING by feeding fitFooterBtns mock measurements:
// prototype-level width getters (twins 100px natural, buttons btnWidth available) + a font-size
// shim for the STATIC twins — the base-size source, which is what keeps the fit stable: reading
// the live captions would feed the previous pass's inline fontSize back in and compound the
// shrink every re-render (the StatPanel feedback loop). Two cases: scale 0.5 floors at the 11px
// legibility minimum on all three captions identically; scale 0.9 lands above the floor and must
// STAY there across App re-renders (a compounding fit would step 12.6 → 11.34 → the floor). The
// pure math is locked in tests/statPanel.test.js; real geometry is on-device per the standing
// lesson.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { useUserDefaults } from '../src/store/userDefaults.js'
import { useProgress } from '../src/store/progress.js'

const swDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')
const cwDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
const origGetComputedStyle = window.getComputedStyle

function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

let btnWidth = 50 // trio-button content width the mocks report; tests vary it to steer the scale

describe('footer-button auto-fit wiring (Round-2)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
    useUserDefaults.getState().clearDefaults()
    useProgress.getState().resetProgress()
    btnWidth = 50
    // Twins report a 100px natural caption; the trio buttons report btnWidth of content width.
    // Every other element keeps jsdom's 0 (→ scale 1 no-ops elsewhere, e.g. StatPanel's fit).
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.hasAttribute?.('data-fittwin') ? 100 : 0
      },
    })
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.matches?.('button') && this.querySelector('[data-fitlabel]') ? btnWidth : 0
      },
    })
    // fitFooterBtns reads the base size off the first STATIC twin (never a live caption — that
    // inline fontSize would compound); jsdom computes no real font-size, so shim exactly that
    // read (buttons still get the original, for the padding read).
    window.getComputedStyle = (el, pseudo) =>
      el?.hasAttribute?.('data-fittwin') ? { fontSize: '14px' } : origGetComputedStyle(el, pseudo)
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    Object.defineProperty(Element.prototype, 'scrollWidth', swDesc)
    Object.defineProperty(Element.prototype, 'clientWidth', cwDesc)
    window.getComputedStyle = origGetComputedStyle
  })

  it('applies ONE shared floored font-size to all three captions when the measurements demand a shrink', () => {
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    const labels = Array.from(document.querySelectorAll('[data-fitlabel]'))
    expect(labels).toHaveLength(3)
    // scale = min(50/100) = 0.5 → 14px × 0.5 = 7px → floored to the 11px legibility minimum.
    expect(labels.map((l) => l.style.fontSize)).toEqual(['11px', '11px', '11px'])
    // The measurement set is the static widest-caption twins, one per button, invisible to AT.
    const twins = Array.from(document.querySelectorAll('[data-fittwin]'))
    expect(twins.map((t) => t.textContent)).toEqual([
      'Save Defaults',
      'Reset Settings',
      'Full Reset',
    ])
    twins.forEach((t) => expect(t).toHaveAttribute('aria-hidden', 'true'))
  })

  it('the fit is STABLE across re-renders — the shrink never compounds toward the floor', () => {
    btnWidth = 90 // scale = 90/100 = 0.9 → 14px × 0.9, comfortably above the 11px floor
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    const expected = Math.max(11, 14 * 0.9) + 'px'
    const labels = Array.from(document.querySelectorAll('[data-fitlabel]'))
    expect(labels.map((l) => l.style.fontSize)).toEqual([expected, expected, expected])
    // Any settings interaction re-renders App and re-runs the dep-less fit effect. The base must
    // come off the static twin, not the already-shrunk caption — a feedback loop would step
    // 12.6 → 11.34 → 11 here instead of holding.
    act(() => useSettings.getState().setJanFebChance('25'))
    act(() => useSettings.getState().setJanFebChance('random'))
    expect(labels.map((l) => l.style.fontSize)).toEqual([expected, expected, expected])
  })
})
