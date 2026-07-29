import * as React from 'react'
import { fmt, MONTH, DAY, numericFormatOf } from '../lib/format.js'
import { dim, wday, wdayJulian, isJulianDate, isGapDate } from '../lib/calendar.js'
import { MethodBreakdownSection, type CodeDate } from './MethodBreakdown.jsx'
import { SCROLL_REGION_CLASS, scrollFadeClass, useScrollEdgeState } from './scrollRegion.js'
import type { FormatId } from '../lib/format.js'
// The history entry's persisted shape lives with the store that versions and migrates it
// (store/progress) — it is {id, y, m, d, isGap?} and nothing else. Everything shown on screen is
// derived from those inputs by the three helpers below, against the LIVE settings.
import type { LookupEntry } from '../store/progress.js'

interface LookupCardProps {
  history?: LookupEntry[]
  onAddHistory?: (entry: LookupEntry) => void
  onMoveHistory?: (id: string) => void
  onClearHistory?: () => void
  inputValue?: string
  onInputChange?: (value: string) => void
  outputValue?: string
  onOutputChange?: (value: string) => void
  calcDate?: CodeDate | null
  onCalcDateChange?: (date: CodeDate | null) => void
  selectedHistoryId?: string | null
  onSelectedHistoryIdChange?: (id: string | null) => void
  calcOpen?: boolean
  onCalcOpenChange?: (open: boolean) => void
  fmtDate?: (y: number, m: number, d: number) => string
  dateFormat?: FormatId
  useJulian?: boolean
}

// Unique id for a new history entry. At module scope it's outside React's render-purity rule
// (Date.now()/Math.random() are impure) — and it only ever runs from the Lookup event handler.
// Single source of truth: was previously duplicated inline at both add sites.
function makeEntryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
// Stable empty-array fallback (module scope) so `entries` keeps a constant identity when
// history isn't an array — a fresh [] each render would change the memos/effects that read it.
const NO_ENTRIES: LookupEntry[] = []

// The standing prompt in the result slot before anything has been looked up. RENDER-TIME ONLY —
// it must never be written into the lookupOutput state, which App reads as "" to decide the Full
// Reset button is dimmed/locked (isFullyReset); storing the hint would silently unlock it.
const LOOKUP_HINT = 'Enter a date to see its weekday.'
// The Oct 5–14, 1582 answer, deliberately SHORT: the result slot is two lines tall and the full
// story (why ten days vanished when the Gregorian calendar was adopted) is already told in the
// How-to-Play guide's Julian Calendar section — one canonical copy, not two.
const GAP_MSG = 'October 5–14, 1582 never existed — 10 days skipped in the Gregorian switch.'

// ── Derived-from-the-entry helpers ──────────────────────────────────────────────────────────
// A history entry stores INPUTS only ({id, y, m, d, isGap?}); its label, weekday and result
// sentence are computed here, at paint time, from the live Date Format / Julian settings. That is
// what makes a format change re-render the whole card consistently — the result line above and
// every row below move together, because there is only one source of truth for all of them.

// The formatted date, exactly as the history row and the result sentence both show it.
const entryLabel = (e: LookupEntry, fmtDate?: (y: number, m: number, d: number) => string) =>
  fmtDate ? fmtDate(e.y, e.m, e.d) : `${MONTH[e.m - 1]} ${e.d}, ${e.y}`

// The weekday name. Gap entries have none; for a Julian-eligible date the answer depends on the
// user's Julian Calendar setting, which is why it can't be frozen at lookup time.
const entryWeekday = (e: LookupEntry, useJulian: boolean) => {
  if (e.isGap) return 'Does Not Exist'
  const julian = useJulian && isJulianDate(e.y, e.m, e.d)
  return DAY[julian ? wdayJulian(e.y, e.m, e.d) : wday(e.y, e.m, e.d)]
}

// The full sentence shown in the result slot. Julian-eligible dates name the calendar they were
// read under, so the answer is never ambiguous across a settings change.
const entryResult = (
  e: LookupEntry,
  fmtDate: ((y: number, m: number, d: number) => string) | undefined,
  useJulian: boolean,
) => {
  if (e.isGap) return GAP_MSG
  const sentence = `${entryLabel(e, fmtDate)} is a ${entryWeekday(e, useJulian)}`
  return isJulianDate(e.y, e.m, e.d)
    ? `${sentence} (${useJulian ? 'Julian' : 'Gregorian'}).`
    : `${sentence}.`
}

