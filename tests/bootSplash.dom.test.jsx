// @vitest-environment jsdom
//
// Boot-splash lifecycle (the boot-splash fix, batch item h). The LOADING splash is index.html's
// #boot — a body-level sibling of #root that React never touches. App removes it (dismissBootSplash)
// only after BOTH:
//   • ≥500ms of VISIBLE time — bootHoldRemaining, anchored to the window.__bootShownAt rAF stamp
//     (index.html), NOT navigation start (the old `500 - performance.now()` clamped to 0 whenever
//     React mounted >500ms after navigation — every real network / SW cold boot — flashing the
//     splash for a single frame). EXCEPT the boot right after an AUTO update: the update path stamps
//     the one-time cg-skip-boot-hold sessionStorage flag before reloading, and consuming it
//     (consumeSkipBootHold) drops the artificial hold to 0 — the user just watched the Updating
//     screen ≥1s, so the splash shows only as long as the real boot takes;
//   • the real stylesheet has APPLIED — window.__cssReady / the window 'app-css-ready' event, set by
//     the preload-swapped CSS link (vite.config.js bootCssPreload). While a pending preload link
//     exists and __cssReady isn't stamped, removing #boot would reveal an unstyled app. If the link
//     never signals (rel=preload unsupported / inline handlers stripped), a 4s escape hatch flips it
//     to a live stylesheet itself and signals — the splash can never sit up forever.
// (The full first-paint behavior — never-white frames, the ≥0.5s feel, the Updating handoff — is
// paint/SW territory: on-device staging proof per the standing lesson. These tests pin the logic.)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { App, bootHoldRemaining, consumeSkipBootHold } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'

describe('bootHoldRemaining (pure)', () => {
  it('missing stamp → the full 500ms hold (the safe direction)', () => {
    expect(bootHoldRemaining(undefined, 0)).toBe(500)
    expect(bootHoldRemaining(undefined, 123456)).toBe(500)
  })

  it('fast load: hold = 500ms minus the time already visible', () => {
    expect(bootHoldRemaining(100, 100)).toBe(500) // just painted
    expect(bootHoldRemaining(100, 250)).toBe(350)
    expect(bootHoldRemaining(100, 599)).toBe(1)
  })

  it('slow load: already visible ≥500ms → clears at once (clamps to 0, never negative)', () => {
    expect(bootHoldRemaining(100, 600)).toBe(0)
    expect(bootHoldRemaining(100, 5000)).toBe(0)
  })

  it('skipHold (the post-auto-update boot) → 0 regardless of the stamp', () => {
    expect(bootHoldRemaining(undefined, 0, true)).toBe(0)
    expect(bootHoldRemaining(100, 100, true)).toBe(0)
    expect(bootHoldRemaining(100, 5000, true)).toBe(0)
  })

  it('skipHold false → unchanged behavior (the default)', () => {
    expect(bootHoldRemaining(undefined, 0, false)).toBe(500)
    expect(bootHoldRemaining(100, 250, false)).toBe(350)
  })
})

describe('consumeSkipBootHold (the one-time post-update splash-skip flag)', () => {
  afterEach(() => {
    sessionStorage.removeItem('cg-skip-boot-hold')
  })

  it('flag present → true, and the flag is CONSUMED (a second read is false)', () => {
    sessionStorage.setItem('cg-skip-boot-hold', '1')
    expect(consumeSkipBootHold()).toBe(true)
    expect(sessionStorage.getItem('cg-skip-boot-hold')).toBeNull()
    expect(consumeSkipBootHold()).toBe(false)
  })

  it('flag absent → false (unchanged behavior)', () => {
    expect(consumeSkipBootHold()).toBe(false)
  })
})

describe('App removes the body-level #boot splash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.removeItem('cg-skip-boot-hold')
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
    document.getElementById('boot')?.remove()
    document.head.querySelector('link[rel="preload"]')?.remove()
    delete window.__cssReady
    delete window.__bootShownAt
    sessionStorage.removeItem('cg-skip-boot-hold')
  })

  // CustomSelect portals into #root, so the harness must provide one (see app-mount.dom).
  function mountApp() {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    return render(<App />)
  }
  // The real markup: #boot is a BODY-LEVEL sibling of #root, not inside it.
  function mountBootFixture() {
    const boot = document.createElement('div')
    boot.id = 'boot'
    document.body.appendChild(boot)
  }

  it('after the 500ms hold, when no stylesheet preload is pending', () => {
    mountBootFixture()
    mountApp()
    // No __bootShownAt stamp in the harness → the full 500ms hold from mount.
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(document.getElementById('boot')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    // No preload link exists here (dev/tests load CSS through the JS graph) → ready → removed.
    expect(document.getElementById('boot')).toBeNull()
  })

  it('post-auto-update boot (cg-skip-boot-hold set): comes down with NO artificial hold, flag consumed', () => {
    sessionStorage.setItem('cg-skip-boot-hold', '1')
    mountBootFixture()
    mountApp()
    // No 500ms hold — only the 0ms timer tick (the css gate is already ready here: no preload link).
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(document.getElementById('boot')).toBeNull()
    expect(sessionStorage.getItem('cg-skip-boot-hold')).toBeNull() // one-time: consumed by this boot
  })

  it('holds PAST the 500ms while the stylesheet preload is pending, then removes on app-css-ready', () => {
    mountBootFixture()
    const link = document.createElement('link')
    link.rel = 'preload'
    link.setAttribute('as', 'style')
    document.head.appendChild(link)
    mountApp()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    // Hold served, but the CSS hasn't applied → the splash must stay (no unstyled flash).
    expect(document.getElementById('boot')).not.toBeNull()
    act(() => {
      window.__cssReady = true
      window.dispatchEvent(new Event('app-css-ready'))
    })
    expect(document.getElementById('boot')).toBeNull()
  })

  it('css-gate escape hatch: a preload link that never signals is force-applied after 4s and the splash comes down', () => {
    mountBootFixture()
    const link = document.createElement('link')
    link.rel = 'preload'
    link.setAttribute('as', 'style')
    document.head.appendChild(link)
    mountApp()
    act(() => {
      vi.advanceTimersByTime(500) // hold served; the CSS gate still pending
    })
    expect(document.getElementById('boot')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(4000) // the escape-hatch deadline: do exactly what the link's onload would
    })
    expect(link.rel).toBe('stylesheet') // the preload was swapped to a live stylesheet
    expect(window.__cssReady).toBe(true)
    expect(document.getElementById('boot')).toBeNull()
  })

  it('no #boot in the DOM — the dismissal is a safe no-op (no crash)', () => {
    mountApp()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500)
      })
    }).not.toThrow()
    expect(document.getElementById('boot')).toBeNull()
  })
})
