import { useEffect } from 'react'

// lib/solveClock.ts — IS THE PLAYER BEING TIMED RIGHT NOW?
//
// ★ THE ONE DEFINITION. A SOLVE CLOCK IS RUNNING while a question is on screen and in play, nothing
// has judged it yet, and its first answer would record a solve time. engine/useGameEngine works that
// out for its own question (every mode screen runs on that hook) and reports it here; nothing else
// decides it. So no clock is running on an answered or revealed card, on an ended round or run, on a
// Blitz / MoX / Flash screen that has not been started, on Lookup or How to Play, or in a mode whose
// times are not being recorded (timing hidden, or Save Stats off).
//
// WHO ASKS. Anything the app does BY ITSELF that would get between a player and a timed answer waits
// for a moment when none is running: a popup that opens on its own (store/storageUsage's warning)
// would be read on the clock, and a pause of the page (that file's measurement of the device) would
// land in a solve time.
const running = new Set<symbol>()
const waiting = new Set<() => void>()

export const isSolveClockRunning = (): boolean => running.size > 0

/** Be called each time the last running clock stops. Returns the undo. */
export function onSolveClocksStopped(fn: () => void): () => void {
  waiting.add(fn)
  return () => {
    waiting.delete(fn)
  }
}

/** Report one clock — engine/useGameEngine's, for the question it holds. */
export function useSolveClock(runs: boolean): void {
  useEffect(() => {
    if (!runs) return
    const clock = Symbol()
    running.add(clock)
    return () => {
      running.delete(clock)
      if (running.size === 0) for (const fn of [...waiting]) fn()
    }
  }, [runs])
}
