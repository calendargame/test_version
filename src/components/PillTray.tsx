import type { ReactNode } from 'react'

// PillTray — the ⚙ Settings panel's segmented picker: one "concentric housing" tray of
// mutually-exclusive pill segments. Extracted from the Date Format groups (Round-3, rebuilt
// FLUSH Round-4) when the Theme rows adopted the same idiom (round-8), so the recipe below
// lives in ONE place instead of being re-typed per group.
//
// THE CONCENTRIC HOUSING IDIOM (why these exact classes):
// The container draws the whole frame (border + surface-tray, NO padding, NO overflow-hidden)
// and each borderless segment carries a CONCENTRIC radius — calc(var(--radius-xl) - 1px), the
// housing's rounded-xl minus its 1px border — so a selected btn-solid segment's fill arc traces
// the housing's inner edge exactly. (Equal radii offset by the border diverge ~0.41px at 45°,
// leaving a hairline tray-colored crescent at every flush corner — visible at 3x device pixel
// ratio.) Pressing a segment reads exactly like pressing the Buttons chip (clean flush accent
// fill, no visible seam), with uniform rounding on all four corners even where a corner isn't
// flush. Unselected segments are transparent — the tray surface shows through, visible on its
// own only in the 2px gap-0.5 seams between segments. Still RING-SAFE: with no overflow-hidden
// the inset press-drag ring follows each segment's own radius instead of being clipped square
// (the Round-2 defect that unfused the originals). Height sits at the popover one-height control
// tier: segment text-xs + py-1.5 (~27.7px) + the housing's 1px top/bottom borders ≈ 29.7px = the
// Buttons/Dots chip height (no other padding may sneak in).
//
// PURELY PRESENTATIONAL: the tray owns the segments' radio semantics (role="radio" +
// aria-checked) but NOT the group's. The CALLER wraps it with role="radiogroup" + aria-label —
// and the group is the CHOICE, not the tray: where two trays read and write one setting (the
// Written/Numeric date formats, and the two theme rows while Use System is off) ONE radiogroup
// spans both, because a group whose radios are all unchecked while the real selection sits in a
// sibling group tells assistive tech something false. Which is also why `ariaLabel` exists below:
// two trays inside one group can repeat a visible label ('MDY' appears in both date-format
// trays), and radios in a group must be tellable apart by name.
//
// WIDTH: flex-1 segments split the tray evenly. flex items are min-width:auto, so an over-long
// label pushes the tray WIDER rather than truncating — the shipped label sets clear ~40% of
// headroom on the narrowest realistic phone, and new labels must keep it.
//
// Generic in the option value so call sites pass their store's own union type (FormatId, a
// theme id) with no cast at either end.

// The bordered housing. No padding and no overflow-hidden — both would break the flush fill
// and the press-drag ring (see the idiom note above).
const TRAY_CLASS = 'flex gap-0.5 border surface-tray rounded-xl'
// One segment: borderless, flex-1, concentric radius, popover control tier.
const SEGMENT_CLASS =
  'flex-1 px-1.5 py-1.5 rounded-[calc(var(--radius-xl)-1px)] text-xs font-medium'
const SEGMENT_ON_CLASS = 'btn-solid'
const SEGMENT_OFF_CLASS = 'text-(--tx-100-80) hover:bg-(--stgl-hov)'

export interface PillTrayOption<T extends string> {
  value: T
  label: ReactNode
  // Accessible name, when the visible label alone would be ambiguous inside its radiogroup. It
  // must CONTAIN the visible label ('MDY' → 'Written MDY'), so speaking the visible word still
  // activates the right pill for voice control (WCAG 2.5.3 Label in Name).
  ariaLabel?: string
}

export function PillTray<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: T
  onChange: (value: T) => void
  options: PillTrayOption<T>[]
  // Locked state. The CALLER still owns the visible dim (its wrapper's
  // opacity-60 pointer-events-none, which must cover the caption too); this prop closes the two
  // gaps that wrapper leaves — it publishes the lock to assistive tech (aria-disabled, matching
  // the Input picker's long-standing treatment) and guards onChange, so a click dispatched past
  // pointer-events-none (a synthetic event, a stray AT activation) cannot change the value.
  disabled?: boolean
}) {
  return (
    <div className={TRAY_CLASS}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) onChange(o.value)
          }}
          className={`${SEGMENT_CLASS} ${o.value === value ? SEGMENT_ON_CLASS : SEGMENT_OFF_CLASS}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
