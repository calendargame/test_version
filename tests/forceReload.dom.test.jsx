// @vitest-environment jsdom
//
// "Check for updates" — the settings-footer button that force-loads the latest deployed version
// (unregisters the service worker + clears the Cache-API caches, then reloads), so a cached old SW /
// icon can't linger (useful on a phone where you can't hard-refresh). It must NOT touch localStorage,
// so saved progress/settings survive.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'

describe('Check for updates (force reload to latest)', () => {
  let unregister, reload, cacheKeys, cacheDelete, getRegistrations, origLocation
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear() // the skip-boot-hold assertion below must see THIS test's stamp, not a stale one
    useSettings.getState().resetSettings()
    unregister = vi.fn().mockResolvedValue(true)
    getRegistrations = vi.fn().mockResolvedValue([{ unregister }, { unregister }])
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations },
      configurable: true,
    })
    cacheKeys = vi.fn().mockResolvedValue(['app-shell', 'assets'])
    cacheDelete = vi.fn().mockResolvedValue(true)
    globalThis.caches = { keys: cacheKeys, delete: cacheDelete }
    // jsdom's location.reload is non-configurable, so replace the whole location object (the app
    // only calls location.reload here; a minimal mock is enough).
    reload = vi.fn()
    origLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost/',
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        hash: '',
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        reload,
        assign() {},
        replace() {},
      },
    })
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation })
    cleanup()
    document.getElementById('root')?.remove()
    delete globalThis.caches
  })

  it('unregisters the SW, clears the caches, reloads — and preserves localStorage', async () => {
    localStorage.setItem('cg-preserve-probe', 'kept') // a neutral key the app never touches
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    render(<App />)
    act(() => {
      // /^Settings/ — the gear's accessible name is "Settings (modified)" when settings
      // diverge from the effective defaults (the Q8 indicator); match both states.
      fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    })
    // "Check for updates" (onCheckUpdates) shows the Updating overlay for MIN_UPDATING_MS (1s) before
    // reloading (Q3), so give waitFor more than its 1000ms default — the reload fires at ~1s + the
    // async SW/cache chain.
    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 5000 })
    // BOTH update paths stamp cg-skip-boot-hold just before reloading (Round-4): the user already
    // watched the ≥1s Updating hold, so the post-update boot's splash skips its artificial 500ms
    // hold and shows only the real (network-cold) boot time.
    expect(sessionStorage.getItem('cg-skip-boot-hold')).toBe('1')
    expect(getRegistrations).toHaveBeenCalled()
    expect(unregister).toHaveBeenCalledTimes(2) // both registrations unregistered
    expect(cacheKeys).toHaveBeenCalled()
    expect(cacheDelete).toHaveBeenCalledWith('app-shell')
    expect(cacheDelete).toHaveBeenCalledWith('assets')
    // saved data is NOT cleared — only the app/asset cache is.
    expect(localStorage.getItem('cg-preserve-probe')).toBe('kept')
  })
})
