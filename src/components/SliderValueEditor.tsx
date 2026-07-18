import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { commitSliderText } from '../lib/sliderValue.js'

// SliderValueEditor — the tap-to-type value readout beside every timer slider (Round-2).
//
// Display mode renders the readout the sliders always had (tabular-nums text-xs, right-aligned)
// as a button; tapping it swaps in a small text input seeded with the current value
// (auto-focused + selected so typing replaces it outright). The validation trio is the
// AoX-N field's, adapted to numbers-with-units (lib/sliderValue):
//   • onChange — permissive regex only (digits, plus one '.' OR ',' when inputMode is decimal:
//     iOS/Android decimal keypads in comma-locales only offer ',', so rejecting it would silently
//     turn a typed "2,5" into "25" — commitSliderText normalizes the comma before parsing);
//   • commit on blur/Enter — parse → convert to internal units → snap to the slider's grid →
//     clamp into range; empty/junk reverts to the current value;
//   • Escape — revert WITHOUT committing, and STOP PROPAGATION: the document-level settings/popup
//     Escape handlers skip presses while a text input holds focus, but this input unmounts on the
//     revert — without the stop the same native event would bubble on and slam the panel shut on
//     what the user meant as a typing dismiss (the AoX popup field's contract).
//
// Width: both modes render in a single-cell inline-grid over an always-mounted invisible strut
// span holding `widest` — the column locks to the widest POSSIBLE readout measured in the
// device's OWN font, identical across sites and constant at runtime (Round-4's hand-measured
// w-[3.3em] was Segoe UI's 3.18em; iOS's SF Pro renders "2m 55s" wider, and the overflow wrapped
// at the space). The button adds whitespace-nowrap (nothing else forbade that wrap); the input
// takes w-full min-w-0 — min-w-0 is MANDATORY: without it the input's intrinsic min-content
// width blows the cell open past the strut.
//
// The user always types SECONDS — Flash converts ×1000 to ms via fromText; milliseconds are never
// exposed (the readout label is already seconds everywhere). `disabled` mirrors the slider's own
// condition (mid-round lock); pointer-events-none + the aria flag rather than the disabled
// attribute so the readout keeps its exact resting look (the plain span never dimmed).
export default function SliderValueEditor({
  value,
  min,
  max,
  snap,
  disabled = false,
  inputMode,
  label,
  format,
  toText,
  fromText,
  widest,
  onCommit,
}: {
  value: number // current value, internal units (ms for Flash, seconds for the Blitz timers)
  min: number // commit clamp, internal units (matches the slider's range)
  max: number
  snap: number // the typed-value snap grid, internal units (100ms / 5s / 0.5s)
  disabled?: boolean
  inputMode: 'decimal' | 'numeric'
  label: string // accessible name base, e.g. "Flash speed"
  format: (v: number) => string // display text, e.g. fmtFlashT → "2.0s"
  toText: (v: number) => string // edit seed, unit-less user text, e.g. 2000 → "2"
  fromText?: (n: number) => number // typed number → internal units (Flash: s ×1000 → ms)
  widest: string // the widest possible readout string (the shared SLIDER_READOUT_WIDEST — see the first main.tsx site), mounted as the width strut so the row never shifts
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState<string | null>(null) // null = display mode
  const inputRef = useRef<HTMLInputElement | null>(null)
  // If the slider locks mid-edit (a round starts via keyboard), drop the edit — the slider's
  // value is frozen, so a late commit would contradict the lock. Guarded render-phase reset
  // (the React "adjusting state when a prop changes" pattern): React re-renders before the
  // commit, so the input never paints a frame in the locked state.
  if (disabled && text !== null) setText(null)
  const editing = text !== null && !disabled
  // Focus + select the input the moment it mounts (select() so typing replaces the seed).
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])
  // The single-cell grid from the width note above: strut + live control overlay in one cell.
  const cell = (control: ReactNode) => (
    <span className="inline-grid shrink-0">
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 invisible whitespace-nowrap tabular-nums text-xs"
      >
        {widest}
      </span>
      {control}
    </span>
  )
  if (!editing)
    return cell(
      <button
        type="button"
        aria-label={`Edit ${label}`}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) setText(toText(value))
        }}
        className={`col-start-1 row-start-1 whitespace-nowrap tabular-nums text-xs text-right${disabled ? ' pointer-events-none' : ''}`}
      >
        {format(value)}
      </button>,
    )
  const re = inputMode === 'decimal' ? /^\d*[.,]?\d*$/ : /^\d*$/
  const commit = () => {
    const v = commitSliderText(text, { min, max, snap, fromText })
    if (v !== null) onCommit(v)
    setText(null)
  }
  return cell(
    <input
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      aria-label={`${label} (seconds)`}
      value={text}
      onChange={(e) => {
        if (re.test(e.target.value)) setText(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur() // commit runs once, in onBlur
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          setText(null) // revert; the input unmounts (no blur fires on removal)
        }
      }}
      className="col-start-1 row-start-1 w-full min-w-0 panel rounded-md px-1 text-right tabular-nums text-xs focus:outline-hidden focus-ring"
    />,
  )
}
