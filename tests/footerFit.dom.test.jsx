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
// shrink every re-render (the StatPanel feedback loop). The shimmed base is 12px — the trio's
// resting text-xs control tier (Round-3 font normalization). Two cases: scale 0.5 floors at the
// 11px legibility minimum on all three captions identically; scale 0.95 lands above the floor and
// must STAY there across App re-renders (a compounding fit would step 11.4 → 10.83 → the floor).
// The pure math is locked in tests/statPanel.test.js; real geometry is on-device per the standing
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
    // read with the twins' true resting size, text-xs = 12px (buttons still get the original,
    // for the padding read).
    window.getComputedStyle = (el, pseudo) =>
      el?.hasAttribute?.('data-fittwin') ? { fontSize: '12px' } : origGetComputedStyle(el, pseudo)
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    Object.defineProperty(Element.prototype, 'scrollWidth', swDesc)
    Object.defineProperty(Element.prototype, 'clientWidth', cwDesc)
    window.getComputedStyle = origGetComputedStyle
  })

  it('the measurement twins and the live buttons share the SAME text-size token (text-xs) — the shimmed base is truthful', () => {
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    const twins = Array.from(document.querySelectorAll('[data-fittwin]'))
    const btns = Array.from(document.querySelectorAll('[data-fitlabel]')).map(
      (l) => l.parentElement,
    )
    expect(twins.length).toBe(3)
    expect(btns.length).toBe(3)
    for (const el of [...twins, ...btns]) {
      expect(el.className).toContain('text-xs')
      expect(el.className).not.toContain('text-sm')
    }
  })

  it('applies ONE shared floored font-size to all three captions when the measurements demand a shrink', () => {
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    const labels = Array.from(document.querySelectorAll('[data-fitlabel]'))
    expect(labels).toHaveLength(3)
    // scale = min(50/100) = 0.5 → 12px × 0.5 = 6px → floored to the 11px legibility minimum.
    // The fitted size lands on the BUTTON (the caption inherits it) so the line-box strut shrinks
    // with the text and the label stays vertically centered; the span itself carries no inline size.
    expect(labels.map((l) => l.parentElement.style.fontSize)).toEqual(['11px', '11px', '11px'])
    expect(labels.map((l) => l.style.fontSize)).toEqual(['', '', ''])
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
    btnWidth = 95 // scale = 95/100 = 0.95 → 12px × 0.95 = 11.4px, above the 11px floor
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    const expected = Math.max(11, 12 * 0.95) + 'px'
    const labels = Array.from(document.querySelectorAll('[data-fitlabel]'))
    expect(labels.map((l) => l.parentElement.style.fontSize)).toEqual([
      expected,
      expected,
      expected,
    ])
    // Any settings interaction re-renders App and re-runs the dep-less fit effect. The base must
    // come off the static twin, not the already-shrunk caption — a feedback loop would step
    // 11.4 → 10.83 → 11 (the floor) here instead of holding.
    act(() => useSettings.getState().setJanFebChance('25'))
    act(() => useSettings.getState().setJanFebChance('random'))
    expect(labels.map((l) => l.parentElement.style.fontSize)).toEqual([
      expected,
      expected,
      expected,
    ])
  })
})
