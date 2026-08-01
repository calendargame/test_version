// DefaultsCard — the Save/View saved-defaults popup body: a read-only view of the stored
// per-mode defaults, or an editable manager with dirty-row highlighting. Extracted verbatim from
// main.tsx (Q1 phase 1), together with NUM_INPUT_DIRTY_CLASS, which exists only for this card
// (it was deliberately defined beside it rather than with the other input tokens).
import type { PrefDefaults } from '../store/userDefaults.js'
import { normalizeAoxN } from '../store/userDefaults.js'
import { NUM_INPUT_BASE, NUM_INPUT_CLASS } from './controlClasses.js'
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
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{ boxShadow: '0 0 8px rgba(0,0,0,0.12)' }}
      className="card rounded-2xl p-4 w-full max-w-[20rem] space-y-3 focus:outline-hidden"
    >
      <div id={titleId} className="text-sm font-semibold text-(--tx-50)">
        {title}
      </div>
      {subline && <div className="text-xs text-(--tx-200-80)">{subline}</div>}
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
  )
}

export default DefaultsCard
