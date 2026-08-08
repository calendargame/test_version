// DefaultsCard — the Save/View saved-defaults popup body: a read-only view of the stored
// per-mode defaults, or an editable manager with dirty-row highlighting. Extracted verbatim from
// main.tsx (Q1 phase 1), together with NUM_INPUT_DIRTY_CLASS, which exists only for this card
// (it was deliberately defined beside it rather than with the other input tokens).
//
// ── THE HEIGHT CAP, and the measurement that earned it ───────────────────────────────────────
// This card is the tallest thing the app centres in a scrim, and until round 12 it had no cap at
// all. The app's usual defence against a short screen is the fluid root font
// (index.css: html{font-size:clamp(0.75rem, min(0.95rem + 0.4vw, 1.95vh), 1.1875rem)}) — every
// rem in here shrinks with the viewport. But that clamp bottoms out: 1.95vh reaches the 0.75rem
// floor at a viewport height of ~615px, and BELOW THAT THE CARD CANNOT GET ANY SMALLER. Measured
// in Chromium: the tallest configuration (the manager with an edit pending — the restricted-write
// note plus the Cancel/Save row) is pinned at 269.5px for every viewport shorter than that.
// The scrim is `fixed inset-0 flex items-center`, inside `#root{overflow:hidden}`, so there is no
// scrollbar and no scroll position — scrollIntoView is a no-op. Past the cap the card simply
// hangs off both ends and the parts outside are gone. At 480×236 CSS px — Chrome at 400% zoom on
// a maximised 1080p window, the zoom level WCAG 2.1 SC 1.4.10 asks to work — the dialog title sat
// at y −3.8 and the Save button's bottom edge 3.8px below the fold, both unreachable. That is the
// bug; it is a desktop-only one (phones are portrait-locked and iPad landscape is ~768px tall).
// The fix is the app's own scroll-region recipe (components/scrollRegion), NOT a bare max-h — a
// bare cap clips with no sign that anything scrolls, which is worse than the overflow it hides:
//   • the card caps against the VIEWPORT in the app's own fluid units — 100dvh less a 2rem
//     cushion, i.e. the same 1rem the scrim already insets on the left and right, so the card is
//     inset equally on all four sides. Not px: a px cushion cannot match a rem inset under a
//     clamp()-fluid root (the reason tests/heightGuard.test.js exists at all), and this is the
//     same 100dvh-minus-rem calc the ⚙ popover caps itself with.
//   • the four editable ROWS are what gives — a real scroll region on the shared tokens, so it
//     arrives with the px-4 scrollbar lane inside the scroller and the fade-scroll-* edge masks.
//   • the TITLE block and the NOTE + BUTTON row stay outside it, held by shrink-0. The bug was
//     Cancel/Save going off-screen; putting them in the scroller would only have made them
//     scroll-to-reach. They are also the two boundary surfaces the edge hook shades: a fixed
//     header above content that scrolls takes elev-shadow-down and a fixed footer below it
//     elev-shadow-up (the directional scroll-boundary language, never the card's own even
//     `0 0 8px` lift — see the note at the ⚙ popover in main.tsx). Both are UNCONDITIONAL classes
//     whose strength is the --shade the hook writes, and it writes 0 when there is nothing to
//     scroll — so on every screen tall enough to hold the card, which is every ordinary one, this
//     whole treatment renders exactly the card that shipped before it.
import { useRef } from 'react'
import type { PrefDefaults } from '../store/userDefaults.js'
import { normalizeAoxN } from '../store/userDefaults.js'
import { NUM_INPUT_BASE, NUM_INPUT_CLASS } from './controlClasses.js'
import { SCROLL_REGION_CLASS, scrollFadeClass, useScrollEdgeState } from './scrollRegion.js'
import { fmtBlitzT, fmtFlashT, SLIDER_READOUT_WIDEST } from '../lib/modeFormat.js'
import SliderValueEditor from './SliderValueEditor.jsx'

