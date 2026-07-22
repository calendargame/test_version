// @vitest-environment jsdom
//
// Q3 (round-7) — useBackButton's two history regimes. The hook is the app's ONLY history writer:
// on platforms with a Back affordance (Android hardware Back, desktop, browser tabs) each open
// overlay pushes one {cgOverlay} entry so Back closes it, while the iOS INSTALLED app
// (navigator.standalone === true) never touches history at all — iOS honors edge swipes over the
// stack with no gesture opt-out, so entries there turn into swipe-navigation ping-pong. These
// tests pin both regimes plus the dead-forward-entry bounce (Forward onto the leftover entry of a
// closed overlay snaps straight back).
//
// Harness notes: IOS_STANDALONE is sampled at MODULE SCOPE, so every test sets
// navigator.standalone first and then imports a fresh copy of the module (vi.resetModules +
// dynamic import; react itself is externalized, so the hook still binds the one real React).
// Each fresh copy attaches its own module-level popstate listener at import — the beforeEach
// addEventListener spy records them so afterEach can detach, keeping stale instances from
// answering later tests' popstates. jsdom performs history traversals (back/forward) on LATER
// tasks, so after any traversal the tests flush until quiescent (two consecutive zero-popstate
// ticks — the proven saveDefaults.dom pattern).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, act, cleanup } from '@testing-library/react'

let popstateListeners = []
let pushSpy
let backSpy

function setStandalone(value) {
  // navigator.standalone is WebKit-only, so jsdom never defines it; define it per-test.
  // Detection is `=== true`, so value:undefined is equivalent to the property being absent.
  Object.defineProperty(window.navigator, 'standalone', { value, configurable: true })
}

async function freshUseBackButton() {
  // Fresh module = fresh IOS_STANDALONE sample + empty stack + clean ignorePop. Set
  // navigator.standalone BEFORE calling this — the import evaluates the module-scope const.
  vi.resetModules()
  return (await import('../src/components/useBackButton.js')).useBackButton
}

async function flushTraversals() {
  // Flush jsdom's queued history traversals until QUIESCENT: two consecutive ticks with zero
  // popstate events (a flushed popstate can queue another traversal), bounded at 20 ticks.
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
}

beforeEach(() => {
  popstateListeners = []
  const realAdd = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
    if (type === 'popstate') popstateListeners.push(handler)
    return realAdd(type, handler, options)
  })
  // Pass-through spies (vi.spyOn keeps the real jsdom implementations) so entry counts are
  // observable while traversals still actually happen.
  pushSpy = vi.spyOn(window.history, 'pushState')
  backSpy = vi.spyOn(window.history, 'back')
})

afterEach(async () => {
  cleanup() // unmount → effect cleanups drain the module's stack (may queue guarded traversals)
  await flushTraversals() // settle jsdom's history before detaching the module's listener
  for (const fn of popstateListeners) window.removeEventListener('popstate', fn)
  // Synthetic Back popstates close overlays WITHOUT traversing jsdom's real, file-shared session
  // history, which can leave the current position parked on a marker entry. Rewind (listeners
  // already detached, so nothing reacts) until the position is marker-less, so every test starts
  // from a clean baseline. Bounded, like the flush.
  for (let i = 0; i < 20 && window.history.state?.cgOverlay; i++) {
    window.history.back()
    await flushTraversals()
  }
  vi.restoreAllMocks()
  setStandalone(undefined)
})

