// @vitest-environment jsdom
//
// src/sw.ts — what the app registers, and what happens when registering goes wrong.
//
// THIS FILE USED TO BE A SOURCE-TEXT GUARD, and that was the whole problem. sw.ts imported
// 'virtual:pwa-register', a module that only exists inside a real Vite build, so the suite could not
// import it at all; all it could do was read the file and assert that the catch block still contained
// the substring 'captureError('. Two of the conditions it was "covering" then happened in production
// — and neither would have been caught, because a source guard cannot execute anything. (The
// standing lesson: a fixture that only ever exercises the populated state is not coverage.)
//
// Round 12 removed that import — registration is now one direct navigator.serviceWorker.register()
// call — so the module is importable, and every one of these is a real behavioural test that runs
// the actual code. The old source assertions are GONE rather than kept alongside: each is now
// superseded by the behaviour it was standing in for, and a duplicate guard is dead weight.
//
// What is still NOT testable here, and is deliberately verified on-device on staging: a real service
// worker installing, activating, and taking control. jsdom has no service worker at all — every
// registration below is a stub — so what this file pins is the contract sw.ts holds with that API,
// not the API's own behaviour.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// captureError is the observable end of every failure path. Mocked (rather than spied) because the
// real module buffers into a private array with no way to read it back.
const sentry = vi.hoisted(() => ({ captureError: vi.fn(), initObservability: vi.fn() }))
vi.mock('../src/observability/sentry', () => sentry)

let register

// Install a Service Worker API whose register() behaves however this test needs, then load a FRESH
// copy of sw.ts — the module registers at import time, so each case needs its own copy
// (vi.resetModules, the observabilityGate.dom pattern). Awaiting the import is not enough: the
// reporting happens in a .then/.catch off the register() promise, so let the microtasks drain too.
const loadSwWith = async (impl) => {
  register = vi.fn(impl)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  })
  vi.resetModules()
  await import('../src/sw.js')
  await new Promise((r) => setTimeout(r, 0))
}

const reports = () => sentry.captureError.mock.calls

beforeEach(() => {
  sentry.captureError.mockClear()
})
afterEach(() => {
  delete navigator.serviceWorker
})

describe('service-worker registration (src/sw.ts)', () => {
  it('registers the built worker under the app base, at the app base scope, as a classic script', async () => {
    // The single most damaging thing this module could get wrong. vite-plugin-pwa's generated client
    // passed `buildBase + filename` and `scope || basePath` — both of which ARE Vite's resolved base
    // — so the direct call has to reproduce exactly `${BASE_URL}sw.js` and `BASE_URL`. Any drift
    // (a leading './', a trimmed slash, a missing scope) would leave every existing installation
    // beside a second worker at a different scope. BASE_URL is '/' under Vitest and in the live
    // build, and '/test_version/' on staging; the interpolation is what makes one call correct for
    // both, and both were verified against the built bundle when this replaced the plugin's helper.
    await loadSwWith(async () => ({ update: vi.fn().mockResolvedValue(undefined) }))
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      type: 'classic',
    })
  })

  it('kicks off the background update() prefetch once registration succeeds', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    await loadSwWith(async () => ({ update }))
    expect(update).toHaveBeenCalledTimes(1)
    expect(reports()).toEqual([])
  })

  it('keeps the update() prefetch SILENT when it fails — an offline no-op is not an error', async () => {
    // The opposite call to every other case here: update() rejecting is the ordinary "no network,
    // nothing newer" case and the app is entirely healthy without it (the worker it already has
    // keeps serving, and the next launch tries again). Reporting it would bury the real signals
    // below in expected noise, and an unhandled rejection would surface it anyway.
    const update = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await loadSwWith(async () => ({ update }))
    expect(update).toHaveBeenCalledTimes(1)
    expect(reports()).toEqual([])
  })

  it('reports a REJECTED registration exactly once, as sw-register', async () => {
    // A 404 on sw.js, a blocked worker, an unsupported scope. The app is left with no offline copy,
    // no update path, and "Check for updates" with nothing to apply through — rare, always
    // actionable, and (before Q10a) completely invisible.
    const error = new Error('Failed to register a ServiceWorker: 404')
    await loadSwWith(async () => {
      throw error
    })
    expect(reports()).toEqual([[error, { where: 'sw-register' }]])
  })

  it('reports a registration that RESOLVES undefined — and does not throw', async () => {
    // The production crash this replacement fixed at the root. A device whose Service Worker API is
    // stubbed (privacy extension, enterprise shim, bot) resolves register() with `undefined`, which
    // is not spec-legal. workbox-window 7.4.1 then read `this._registration.waiting` unguarded and
    // threw "Cannot read properties of undefined (reading 'waiting')" from inside a minified
    // third-party bundle — a signature with no public report anywhere and no upstream fix coming.
    // The same device now produces one named report from our own code, and the import still settles.
    await expect(loadSwWith(async () => undefined)).resolves.toBeUndefined()
    expect(reports()).toHaveLength(1)
    const [error, context] = reports()[0]
    expect(context).toEqual({ where: 'sw-register' })
    expect(error).toBeInstanceOf(TypeError)
    // Says what actually happened, in OUR words — the whole point of the change.
    expect(String(error)).toContain('resolved undefined')
  })

  it('reports a registration that resolves null the same way', async () => {
    // Same class of stub, other falsy value. Nothing about the guard is special-cased to undefined.
    await loadSwWith(async () => null)
    expect(reports()).toHaveLength(1)
    expect(reports()[0][1]).toEqual({ where: 'sw-register' })
    expect(String(reports()[0][0])).toContain('resolved null')
  })
})