const NUM_INPUT_DIRTY_CLASS = NUM_INPUT_BASE + ' btn-solid border border-transparent'
function DefaultsCard({
  cardRef,
  titleId,
  title,
  subline,
  note,
  manage = false,
  prefs,
  seed,
  setPrefs,
  onClose,
  onSave,
}: {
  cardRef: React.RefObject<HTMLDivElement | null>
  titleId: string
  title: string
  subline?: string
  note?: string
  manage?: boolean
  prefs: PrefDefaults
  seed: PrefDefaults
  setPrefs: React.Dispatch<React.SetStateAction<PrefDefaults>>
  onClose: () => void
  onSave: () => void
}) {
  const dirtyAox = normalizeAoxN(prefs.aoxN) !== normalizeAoxN(seed.aoxN)
  const dirtyFlash = prefs.flashMs !== seed.flashMs
  const dirtyBlitz = prefs.blitzSec !== seed.blitzSec
  const dirtyQ = prefs.blitzQSec !== seed.blitzQSec
  const dirty = dirtyAox || dirtyFlash || dirtyBlitz || dirtyQ
  const commitAoxN = () => setPrefs((p) => ({ ...p, aoxN: normalizeAoxN(p.aoxN) }))
  // The scroll region and its two boundary surfaces (see the height-cap note at the top).
  // `active` is the literal true, and honestly so: this component only exists while its modal is
  // open, so there is no open flag to gate on and nothing for a changing identity to re-attach
  // to. Everything that CAN move the edge answer while it is mounted moves the region's own box —
  // the footnote appearing and the button row going from one control to two as the card turns
  // dirty — and observeScrollExtent inside the hook watches the box and its children for exactly
  // that.
  const rowsRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const footRef = useRef<HTMLDivElement>(null)
  const { scrolledFromTop, atBottom } = useScrollEdgeState(rowsRef, true, headRef, footRef)
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ boxShadow: '0 0 8px rgba(0,0,0,0.12)' }}
      className="card rounded-2xl py-4 w-full max-w-[20rem] space-y-3 flex flex-col max-h-[calc(100dvh_-_2rem)] focus:outline-hidden"
    >
      {/* The three space-y-3 rhythms below reproduce the single card-level one the flat card had:
          title→subline, the gaps between the four rows, and note→buttons were all this same gap,
          and grouping them under the header / scroller / footer changes none of them. */}
      <div ref={headRef} className="elev-shadow-down shrink-0 px-4 space-y-3">
        <div id={titleId} className="text-sm font-semibold text-(--tx-50)">
          {title}
        </div>
        {subline && <div className="text-xs text-(--tx-200-80)">{subline}</div>}
      </div>
      <div
        ref={rowsRef}
        className={`${SCROLL_REGION_CLASS} min-h-0 space-y-3 ${scrollFadeClass(scrolledFromTop, atBottom)}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-(--tx-200-80) shrink-0">AoX Run Length</span>
          {/* The Escape branch STOPS PROPAGATION: it blurs the field, and without the stop the
                same native event would reach the document-level settings Escape handler AFTER the
                blur — its input-has-focus skip no longer applies, and it would slam the whole
                panel (and this popup) shut on what the user meant as a keyboard dismiss. */}
          {manage ? (
            <SliderValueEditor
              value={+normalizeAoxN(prefs.aoxN)}
              min={2}
              max={1000}
              snap={1}
              accent={dirtyAox}
              inputMode="numeric"
              label="AoX Run Length"
              editLabel="AoX Run Length"
              format={String}
              toText={String}
              widest="1000"
              onCommit={(v) => setPrefs((p) => ({ ...p, aoxN: String(v) }))}
            />
          ) : (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="AoX Run Length"
              value={prefs.aoxN}
              onChange={(e) => {
                const v = e.target.value
                if (v === '' || /^\d*$/.test(v)) setPrefs((p) => ({ ...p, aoxN: v }))
              }}
              onBlur={commitAoxN}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitAoxN()
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                  e.stopPropagation()
                  commitAoxN()
                  e.currentTarget.blur()
                }
              }}
              className={`${dirtyAox ? NUM_INPUT_DIRTY_CLASS : NUM_INPUT_CLASS} py-1 w-14 shrink-0`}
            />
          )}
        </div>
        <div className="space-y-1">
          <div className="text-xs text-(--tx-200-80)">Flash Speed</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              aria-label="Flash Speed"
              value={prefs.flashMs}
              onChange={(e) => {
                const v = +e.target.value
                setPrefs((p) => ({ ...p, flashMs: v }))
              }}
              style={
                {
                  '--rng-fill': Math.round(((prefs.flashMs - 100) / 4900) * 100) + '%',
                } as React.CSSProperties
              }
              className="flex-1"
            />
            <SliderValueEditor
              value={prefs.flashMs}
              min={100}
              max={5000}
              snap={100}
              accent={dirtyFlash}
              inputMode="decimal"
              label="Flash Speed"
              format={fmtFlashT}
              toText={(v) => String(v / 1000)}
              fromText={(n) => n * 1000}
              widest={SLIDER_READOUT_WIDEST}
              onCommit={(v) => setPrefs((p) => ({ ...p, flashMs: v }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-(--tx-200-80)">Blitz Round Timer</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="10"
              max="300"
              step="5"
              aria-label="Blitz Round Timer"
              value={prefs.blitzSec}
              onChange={(e) => {
                const v = +e.target.value
                setPrefs((p) => ({ ...p, blitzSec: v }))
              }}
              style={
                {
                  '--rng-fill': Math.round(((prefs.blitzSec - 10) / 290) * 100) + '%',
                } as React.CSSProperties
              }
              className="flex-1"
            />
            <SliderValueEditor
              value={prefs.blitzSec}
              min={10}
              max={300}
              snap={5}
              accent={dirtyBlitz}
              inputMode="numeric"
              label="Blitz Round Timer"
              format={fmtBlitzT}
              toText={String}
              widest={SLIDER_READOUT_WIDEST}
              onCommit={(v) => setPrefs((p) => ({ ...p, blitzSec: v }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-(--tx-200-80)">Blitz Question Timer</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="1"
              max="30"
              step="0.5"
              aria-label="Blitz Question Timer"
              value={prefs.blitzQSec}
              onChange={(e) => {
                const v = +e.target.value
                setPrefs((p) => ({ ...p, blitzQSec: v }))
              }}
              style={
                {
                  '--rng-fill': Math.round(((prefs.blitzQSec - 1) / 29) * 100) + '%',
                } as React.CSSProperties
              }
              className="flex-1"
            />
            <SliderValueEditor
              value={prefs.blitzQSec}
              min={1}
              max={30}
              snap={0.5}
              accent={dirtyQ}
              inputMode="decimal"
              label="Blitz Question Timer"
              format={(v) => v + 's'}
              toText={String}
              widest={SLIDER_READOUT_WIDEST}
              onCommit={(v) => setPrefs((p) => ({ ...p, blitzQSec: v }))}
            />
          </div>
        </div>
      </div>
      <div ref={footRef} className="elev-shadow-up shrink-0 px-4 space-y-3">
        {manage &&
          (dirty ? (
            <div className="text-[11px] text-(--tx-300-60)">
              Saving here updates only these values.
            </div>
          ) : note ? (
            <div className="text-[11px] text-(--tx-300-60)">{note}</div>
          ) : null)}
        {!manage || dirty ? (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-xl text-sm font-medium border surface-toggle text-(--tx-100-80)"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className="flex-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-3 py-2 rounded-xl text-sm font-medium border surface-toggle text-(--tx-100-80)"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DefaultsCard