describe('Android-like (navigator.standalone undefined) — entries pushed', () => {
  it('each open overlay pushes ONE marker entry; a real Back closes newest-first with no extra history.back()', async () => {
    const useBackButton = await freshUseBackButton()
    const log = []
    // Self-closing hosts mirror real overlays: the Back-driven close flips isOpen off, so the
    // effect cleanup runs popOverlay and must find the stack entry already consumed (over-pop guard).
    function SelfClosing({ id }) {
      const [open, setOpen] = useState(true)
      useBackButton(
        open,
        () => {
          log.push(id)
          setOpen(false)
        },
        id,
      )
      return null
    }
    render(
      <>
        <SelfClosing id="a" />
        <SelfClosing id="b" />
      </>,
    )
    expect(pushSpy).toHaveBeenNthCalledWith(1, { cgOverlay: 'a' }, '')
    expect(pushSpy).toHaveBeenNthCalledWith(2, { cgOverlay: 'b' }, '')
    // A real Back press manifests as a popstate (the browser already popped the entry itself).
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(log).toEqual(['b']) // LIFO: newest overlay closes first, the other survives
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(log).toEqual(['b', 'a'])
    // Neither Back-driven close may unwind history again — the browser already did.
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('a UI close unwinds its entry with a guarded history.back() whose popstate closes nothing', async () => {
    const useBackButton = await freshUseBackButton()
    const close = vi.fn()
    function Host({ open }) {
      useBackButton(open, close, 'settings')
      return null
    }
    const { rerender } = render(<Host open />)
    expect(pushSpy).toHaveBeenCalledTimes(1)
    rerender(<Host open={false} />) // the UI close path: effect cleanup → popOverlay
    expect(backSpy).toHaveBeenCalledTimes(1)
    await flushTraversals()
    expect(close).not.toHaveBeenCalled() // our own back()'s popstate was swallowed (ignorePop)
    // …and swallowed exactly once: the next overlay still closes on a real Back.
    rerender(<Host open />)
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('Forward onto a dead entry (closed overlay leftover) bounces straight back; marker-less popstates do not', async () => {
    const useBackButton = await freshUseBackButton()
    const close = vi.fn()
    function Host({ open }) {
      useBackButton(open, close, 'settings')
      return null
    }
    // A popstate with NO overlay open and NO marker (foreign history activity) must do nothing.
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(backSpy).not.toHaveBeenCalled()
    // Open + UI-close leaves the classic dead FORWARD entry: back() traversed past it, but the
    // {cgOverlay:'settings'} entry itself survives in the session history.
    const { rerender } = render(<Host open />)
    rerender(<Host open={false} />)
    expect(backSpy).toHaveBeenCalledTimes(1)
    await flushTraversals()
    // Forward parks on the dead entry → its popstate carries the marker with an empty stack →
    // the guarded bounce snaps back and its own popstate is swallowed.
    act(() => window.history.forward())
    await flushTraversals()
    expect(backSpy).toHaveBeenCalledTimes(2) // the UI close + the bounce, nothing more
    expect(close).not.toHaveBeenCalled()
    expect(window.history.state?.cgOverlay).toBeUndefined() // rests on the base entry again
  })
})

describe('iOS standalone (navigator.standalone === true) — history never written', () => {
  it('open pushes no entry, UI close calls no history.back(), and close/reopen bookkeeping stays intact', async () => {
    setStandalone(true)
    const useBackButton = await freshUseBackButton()
    const close = vi.fn()
    function Host({ open }) {
      useBackButton(open, close, 'settings')
      return null
    }
    const { rerender } = render(<Host open />)
    expect(pushSpy).not.toHaveBeenCalled()
    rerender(<Host open={false} />) // UI close: stack bookkeeping only
    rerender(<Host open />) // reopen: registers again without complaint
    expect(pushSpy).not.toHaveBeenCalled()
    // The stack itself stays live (uniform mechanism — real iOS just can't fire popstate with a
    // single-entry history): a popstate still closes the registered overlay…
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(close).toHaveBeenCalledTimes(1)
    // …and the follow-up cleanup finds the stack entry consumed. No history call anywhere.
    rerender(<Host open={false} />)
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('a stale marker popstate still bounces (the dead-entry bounce is ungated on purpose — self-heals pre-Q3 leftovers)', async () => {
    setStandalone(true)
    await freshUseBackButton()
    act(() =>
      window.dispatchEvent(new PopStateEvent('popstate', { state: { cgOverlay: 'settings' } })),
    )
    expect(backSpy).toHaveBeenCalledTimes(1)
  })
})
