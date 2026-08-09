import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

// components/useYearRangeMirrors.ts — the ⚙ panel's two Year Range TEXT BOXES, as state.
//
// The boxes are not the setting. minY/maxY in the settings store are the setting; these are
// transient string mirrors that deliberately DISAGREE with the store between a keystroke and its
// commit, so that a half-typed "19" is not read as the year 19. The two strings, the two commits
// and the two store→text sync effects are one unit, and this module is that unit.
//
// ★ WHY IT IS CALLED BY App AND NOT BY THE PANEL, even though the only markup that reads it is the
// panel's. The panel is conditionally rendered: it unmounts on close and remounts on open. State it
// owned would be re-initialised from the store on every open — and today a half-typed year SURVIVES
// closing and reopening the panel, which is pinned behaviour (tests/settingsPanel.yearRange.dom,
// "PINS TODAY: a half-typed year survives closing and reopening the panel"). Owning the pair up in
// App is what keeps that true.
//
// ★ WHY THE TWO REFS ARE PARAMETERS RATHER THAN PART OF THE RETURN. They are the same shape as
// settingsPopoverRef: created by App, attached by the panel, read by App-side code — here the two
// focus guards below, which are the ONLY readers and which live in this file, so the ref is never
// split from its reader. Returning them instead is what the first draft did, and the React
// Compiler's react-hooks/refs rule rejected it at the CALL site: once a ref flows out of a hook
// inside an object, the compiler treats that whole object as a ref, so `yearRange.min.value` reads
// as a ref access during render. That is the rule working correctly — a hook handing back a
// structure it cannot prove is render-safe — so the fix is the shape, not a suppression.
//
// ★ DO NOT HAND-MEMOISE THE RETURN. A plain object literal built fresh on every call looks like it
// would churn identity and defeat the compiled panel's memo cache — it does not. This hook IS
// compiled (verified in the shipped bundle, round 14: it opens `let o = _c(34)` and the tail reads
// `o[31] !== w || o[32] !== T ? (D = {min: w, max: T, resetTo: E}) : D = o[33]`, with commitMin /
// commitMax cached on their real inputs and resetTo pinned to a memo_cache_sentinel). The compiler
// already does exactly what a useCallback/useMemo pass would, and it does it without the deps
// arrays that would then need hand-maintenance. Adding them here would be duplicated, less
// accurate work — and it is what re-opened the refs-rule problem above the first time.
export type YearMirror = {
  /** The live text in the box — NOT the committed year. */
  value: string
  setValue: (v: string) => void
  /** Parse, clamp against the OTHER field's committed value, write the store, normalise the text. */
  commit: () => void
}

export type YearRangeMirrors = {
  min: YearMirror
  max: YearMirror
  /**
   * Force both boxes to show the given years. Reset Settings' delegate — and it must stay
   * UNCONDITIONAL: the sync effects below fire only when minY/maxY actually CHANGE, so a Reset
   * while the committed range is already at its default would leave dirty text in the boxes if this
   * relied on them instead.
   */
  resetTo: (minY: number, maxY: number) => void
}

export function useYearRangeMirrors(
  minY: number,
  maxY: number,
  setMinY: (v: number) => void,
  setMaxY: (v: number) => void,
  minInputRef: RefObject<HTMLInputElement | null>,
  maxInputRef: RefObject<HTMLInputElement | null>,
): YearRangeMirrors {
  // Initialised to the FACTORY literals rather than to the persisted store, and pulled into line by
  // the effects below. (Pre-existing and deliberately preserved: nothing observes the one-commit
  // gap, because the panel starts closed and the boxes are not mounted for it.)
  const [minInputVal, setMinInputVal] = useState('1')
  const [maxInputVal, setMaxInputVal] = useState('10000')
  function applyMinValue(val: number) {
    if (val !== minY) setMinY(val)
  }
  function applyMaxValue(val: number) {
    if (val !== maxY) setMaxY(val)
  }
  const commitMin = () => {
    const p = parseInt(minInputVal)
    if (isNaN(p)) {
      setMinInputVal(String(minY))
      return
    }
    const v = Math.max(1, Math.min(maxY, p))
    applyMinValue(v)
    setMinInputVal(String(v))
  }
  const commitMax = () => {
    const p = parseInt(maxInputVal)
    if (isNaN(p)) {
      setMaxInputVal(String(maxY))
      return
    }
    const v = Math.max(minY, Math.min(10000, p))
    applyMaxValue(v)
    setMaxInputVal(String(v))
  }
  // Store → text. FOCUS-GUARDED: a store write from anywhere else must not overwrite what the user
  // is currently typing. The guard is why these two effects and the two refs belong together.
  //
  // The ref is IN the dependency array, which it was not when these lines lived in App: there the
  // ref came from a local useRef and exhaustive-deps knew it was stable, here it arrives as a
  // parameter and cannot be assumed. Listing it is the honest fix and costs nothing — a ref object
  // keeps its identity for the life of the component, so this still re-runs on a minY change only.
  useEffect(() => {
    if (document.activeElement === minInputRef.current) return
    setMinInputVal(String(minY))
  }, [minY, minInputRef])
  useEffect(() => {
    if (document.activeElement === maxInputRef.current) return
    setMaxInputVal(String(maxY))
  }, [maxY, maxInputRef])
  return {
    min: { value: minInputVal, setValue: setMinInputVal, commit: commitMin },
    max: { value: maxInputVal, setValue: setMaxInputVal, commit: commitMax },
    resetTo: (min, max) => {
      setMinInputVal(String(min))
      setMaxInputVal(String(max))
    },
  }
}