// LookupCard — the Lookup-mode card: a numeric date input (format follows the
// active dateFormat), a two-line result slot, a history list that scrolls once it
// runs out of screen (with edge-fade indicators), and the shared Show Codes panel.
// All state is lifted to the parent and passed via props/callbacks, so this
// component is presentational + input-parsing only, and it OWNS no rendered text:
// labels, weekdays and result sentences are all derived from the stored {y,m,d}
// against the live settings. Recognizes the Oct 5–14, 1582 gap ("Does Not Exist").
//
// Extracted from main.jsx in Stage C, Step 4f (verbatim). Uses module-level
// helpers now imported from lib/* (isLeap/dim/wday/numericFormatOf etc.) — no
// local duplicates.
export default function LookupCard({
  history = [],
  onAddHistory,
  onMoveHistory,
  onClearHistory,
  inputValue = '',
  onInputChange,
  outputValue = '',
  onOutputChange,
  calcDate,
  onCalcDateChange,
  selectedHistoryId,
  onSelectedHistoryIdChange,
  calcOpen = false,
  onCalcOpenChange,
  fmtDate,
  dateFormat = 'written-mdy',
  useJulian = false,
}: LookupCardProps) {
  const li = typeof inputValue === 'string' ? inputValue : String(inputValue ?? '')
  const sli = typeof onInputChange === 'function' ? onInputChange : () => {}
  const lo = typeof outputValue === 'string' ? outputValue : String(outputValue ?? '')
  const slo = typeof onOutputChange === 'function' ? onOutputChange : () => {}
  const cdv = calcDate ?? null
  const scd = typeof onCalcDateChange === 'function' ? onCalcDateChange : () => {}
  const sid = selectedHistoryId ?? null
  const ssid =
    typeof onSelectedHistoryIdChange === 'function' ? onSelectedHistoryIdChange : () => {}
  const cov = !!calcOpen
  // Lookup history scroll-state — the shared useScrollEdgeState (components/scrollRegion,
  // the settings-recipe edge listener). This region has BOTH boundary surfaces, one per edge,
  // and hands the hook a ref to each: the History header above the list and the Show Codes
  // section below it. Their shadows are continuous (--shade, round 10 item B) — the hook writes
  // each element's strength from the list's distance to that edge — so neither is derived from a
  // flag at the JSX any more. The two returned flags now drive ONE thing each:
  //   lookupHistoryScrolledFromTop → the list's top fade mask
  //   lookupHistoryAtBottom        → the list's bottom fade mask
  // `history` stands in as the hook's active key: the <ul> only exists with entries, so a
  // history change re-attaches the listener to a freshly (re)mounted list; the hook's
  // ResizeObserver covers the list being resized under the user — which now happens on every
  // screen-size change too, since the list's height is measured rather than capped.
  const lookupHistoryRef = React.useRef<HTMLUListElement>(null)
  const historyHeaderRef = React.useRef<HTMLDivElement>(null)
  const methodSectionRef = React.useRef<HTMLDivElement>(null)
  const { scrolledFromTop: lookupHistoryScrolledFromTop, atBottom: lookupHistoryAtBottom } =
    useScrollEdgeState(lookupHistoryRef, history, historyHeaderRef, methodSectionRef)
  // Codes-open is purely global state — it stays as-is when the user clicks through
  // history entries, only changing on (1) a manual toggle, (2) a brand-new lookup
  // via runLookup, or (3) MethodBreakdownSection's auto-close when the displayed
  // date becomes null (e.g., clicking a "Does Not Exist" gap entry). Earlier per-entry
  // tracking via calcOpenByEntry was removed because it made codes auto-close on
  // every history click that landed on an entry whose codes had never been opened.
  const sco =
    typeof onCalcOpenChange === 'function'
      ? (next: boolean) => onCalcOpenChange?.(!!next)
      : () => {}
  const lookupInputRef = React.useRef<HTMLInputElement>(null)
  // LookupCard uses module-level isLeap/dim/wday/numericFormatOf — no local duplicates.
  // Map any selected dateFormat to its corresponding Numeric format for input parsing.
  const numericFmtForInput = numericFormatOf(dateFormat)
  // Pattern + example based on which numeric format applies.
  const inputMeta = (() => {
    if (numericFmtForInput === 'numeric-mdy')
      return { label: 'm/d/y', example: '3/14/1592', sep: '/', orderType: 'mdy' }
    if (numericFmtForInput === 'numeric-dmy')
      return { label: 'd.m.y', example: '14.3.1592', sep: '.', orderType: 'dmy' }
    return { label: 'y-m-d', example: '1592-3-14', sep: '-', orderType: 'ymd' }
  })()
  // `entries` is `history` (stable per parent render) or the stable NO_ENTRIES const — never a
  // fresh [] — so the memos/effects that read it don't churn. Declared here, above the first
  // effect that reads it, rather than beside its heaviest consumer further down.
  const entries = Array.isArray(history) ? history : NO_ENTRIES
  // A Date Format change RE-FORMATS the card; it does not reset it. The selection survives,
  // because every string on screen — the answer line and every history row alike — is derived
  // from the stored {y,m,d} against the live format, so they all re-render in the new format
  // together. (That is the contract the How-to-Play guide and the changelog both state out loud;
  // clearing the selection here used to break it by making the answer line VANISH on a format
  // change rather than update.) The input is the one thing that has to be rewritten, since it is
  // always NUMERIC and its separator and field order just changed. With nothing selected there is
  // no date to rewrite, so the box is cleared instead — half-typed text in the old format would
  // no longer parse — along with any error message, which names the old format and is now wrong.
  // A ref, not a dep, so the initial mount doesn't wipe an input the user arrived with.
  const prevFormatRef = React.useRef(dateFormat)
  React.useEffect(() => {
    if (prevFormatRef.current === dateFormat) return
    prevFormatRef.current = dateFormat
    const selected = entries.find((e) => e.id === sid)
    if (selected) {
      sli(fmt(selected.y, selected.m, selected.d, numericFmtForInput))
      return
    }
    sli('')
    slo('')
    // Fire on dateFormat change only (the prevFormatRef guard also skips the initial mount). The
    // setters are re-created each render; excluding them keeps this from running every render,
    // and `entries`/`sid` are read at fire time on purpose — they are inputs to the rewrite, not
    // triggers for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFormat])
  function runLookup() {
    const s = li.trim()
    // Build regex based on the input format. Year accepts 1–5 digits, month/day 1–2 digits.
    const sepEsc = inputMeta.sep === '.' ? '\\.' : inputMeta.sep === '-' ? '-' : '/'
    let match: RegExpExecArray | null
    if (inputMeta.orderType === 'ymd')
      match = new RegExp(`^(\\d{1,5})${sepEsc}(\\d{1,2})${sepEsc}(\\d{1,2})$`).exec(s)
    else match = new RegExp(`^(\\d{1,2})${sepEsc}(\\d{1,2})${sepEsc}(\\d{1,5})$`).exec(s)
    if (!match) {
      ssid(null)
      slo(`Enter date as ${inputMeta.label}, e.g. ${inputMeta.example}`)
      lookupInputRef.current?.focus()
      return
    }
    let mm: number, dd: number, yy: number
    if (inputMeta.orderType === 'ymd') {
      yy = +match[1]
      mm = +match[2]
      dd = +match[3]
    } else if (inputMeta.orderType === 'mdy') {
      mm = +match[1]
      dd = +match[2]
      yy = +match[3]
    } else {
      dd = +match[1]
      mm = +match[2]
      yy = +match[3]
    }
    if (yy < 1 || yy > 10000) {
      ssid(null)
      slo('Year must be between 1 and 10000')
      lookupInputRef.current?.focus()
      return
    }
    if (mm < 1 || mm > 12) {
      ssid(null)
      slo('Month must be 1–12')
      lookupInputRef.current?.focus()
      return
    }
    // Every SUCCESSFUL path below clears lookupOutput and selects the entry instead: the sentence
    // on screen is derived from the selection (see displayNote), so lookupOutput is now purely the
    // transient "couldn't answer" message — leaving a stale error behind it would be dead state.
    const existing = entries.find((e) => e.y === yy && e.m === mm && e.d === dd)
    if (existing) {
      if (onMoveHistory) onMoveHistory(existing.id)
      slo('')
      ssid(existing.id)
      if (existing.isGap) {
        scd(null)
        sco(false)
      } else scd({ y: yy, m: mm, d: dd })
      lookupInputRef.current?.blur()
      return
    }
    if (isGapDate(yy, mm, dd)) {
      const entry = { id: makeEntryId(), y: yy, m: mm, d: dd, isGap: true }
      slo('')
      scd(null)
      ssid(entry.id)
      sco(false)
      if (onAddHistory) onAddHistory(entry)
      lookupInputRef.current?.blur()
      return
    }
    const julian = useJulian && isJulianDate(yy, mm, dd)
    const maxd = dim(yy, mm, julian)
    if (dd < 1 || dd > maxd) {
      ssid(null)
      slo(`Day must be 1–${maxd} for ${MONTH[mm - 1]}`)
      lookupInputRef.current?.focus()
      return
    }
    const entry = { id: makeEntryId(), y: yy, m: mm, d: dd }
    slo('')
    scd({ y: yy, m: mm, d: dd })
    ssid(entry.id)
    sco(false)
    if (onAddHistory) onAddHistory(entry)
    lookupInputRef.current?.blur()
  }
  function clearLookup() {
    sli('')
    slo('')
    scd(null)
    ssid(null)
    sco(false)
  }
  React.useEffect(() => {
    if (!sid) return
    if (!entries.some((e) => e.id === sid)) {
      ssid(null)
      scd(null)
      slo('')
      sco(false)
    }
    // Orphaned-selection cleanup: fire on [entries, sid] only. The setters are prop-callback
    // wrappers re-created each render; listing them would re-run this every render to no effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, sid])
  // Selecting a history entry never changes calcOpen directly. For non-gap entries,
  // codes-open simply stays as-is. For gap entries (Does Not Exist), calcDate becomes
  // null, which triggers MethodBreakdownSection's hasDate auto-close effect.
  // Selecting any history entry (by tap, click, or Enter via keyboard nav) populates the input
  // with that date — convenient for re-running a lookup or editing it. The input is always
  // numeric (per the input's contract; the displayed history label may be written), so
  // populate using the numeric form of the selected dateFormat regardless of how the
  // history row reads. The result sentence follows from the selection itself (displayNote), so
  // this only has to clear any error message the selection replaces.
  const selEntry = (entry: LookupEntry) => {
    if (!entry) return
    ssid(entry.id)
    slo('')
    if (entry.isGap) {
      scd(null)
    } else {
      scd({ y: entry.y, m: entry.m, d: entry.d })
    }
    sli(fmt(entry.y, entry.m, entry.d, numericFmtForInput))
    if (document.activeElement) (document.activeElement as HTMLElement).blur()
  }
  const clearHist = () => {
    if (onClearHistory) onClearHistory()
    ssid(null)
    scd(null)
    slo('')
    sco(false)
  }
  // The result line: the selected entry's sentence, derived fresh, else the live output (which is
  // now only ever an error message or ""). One rule, no Julian special case — entryResult covers
  // it. fmtDate closes over dateFormat and is re-created when it changes, so it alone is the
  // correct dependency; listing dateFormat too would be redundant.
  const displayNote = React.useMemo(() => {
    const selectedEntry = entries.find((e) => e.id === sid)
    return selectedEntry ? entryResult(selectedEntry, fmtDate, useJulian) : lo
  }, [sid, entries, useJulian, fmtDate, lo])
  // Keyboard navigation for the Lookup card when no input has focus:
  //   ArrowDown/ArrowUp — move highlighted history entry; selecting populates input.
  //   Backspace/Delete  — clear the Lookup input box (matches the Clear button).
  // When an input IS focused, all keys pass through unchanged so typing & native cursor
  // handling (including ↑/↓ jumping cursor to start/end on single-line inputs) work normally.
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      const inInput =
        ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
      if (inInput) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (entries.length === 0) return
        e.preventDefault()
        const idx = entries.findIndex((x) => x.id === sid)
        const next =
          e.key === 'ArrowDown'
            ? Math.min(entries.length - 1, (idx < 0 ? -1 : idx) + 1)
            : Math.max(0, (idx < 0 ? entries.length : idx) - 1)
        selEntry(entries[next])
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        // Clear the Lookup input box (matching what the Clear button does), NOT the history.
        // Only fires when the input doesn't have focus — when it does, Backspace/Delete edit
        // the input character-by-character as normal.
        // The guard asks "is there anything for Clear to undo?" — and since the answer sentence
        // now comes from the SELECTION rather than from lookupOutput, `sid` is part of that
        // question (lookupOutput holds an error message or nothing at all).
        if (!li && !lo && !cdv && !sid) return
        e.preventDefault()
        clearLookup()
        return
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
    // Re-subscribe when the navigable list / selection / input change. clearLookup and selEntry
    // are body functions re-created each render but behavior-stable; excluding them avoids
    // re-subscribing the keydown listener on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, sid, li, lo, cdv])
  return (
    // The Lookup screen is a FIT-TO-SCREEN column, not a growing page: this root fills the height
    // its wrapper was given (main.tsx), the top card keeps its natural size, and the history panel
    // absorbs whatever is left — so the list scrolls INSIDE the panel and the page itself never
    // does. (space-y-4 → gap-4 because the root is a flex column now; and the old mt-1 is gone —
    // it used to margin-collapse into the wrapper's mt-5 and would have become a real 4px gap the
    // moment that wrapper turned into a flex container.)
    <div className="flex flex-col gap-4 flex-auto min-h-0">
      <div className="rounded-2xl panel p-4 space-y-4 shrink-0">
        <div className="flex flex-wrap items-stretch gap-2">
          {/* The date input wears the site-wide interactive-border rule (Q7 round-7): inputs are
              controls you act on, so it carries border surface-tray — the sbtn-bd tier its
              Lookup/Clear button neighbors share — never the container .panel it once borrowed
              (geometry unchanged: .panel's own 1px border became the explicit border token).
              text-base is DELIBERATE and states the tier out loud: this is the page's primary
              text-entry field, a size up from the compact text-sm steppers elsewhere, and it kept
              that size only by inheriting the root font. Same rendered size as before (1rem /
              line-height 1.5 is exactly what it inherited) — now it can't drift by accident.
              appearance-none (Q4 round-8) is the same kind of statement for behaviour: the box
              declares its own border, background and radius, so appearance:auto would be a false
              declaration that also leaves iOS's native inner shadow and focus treatment live. */}
          <input
            ref={lookupInputRef}
            value={li}
            onChange={(e) => sli(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runLookup()
              }
            }}
            placeholder={`e.g., ${inputMeta.example}`}
            className="appearance-none border surface-tray rounded-xl px-3 py-2 text-base focus:outline-hidden focus-ring flex-1 min-w-0"
          />
          <button
            type="button"
            onClick={runLookup}
            onMouseDown={(e) => e.preventDefault()}
            className="px-4 py-2 rounded-xl btn-solid text-sm font-medium"
          >
            Lookup
          </button>
          {/* Clear is the row's NEUTRAL solid, deliberately not the brand fill Lookup wears. The
              grey now comes from --nbtn-bg (Q4 round-8, index.css) instead of a raw zinc utility,
              so a theme can reach it; text-white stays because this fill is a raw colour, not one
              of the theme-aware surfaces that set their own text colour. (Naming the retired
              utility in prose would re-emit its dead rule — the v4 scanner reads comments too.) */}
          <button
            type="button"
            onClick={clearLookup}
            onMouseDown={(e) => e.preventDefault()}
            className="px-4 py-2 rounded-xl bg-(--nbtn-bg) text-white text-sm font-medium"
          >
            Clear
          </button>
        </div>
        {/* The result slot is ALWAYS rendered, at a constant two-line height, so the card below it
            never jumps. Two lines is the exact ceiling of every string that can land here: the
            1582 gap message is two, the "(Gregorian)" answer variant is one line on a 430px screen
            and two on a 393px one, and every error and ordinary answer is one. A one-line reserve
            would still jump ~21px on the tall cases. min-h-10 (2.5rem) is two text-sm line boxes
            and, being a standard scale utility, tracks the fluid root font instead of freezing a
            pixel height. Top-aligned on purpose — centering would shift the first line as the
            second appears. Empty state shows the hint, in the dimmer text tone. */}
        <div
          className={`text-sm min-h-10 ${displayNote ? 'text-(--tx-100-90)' : 'text-(--tx-200-70)'}`}
        >
          {displayNote || LOOKUP_HINT}
        </div>
        <p className="text-xs text-(--tx-100-90)">
          Format: <b>{inputMeta.label}</b>
          <br />
          AD dates only, 1–10000
        </p>
      </div>
      {/* The history panel takes its natural height and SHRINKS to fit when the column runs out
          of room (min-h-0 lets it; the <ul> inside absorbs the shrink and scrolls) — it does not
          grow, so with one entry the card still hugs its content instead of stretching to the
          bottom of the screen. space-y-4 → gap-4 now that it's a flex column. */}
      <div className="rounded-2xl panel py-4 gap-4 flex flex-col min-h-0">
        {/* History panel on the shared scroll-region recipe (Q5 round-7,
            components/scrollRegion): the panel owns py-4 only, and every child carries its
            own px-4 — for the scrolling <ul> below that puts the 1rem right padding INSIDE
            the scroller, the text-free lane the iOS scrollbar paints in. Content widths are
            unchanged; the pre-Q5 p-4 parent plus -mx-4 counter-margins on the header and
            method section produced the same geometry with the lane OUTSIDE the scroller. */}
        {/* History header: with the panel padding vertical-only, the header's own px-4 spans
            the full panel width, so its divider line cuts edge-to-edge on its own.
            elev-shadow-down + the divider line together signal "fixed header above content
            scrolling below" — same pattern as the popover sticky footer's elev-shadow-up. The
            class is UNCONDITIONAL: strength comes from the --shade the edge hook writes onto
            this element, so there is no toggle and no transition (round 10 item B). The
            lookup-history-header class survives as the stable name for this boundary surface —
            it is what the tests select — and no longer as a CSS transition hook. */}
        <div
          ref={historyHeaderRef}
          className="lookup-history-header elev-shadow-down shrink-0 px-4 pb-3 border-b border-(--bd-500-40) flex items-center justify-between text-[11px] uppercase tracking-wide text-(--tx-200-70)"
        >
          <span>History</span>
          {entries.length > 0 && (
            <button type="button" onClick={clearHist} className="text-(--tx-200-70) font-medium">
              Clear History
            </button>
          )}
        </div>
        {/* The list is the part that gives: it takes the room the header and the method section
            below it don't need, and scrolls past that. It used to carry a fixed 440-pixel
            max-height — one number, too tall on a small phone and leaving screen unused on a big
            one, and the fluid-root font system had no way to scale it. Measured layout replaces
            it; tests/heightGuard.test.js keeps pixel heights from creeping back. */}
        {entries.length > 0 ? (
          <ul
            ref={lookupHistoryRef}
            className={`${SCROLL_REGION_CLASS} space-y-2 flex-auto min-h-0 ${scrollFadeClass(lookupHistoryScrolledFromTop, lookupHistoryAtBottom)}`}
          >
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => selEntry(e)}
                  className={`w-full text-left px-3 py-2 rounded-xl panel flex items-center justify-between gap-3 text-xs transition ${sid === e.id ? 'border-l-2 border-l-(--acc) bg-(--hist-sel)' : 'hist-unsel hover:bg-(--hist-hov)'}`}
                >
                  <span className="block text-[13px] font-medium text-(--tx-100-90)">
                    {entryLabel(e, fmtDate)}
                  </span>
                  <span className="text-[12px] font-semibold text-(--tx-200-80)">
                    {entryWeekday(e, useJulian)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 text-sm text-(--tx-200-70)">No lookups yet</p>
        )}
        {/* MethodBreakdownSection wrapper: its px-4 spans the vertical-only-padded panel
            full-width, so the existing border-t divider cuts edge-to-edge on its own.
            elev-shadow-up signals "fixed footer below content scrolling above" — unconditional
            like the header's, and driven by the same hook writing --shade onto this element
            through the ref below. lookup-method-section is the boundary surface's stable name
            (the tests select it), no longer a transition hook. */}
        <MethodBreakdownSection
          ref={methodSectionRef}
          date={cdv}
          className="lookup-method-section elev-shadow-up shrink-0 px-4 pt-4 border-t border-(--bd-500-40)"
          contentClassName="mt-3 rounded-2xl panel px-4 pt-[3px] pb-1.5"
          open={cov}
          onOpenChange={sco}
          useJulian={useJulian}
          displayedFormat={dateFormat}
        />
      </div>
    </div>
  )
}
