import * as React from 'react'
import Expander from './Expander.jsx'
import { computeMethodSummary } from '../lib/method.js'
import { CODES_CLOSE_MS } from '../lib/constants.js'
import type { FormatId } from '../lib/format.js'

// MethodExplanation + MethodBreakdownSection — the "Show Codes" panel.
//
// MethodExplanation renders the five code cells (Month / Day / ab / cd / Leap)
// plus the calendar-system line for a date, ordered to match the date format's
// reading order. When given cellDates (Deduction 1582 month cell spanning both
// calendars) it collapses each code across interpretations, slash-joining any
// that differ. MethodBreakdownSection is the Show/Hide-Codes toggle that wraps it
// in an Expander, with the freeze contract that holds the panel's inputs steady
// for CODES_CLOSE_MS while it slides shut. Shared by App, AoxMode, and LookupCard.
//
// Extracted from main.jsx in Stage C, Step 4g (verbatim).

// The minimal date a code panel reads (the question's y/m/d). Callers pass richer
// objects (full questions / puzzles); only these three fields are consumed.
export interface CodeDate {
  y: number
  m: number
  d: number
}
// The per-date code summary shape, taken from computeMethodSummary's inferred return.
type MethodSummary = NonNullable<ReturnType<typeof computeMethodSummary>>

