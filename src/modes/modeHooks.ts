// Shared mode-screen hooks, extracted verbatim from main.tsx (Q1 phase 1). These are the pieces of
// per-mode chrome deduped out of the five screens during the Stage-C mode-untangle: they move
// together because every screen uses some subset and none of them belongs to any one screen.
import * as React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/gameReducer.js'
import type { GameEngine, FlashState } from './modeTypes.js'
import { calcLast, calcAvg, calcMed } from '../engine/stats.js'
import { fmtAccuracyPct, truncTime, fmtTime } from '../lib/modeFormat.js'

// Timing constants. The codes panel's own timings (its slide duration and the CODES_CLOSE_MS
// freeze window derived from it) live in src/lib/accordionMotion.js and are consumed entirely
// inside components/MethodBreakdown — nothing in this file needs them (Q5, round 8).
export const FLASH_MS = 550 // green/red button flash duration (ms)
// Button-pulse flash (the green/red pulse on an answered option) — transient UI, not engine
// state. Every mode component owns one; this hook is the single copy. Latest-timeout pattern
// so rapid answers each get the full FLASH_MS before clearing. `setFlash` is exposed for the
// few sites that clear it directly (e.g. Deduction's sub-type switch).
export function useButtonFlash() {
  const [flash, setFlash] = useState<FlashState | null>(null)
  const flashClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setFlashWithTimeout = (val: FlashState) => {
    setFlash(val)
    if (flashClearRef.current) clearTimeout(flashClearRef.current)
    flashClearRef.current = setTimeout(() => {
      setFlash(null)
      flashClearRef.current = null
    }, FLASH_MS)
  }
  return { flash, setFlash, setFlashWithTimeout }
}
// The engine-state half of a mode's freshness check (stats all zero, no history, no live-question
// flags set) — identical across modes. Each mode ANDs its own fields (toggles/timers/bests) on top.
export function engineFresh(s: GameState) {
  return (
    s.stats.played === 0 &&
    s.stats.good === 0 &&
    s.stats.streak === 0 &&
    s.stats.best === 0 &&
    s.stats.times.length === 0 &&
    s.stack.length === 0 &&
    s.forwardStack.length === 0 &&
    s.backDepth === 0 &&
    s.locked === false &&
    s.revealed === false &&
    s.countedWrong === false &&
    s.canOverrideCorrect === false &&
    s.pendingWrongOverride === null &&
    s.overrideUsedThisQ === false &&
    s.calcOpen === false &&
    s.calcPenaltyActive === false
  )
}
// Shared "hideable stats" chrome for the three non-timed modes (Classic, Flash, Deduction): the
// show/hide toggles, the two-tap "Enable and Reset Stats?" arm (+ its click-outside / Save-Stats-off
// / mode-leave disarms), and the 6-box stats array + armedSpan for <StatPanel>. Re-enabling timing
// follows App's original rule: OFF→just hide; ON with no desync→regen the live date; ON with a
// desync (stats moved while hidden)→two-tap confirm→full reset. Both toggles (`timingOff` +
// `scoringOff`) are owned by the component and persisted in the mode-prefs store, so they're
// passed in with their setters (timingOff also feeds useGameEngine). Flash is the only
// mode with a live timer to tear down, so it passes afterTimingEnabled() (on re-enable) and onHide()
// (on mode-leave); Classic/Deduction omit them.
export function useStatsHideToggles({
  eng,
  saveStats,
  visible,
  timingOff,
  setTimingOff,
  scoringOff,
  setScoringOff,
  afterTimingEnabled,
  onHide,
}: {
  eng: GameEngine
  saveStats: boolean
  visible: boolean
  timingOff: boolean
  setTimingOff: (v: boolean) => void
  scoringOff: boolean
  setScoringOff: (v: boolean) => void
  afterTimingEnabled?: () => void
  onHide?: () => void
}) {
  // timingOff + scoringOff are owned by the mode component (persisted in the mode-prefs store) and
  // passed in, so the hook holds no toggle state of its own — it just orchestrates the desync arm
  // and builds the stats strip from them.
  const S = eng.state.stats
  const [timingArmed, setTimingArmed] = useState(false)
  const timingArmedRef = useRef(false)
  const timingArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timingArmBtnRef = useRef<HTMLButtonElement | null>(null)
  const disarmTimingArm = () => {
    if (timingArmTimerRef.current) {
      clearTimeout(timingArmTimerRef.current)
      timingArmTimerRef.current = null
    }
    timingArmedRef.current = false
    setTimingArmed(false)
  }
  const toggleScoringOff = () => {
    if (!saveStats) return
    setScoringOff(!scoringOff)
  } // scoringOff is the current (prop) value
  const toggleTimingOff = () => {
    if (!saveStats) return
    if (!timingOff) {
      setTimingOff(true)
      return
    }
    const desync = S.good !== S.times.length
    if (!desync) {
      eng.regenDate()
      if (afterTimingEnabled) afterTimingEnabled()
      setTimingOff(false)
      return
    }
    if (timingArmedRef.current) {
      if (timingArmTimerRef.current) {
        clearTimeout(timingArmTimerRef.current)
        timingArmTimerRef.current = null
      }
      timingArmedRef.current = false
      setTimingArmed(false)
      eng.fullReset()
      if (afterTimingEnabled) afterTimingEnabled()
      setTimingOff(false)
      return
    }
    timingArmedRef.current = true
    setTimingArmed(true)
    if (timingArmTimerRef.current) clearTimeout(timingArmTimerRef.current)
    timingArmTimerRef.current = setTimeout(() => {
      timingArmedRef.current = false
      setTimingArmed(false)
      timingArmTimerRef.current = null
    }, 3000)
  }
  useEffect(() => {
    if (!timingArmed) return
    const h = (e: MouseEvent) => {
      if (timingArmBtnRef.current && timingArmBtnRef.current.contains(e.target as Node | null))
        return
      disarmTimingArm()
    }
    const t = setTimeout(() => document.addEventListener('click', h), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', h)
    }
  }, [timingArmed])
  // Fire on visibility transitions only: when hidden, disarm + run the mode's teardown (onHide,
  // the Flash flash-stopper). onHide/disarmTimingArm are re-created each render; listing them
  // would re-fire the teardown every render. Intentional [visible]-only effect.
  useEffect(() => {
    if (!visible) {
      if (timingArmedRef.current) disarmTimingArm()
      if (onHide) onHide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  useEffect(() => {
    if (!saveStats && timingArmedRef.current) disarmTimingArm()
  }, [saveStats])
  const sLast = calcLast(S.times),
    sAvg = calcAvg(S.times),
    sMed = calcMed(S.times)
  const sOff = scoringOff || !saveStats
  const tOff = timingOff || !saveStats
  const sFn = saveStats ? toggleScoringOff : null
  const tFn = saveStats ? toggleTimingOff : null
  const statsArr = [
    { label: 'Score', value: `${S.good}/${S.played}`, off: sOff, fn: sFn },
    { label: 'Accuracy', value: fmtAccuracyPct(S.good, S.played), off: sOff, fn: sFn },
    { label: 'Streak', value: `${S.streak}/${S.best}`, off: sOff, fn: sFn },
    { label: 'Last', value: truncTime(sLast), off: tOff, fn: tFn },
    { label: 'Average', value: fmtTime(sAvg), off: tOff, fn: tFn },
    { label: 'Median', value: fmtTime(sMed), off: tOff, fn: tFn },
  ]
  const armedSpan =
    timingArmed && saveStats
      ? { startIdx: 3, endIdx: 5, label: 'Enable and Reset Stats?', onClick: toggleTimingOff }
      : null
  // armedBtnRef is returned separately (not nested in armedSpan) so StatPanel's plain
  // armedSpan data stays ref-free — see the note in StatPanel.tsx.
  return { timingArmed, statsArr, armedSpan, armedBtnRef: timingArmBtnRef }
}

// Two-tap "Reset Stats?" confirm for the casual modes (Classic / Flash / Deduction) — mirrors the
// timing-arm above so the two destructive actions feel identical. A first tap ARMS (the button shows
// "Reset Stats?" in the danger colour, 3s); a second tap within 3s runs `resetFn` (Classic/Deduction
// = eng.resetStats; Flash passes its own reset that also tears the live flash down). Disarms on the
// 3s timeout, a click outside the button, or leaving the mode. Gated on `hasData`: a fully-fresh mode
// (engineFresh) has nothing to clear, so a tap is a harmless no-op (never arms). The `S` keyboard
// shortcut routes through the same onClick via .click() (see the keyboard effect), so it arms +
// confirms identically. (Q2.)
export function useResetStatsArm(resetFn: () => void, hasData: boolean, visible: boolean) {
  const [resetArmed, setResetArmed] = useState(false)
  const armedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetBtnRef = useRef<HTMLButtonElement | null>(null)
  const disarm = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    armedRef.current = false
    setResetArmed(false)
  }
  const onResetTap = () => {
    if (!hasData) {
      disarm()
      return
    } // nothing to clear → no-op (don't arm)
    if (armedRef.current) {
      disarm()
      resetFn()
      return
    } // second tap within 3s → confirm + reset
    armedRef.current = true
    setResetArmed(true) // first tap → arm
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      armedRef.current = false
      setResetArmed(false)
    }, 3000)
  }
  // Click anywhere but the button disarms (delayed one tick so the arming click itself doesn't disarm).
  useEffect(() => {
    if (!resetArmed) return
    const h = (e: MouseEvent) => {
      if (resetBtnRef.current && resetBtnRef.current.contains(e.target as Node | null)) return
      disarm()
    }
    const t = setTimeout(() => document.addEventListener('click', h), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', h)
    }
  }, [resetArmed])
  // Leaving the mode disarms (visible-only by design; disarm closes over only refs + stable setters).
  useEffect(() => {
    if (!visible && armedRef.current) disarm()
  }, [visible])
  return { resetArmed, onResetTap, resetBtnRef }
}
// Run fn() whenever any value in `deps` changes — skipping the initial mount. The generic
// "react to a settings/toggle change" effect the modes use to regen an unanswered live date
// (the engine's regenDate no-ops on a burned/browsed date). fn is read through a ref so the
// latest closure runs without having to list it (or the engine) in the dependency array.
export function useChangeEffect(deps: React.DependencyList, fn: () => void) {
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }) // keep the latest fn (post-commit), not during render (refs rule)
  const firstRef = useRef(true)
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    fnRef.current()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

