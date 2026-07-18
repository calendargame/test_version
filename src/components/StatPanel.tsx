import { useRef, useLayoutEffect, useEffect } from 'react'
import type { ElementType, ReactNode, Ref } from 'react'
import { fitScale } from '../lib/statFit.js'

// StatPanel — the horizontal stats strip (Score / Accuracy / Streak / Last /
// Average / Median) shown under the header in the timed/scored modes.
//
// Pure presentational shell: it renders whatever `stats` array it's given (each item
// {label, value, fn?, off?}) as equal-width cells separated by thin dividers.
// A cell with `fn` renders as a button; `off` strikes through the label and
// shows an em dash.
//
// VALUE AUTO-FIT (Q3): each value box AUTO-FITS — a per-box measure-and-scale keeps any value, however
// long (a big Score "12345/67890", a long solve time), inside its own cell on every device, while short
// values stay at the normal size. The math is in fitScale; the wiring is the layout effect below. It
// replaced a tiered char-count shrink that only ran on fractional values and triggered on the longest
// SIDE (so "123/456" didn't shrink but the narrower "1000/2" did), and never shrank the time boxes.
//
// `armedSpan` is the Bug-#4 affordance: when present it replaces stats[startIdx..endIdx] with one wide
// "Enable and Reset Stats?" confirmation button, using two 1px phantom spacers so the surrounding flex
// math (and the Streak-right divider position) stays pixel-identical.
//
// Extracted from main.jsx in Stage C, Step 4b. ⚠ The label's className keeps a SPACE before `${s.off…}`
// (`whitespace-nowrap ${`). It's required: Tailwind v4's source scanner silently drops any utility glued
// directly to `${` when that class appears nowhere else, which made the stat labels wrap. Don't "tidy"
// the space away. (Calendar Game layout bug-fix, 2026-06-01.)
export interface StatItem {
  label: string
  value: string | number
  fn?: (() => void) | null //  null = the stat is present but non-interactive (Save Stats off / non-toggleable mode)
  off?: boolean
}
export interface ArmedSpan {
  startIdx: number
  endIdx: number
  label: ReactNode
  onClick?: () => void
}

// The armed-button ref is passed SEPARATELY from `armedSpan` (not nested inside it). Bundling a ref into
// a data object makes React's compiler treat every read of that object as a ref access during render, so
// it's kept apart: `armedSpan` is plain data, `armedBtnRef` is the ref, forwarded straight to the
// button's `ref=` (an allowed use).
export default function StatPanel({
  stats,
  armedSpan,
  armedBtnRef,
}: {
  stats: StatItem[]
  armedSpan?: ArmedSpan | null
  armedBtnRef?: Ref<HTMLButtonElement>
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Auto-fit every value box to its width: reset each value to the base font, measure its natural width
  // vs its cell's width, then set a font-size that fits (capped at the base). Batched (reset-all →
  // measure-all → apply-all) to avoid layout thrash. Runs after layout but BEFORE paint (useLayoutEffect)
  // so there's never a flash of oversized text; re-runs on a panel resize (ResizeObserver) and on
  // web-font load. `min-w-0` on the cells keeps each box at its 1/N share during the measure (a long
  // value overflows the fixed cell instead of widening it, so cell.clientWidth is the true target). In
  // jsdom (no layout → widths 0) fitScale returns 1, so this is a no-op and the value renders at base.
  const fitAll = () => {
    const root = rootRef.current
    if (!root) return
    const spans = Array.from(root.querySelectorAll<HTMLElement>('[data-statval]'))
    spans.forEach((s) => {
      s.style.fontSize = '' // reset all to the base (text-sm) BEFORE measuring (avoids a feedback loop)
    })
    const measured = spans.map((s) => ({
      s,
      natural: s.scrollWidth,
      avail: (s.parentElement?.clientWidth ?? 0) - 8, // a little breathing room from the dividers
      base: parseFloat(getComputedStyle(s).fontSize) || 0,
    }))
    measured.forEach(({ s, natural, avail, base }) => {
      const scale = fitScale(natural, avail)
      s.style.fontSize = scale < 1 && base > 0 ? `${base * scale}px` : ''
    })
  }
  // No deps: the values can change on any render, so re-fit each time (cheap — a handful of spans, batched).
  useLayoutEffect(() => {
    fitAll()
  })
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => fitAll())
    ro.observe(root)
    let cancelled = false
    if (typeof document !== 'undefined' && document.fonts?.ready)
      document.fonts.ready.then(() => {
        if (!cancelled) fitAll()
      })
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={rootRef} className="mt-4 rounded-2xl panel flex overflow-hidden">
      {(() => {
        const items: ReactNode[] = []
        for (let i = 0; i < stats.length; i++) {
          if (armedSpan && i === armedSpan.startIdx) {
            const span = armedSpan.endIdx - armedSpan.startIdx + 1
            // Bug #4 aesthetic: no ring or rounded corners on the merged warning button. The text change
            // ('Enable and Reset Stats?') is the sole visual cue. The standard vertical divider between
            // Streak and this button is already present (it was the Streak|Last divider in unarmed state)
            // — no element positions shift between armed and unarmed states.
            //
            // Phantom spacers: when the 3 time stat boxes merge into 1 warning button, 2 internal dividers
            // (Last|Avg and Avg|Med) disappear from the flex row. Without compensation, those 2px get
            // redistributed across the remaining flex items, shifting the Streak-right divider 1px right
            // and stretching every box before it. Two 1px-wide transparent spacers — one before, one after
            // the button — restore exact unarmed flex math: Streak-right divider is locked in place and the
            // warning text sits exactly centered between that divider and the panel's right edge.
            items.push(<div key="armed-spacer-l" className="w-px shrink-0" />)
            items.push(
              <button
                key="armed-warning"
                ref={armedBtnRef}
                type="button"
                onClick={armedSpan.onClick}
                style={{ flex: span }}
                className="flex items-center justify-center py-2 text-xs font-medium"
              >
                {armedSpan.label}
              </button>,
            )
            items.push(<div key="armed-spacer-r" className="w-px shrink-0" />)
            if (armedSpan.endIdx < stats.length - 1) {
              items.push(
                <div
                  key={`d-armed-${i}`}
                  className="w-px h-8 self-center bg-(--bg-500-20) shrink-0"
                />,
              )
            }
            i = armedSpan.endIdx
            continue
          }
          const s = stats[i]
          const Tag: ElementType = s.fn ? 'button' : 'div'
          const props = s.fn ? { type: 'button' as const, onClick: s.fn } : {}
          items.push(
            <Tag
              key={s.label}
              {...props}
              className="flex-1 min-w-0 flex flex-col items-center py-2 gap-0.5"
            >
              <span
                className={`text-xs text-(--tx-200-80) leading-none whitespace-nowrap ${s.off ? ' strike-center' : ''}`}
              >
                {s.label}
              </span>
              {/* data-statval: the auto-fit target. text-sm is the base size; the layout effect shrinks
                  the inline font-size to fit when the value is too wide. The text stays plain DOM text,
                  so it reads normally to screen readers. */}
              <span
                data-statval
                className="text-sm font-semibold tabular-nums leading-tight mt-0.5"
              >
                {s.off ? '—' : s.value}
              </span>
            </Tag>,
          )
          if (i < stats.length - 1) {
            items.push(
              <div key={`d-${i}`} className="w-px h-8 self-center bg-(--bg-500-20) shrink-0" />,
            )
          }
        }
        return items
      })()}
    </div>
  )
}