export function MethodExplanation({
  date,
  useJulian = false,
  displayedFormat = 'written-mdy',
  cellDates = null,
}: {
  date?: CodeDate | null
  useJulian?: boolean
  displayedFormat?: FormatId
  cellDates?: CodeDate[] | null
}) {
  // Plain computation (no useMemo): computeMethodSummary is pure + cheap and only runs while
  // the codes panel is open. Letting the React Compiler own the memoization removes a manual dep
  // array that under-specified `date` (it listed date?.y/m/d, not the object the call reads).
  const summaries: MethodSummary[] =
    cellDates && cellDates.length > 0
      ? cellDates
          .map((cd) => computeMethodSummary(cd, true))
          .filter((s): s is MethodSummary => s != null)
      : date
        ? [computeMethodSummary(date, useJulian)].filter((s): s is MethodSummary => s != null)
        : []
  if (summaries.length === 0)
    return (
      <div className="text-sm text-(--tx-100-80)">Show Codes is only supported for AD dates.</div>
    )
  // Collapse-when-same: gather each code's values across all interpretations,
  // dedup via Set (preserves insertion order), and join with slashes if 2+ unique.
  const joinDedup = (vals: Array<string | number>) => {
    const s = [...new Set(vals.map((v) => String(v)))]
    return s.join('/')
  }
  const monthCode = joinDedup(summaries.map((s) => s.monthCode))
  const dayCode = joinDedup(summaries.map((s) => s.dayCode))
  const abCode = joinDedup(summaries.map((s) => s.abCode))
  const cdCode = joinDedup(summaries.map((s) => s.cdCode))
  const leapValue = joinDedup(summaries.map((s) => String(s.leapCode)))
  const calendarText = joinDedup(summaries.map((s) => s.calendarSystem)) + ' Calendar'
  const codeMap: Record<string, { label: string; italic: boolean; value: string }> = {
    Month: { label: 'Month', italic: false, value: monthCode },
    Day: { label: 'Day', italic: false, value: dayCode },
    ab: { label: 'ab', italic: true, value: abCode },
    cd: { label: 'cd', italic: true, value: cdCode },
    Leap: { label: 'Leap', italic: false, value: leapValue },
  }
  // Order the codes left-to-right matching the date format's reading order.
  // After both year and month appear, Leap is placed.
  const fmt = displayedFormat || 'written-mdy'
  let order: string[]
  if (fmt === 'numeric-ymd') order = ['ab', 'cd', 'Month', 'Leap', 'Day']
  else if (fmt === 'written-dmy' || fmt === 'numeric-dmy')
    order = ['Day', 'Month', 'ab', 'cd', 'Leap']
  else order = ['Month', 'Day', 'ab', 'cd', 'Leap'] // written-mdy, numeric-mdy, fallback
  const codes = order.map((k) => codeMap[k])
  return (
    <div>
      <div className="grid grid-cols-5 gap-2 text-center text-sm">
        {codes.map((c, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="text-[11px] text-(--tx-200-80)">
              {c.italic ? <i>{c.label}</i> : c.label}
            </div>
            <div className="font-semibold tabular-nums text-(--tx-50)">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-[11px] text-(--tx-300-60)">{calendarText}</div>
    </div>
  )
}

export function MethodBreakdownSection({
  date,
  open: controlledOpen,
  onOpenChange,
  className,
  contentClassName,
  useJulian = false,
  displayedFormat = 'written-mdy',
  cellDates = null,
}: {
  date?: CodeDate | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  contentClassName?: string
  useJulian?: boolean
  displayedFormat?: FormatId
  cellDates?: CodeDate[] | null
}) {
  const isControlled = typeof controlledOpen === 'boolean' && typeof onOpenChange === 'function'
  const [internalOpen, setInternalOpen] = React.useState(false)
  // Frozen values for the codes panel — kept in lockstep so MethodExplanation sees a
  // self-consistent snapshot during the close animation (no prop leaks during the 310ms
  // CODES_CLOSE_MS window).
  const [frozenDate, setFrozenDate] = React.useState(date)
  const [frozenDisplayedFormat, setFrozenDisplayedFormat] = React.useState(displayedFormat)
  const [frozenCellDates, setFrozenCellDates] = React.useState(cellDates)
  const [frozenUseJulian, setFrozenUseJulian] = React.useState(useJulian)
  // Latest-value refs so the close-timeout reads the freshest values when it fires after
  // CODES_CLOSE_MS. Synced in a post-commit effect (no dep array = every commit) rather than
  // during render — the compiler's refs rule forbids writing refs in render, and the timeout
  // always fires long after a commit, so post-commit freshness is exactly what it needs.
  const latestDateRef = React.useRef(date)
  const latestDisplayedFormatRef = React.useRef(displayedFormat)
  const latestCellDatesRef = React.useRef(cellDates)
  const latestUseJulianRef = React.useRef(useJulian)
  React.useEffect(() => {
    latestDateRef.current = date
    latestDisplayedFormatRef.current = displayedFormat
    latestCellDatesRef.current = cellDates
    latestUseJulianRef.current = useJulian
  })
  const wasOpenRef = React.useRef(isControlled ? !!controlledOpen : false)
  // closingRef is true between the moment the panel begins closing and the moment the
  // CODES_CLOSE_MS timer fires. While true, dep changes (e.g. user clicks Forward within
  // 310ms of Hide Codes) re-arm the timer rather than falling into the else branch, which
  // would otherwise snap frozen values to the live ones mid-animation — visible as the
  // panel's contents changing while the panel is still sliding shut.
  const closingRef = React.useRef(false)
  const key = date ? `${date.y}-${date.m}-${date.d}` : ''
  React.useEffect(() => {
    // Auto-close the uncontrolled panel on a date change — a reaction to a prop change with no
    // render-time equivalent that preserves the exact close timing the tests lock in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isControlled) setInternalOpen(false)
  }, [key, isControlled])
  const hasDate = !!date
  React.useEffect(() => {
    if (hasDate) return
    // Date removed: close the panel. Controlled → notify the parent (a side effect that must
    // live in an effect); uncontrolled → reset our own open state.
    if (isControlled) {
      if (controlledOpen) onOpenChange?.(false)
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInternalOpen(false)
    }
  }, [hasDate, isControlled, controlledOpen, onOpenChange])
  const open = hasDate ? (isControlled ? !!controlledOpen : internalOpen) : false
  const toggle = () => {
    if (!hasDate) return
    if (isControlled) onOpenChange?.(!open)
    else setInternalOpen((v) => !v)
  }
  // Content-derived key for cellDates so identity-unstable inline-built arrays in the
  // Deduction parent don't fire this effect on every parent render.
  const cellDatesKey = cellDates ? cellDates.map((c) => `${c.y}-${c.m}-${c.d}`).join('|') : ''
  // === Freeze contract ===
  // While the codes panel is open, all four inputs to MethodExplanation (date,
  // displayedFormat, cellDates, useJulian) track their live values. When the panel
  // transitions from open→closed, all four are HELD at their current values for
  // CODES_CLOSE_MS (covers the Expander's default 280ms close animation + buffer —
  // this panel never opts into Q8's per-toggle durationMs, so the default is its
  // exact close time), then released to the latest values after the close completes.
  // Callers that mutate any of the four inputs MUST batch setCalcOpen(false) into
  // the same React update; otherwise this effect fires once with (open=true,
  // newInputs) and updates the frozen values immediately, defeating the freeze.
  // Mutators that honor this contract: pushAndNext, goBack, goForward,
  // runDeductionRound, sctn, the dedType useEffect, handleResetStats, the blitz
  // config-change effect.
  /* The freeze effect below is a genuine timer mechanism: it mirrors frozen←live while the panel
     is open and, on close, HOLDS the frozen snapshot for CODES_CLOSE_MS before releasing it to the
     latest values. The synchronous setState (mirror-while-open / immediate-when-not-animating) has
     no render-time equivalent for a *timed* state release, and the deps intentionally use
     cellDatesKey (a content-stable proxy) instead of the identity-unstable cellDates array. */
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  React.useEffect(() => {
    if (!date) return
    if (open) {
      wasOpenRef.current = true
      closingRef.current = false
      setFrozenDate(date)
      setFrozenDisplayedFormat(displayedFormat)
      setFrozenCellDates(cellDates)
      setFrozenUseJulian(useJulian)
      return
    }
    if (wasOpenRef.current || closingRef.current) {
      wasOpenRef.current = false
      closingRef.current = true
      const t = setTimeout(() => {
        closingRef.current = false
        setFrozenDate(latestDateRef.current)
        setFrozenDisplayedFormat(latestDisplayedFormatRef.current)
        setFrozenCellDates(latestCellDatesRef.current)
        setFrozenUseJulian(latestUseJulianRef.current)
      }, CODES_CLOSE_MS)
      return () => clearTimeout(t)
    } else {
      setFrozenDate(date)
      setFrozenDisplayedFormat(displayedFormat)
      setFrozenCellDates(cellDates)
      setFrozenUseJulian(useJulian)
    }
  }, [open, date, displayedFormat, useJulian, cellDatesKey])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  return (
    <div className={className ?? 'mt-5'}>
      <button
        type="button"
        data-key="C"
        onClick={toggle}
        className={`w-full px-4 py-2 rounded-xl btn-solid text-sm font-medium ${!hasDate ? ' opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
        aria-disabled={!hasDate}
      >
        {open ? 'Hide Codes' : 'Show Codes'}
      </button>
      <Expander open={open && hasDate}>
        <div className={contentClassName ?? 'mt-3 rounded-2xl panel p-4 pb-1'}>
          <MethodExplanation
            date={frozenDate}
            useJulian={frozenUseJulian}
            displayedFormat={frozenDisplayedFormat}
            cellDates={frozenCellDates}
          />
        </div>
      </Expander>
    </div>
  )
}