// Like useChangeEffect, but DEFERRED to the settings-popover CLOSE: snapshots `deps` when the popover
// OPENS and runs fn ONCE on close IFF they changed (a change-then-revert is a no-op). The ⚙ settings
// only change while the popover is open, so this batches their side-effects — a date regen, a run/
// round reset — to a single apply on close instead of one per keystroke, and never resets the solve
// timer mid-adjustment. fn runs through a ref so the latest closure (current run/round state) fires.
// (Mode-LOCAL toggles that change outside the popover must keep useChangeEffect — they'd never see an
// open→close transition coincide with their change.)
// Both effects are LAYOUT effects (Q9, must move together): the close-fired reset/regen has to commit
// in the SAME paint as the popover close — as passive effects they ran a frame later, so the closing
// popover uncovered the still-green grid for one frame before the reset landed. Same-kind effects run
// in declaration order, so the fnRef updater stays ahead of the close-watcher below.
export function useSettingsCloseEffect(
  settingsOpen: boolean,
  deps: React.DependencyList,
  fn: () => void,
) {
  const fnRef = useRef(fn)
  useLayoutEffect(() => {
    fnRef.current = fn
  })
  const snapRef = useRef(deps)
  const wasOpenRef = useRef(settingsOpen)
  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = settingsOpen
    if (settingsOpen && !wasOpen) {
      snapRef.current = deps
      return
    } // opened → snapshot the current values
    if (!settingsOpen && wasOpen) {
      // closed → fire once iff anything changed
      const changed = deps.some((d, i) => d !== snapRef.current[i])
      snapRef.current = deps
      if (changed) fnRef.current()
    }
  }, [settingsOpen, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
}
