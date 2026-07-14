// @vitest-environment jsdom
//
// makeUpdateReloadGate — the auto-update path's two-signal reload gate (Round 3). The real
// auto-update effect is import.meta.env.PROD-gated (it never runs under Vitest) and actual SW
// activation timing is on-device territory (standing lesson), so this pure gate is the test
// surface; engage() only wires it to the real SW + setUpdating. Contract: reload fires only after
// BOTH the SW handoff (controllerchange, or the 4s safety timeout — either calls onHandoff) AND
// the armed min-hold have completed, fires at most ONCE, and cancel() (the effect's cleanup)
// kills the hold so a torn-down gate can never fire a stray reload.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeUpdateReloadGate } from '../src/main.jsx'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('makeUpdateReloadGate', () => {
  it('the hold alone never reloads — both signals are required', () => {
    const reload = vi.fn()
    const gate = makeUpdateReloadGate({ minHoldMs: 1000, reload })
    gate.armHold()
    vi.advanceTimersByTime(5000)
    expect(reload).not.toHaveBeenCalled()
    gate.onHandoff()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a fast handoff (controllerchange within tens of ms) waits out the remaining hold', () => {
    const reload = vi.fn()
    const gate = makeUpdateReloadGate({ minHoldMs: 1000, reload })
    gate.armHold()
    vi.advanceTimersByTime(100)
    gate.onHandoff() // activation of an already-waiting worker is near-instant
    expect(reload).not.toHaveBeenCalled() // …but the Updating screen must still be SEEN
    vi.advanceTimersByTime(899)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('the safety-net handoff (controllerchange never fired) still reloads once the hold is done', () => {
    // engage()'s 4s safety calls onHandoff WITHOUT clearing the attempt counter (that only happens
    // on controllerchange) — the gate behaves identically for either caller; the attempts-survive
    // semantics live in engage(), outside the gate.
    const reload = vi.fn()
    const gate = makeUpdateReloadGate({ minHoldMs: 1000, reload })
    gate.armHold()
    vi.advanceTimersByTime(4000) // the hold is long done by the safety deadline
    gate.onHandoff()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('fires at most once — duplicate handoffs (unrelated controllerchange + the safety) are no-ops', () => {
    const reload = vi.fn()
    const gate = makeUpdateReloadGate({ minHoldMs: 1000, reload })
    gate.armHold()
    vi.advanceTimersByTime(1000)
    gate.onHandoff()
    gate.onHandoff()
    gate.onHandoff()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cancel() also deadens the gate AFTER the hold elapsed — a late handoff cannot reload', () => {
    const reload = vi.fn()
    const gate = makeUpdateReloadGate({ minHoldMs: 1000, reload })
    gate.armHold()
    vi.advanceTimersByTime(1000) // hold satisfied…
    gate.cancel() // …then the effect tears down (unmount/cleanup)
    gate.onHandoff() // a stray controllerchange after teardown
    expect(reload).not.toHaveBeenCalled()
  })

  it('cancel() clears the hold — a torn-down gate can never fire a stray reload', () => {
    const reload = vi.fn()
    const gate = makeUpdateReloadGate({ minHoldMs: 1000, reload })
    gate.armHold()
    gate.cancel()
    vi.advanceTimersByTime(10000)
    gate.onHandoff()
    expect(reload).not.toHaveBeenCalled()
  })
})
